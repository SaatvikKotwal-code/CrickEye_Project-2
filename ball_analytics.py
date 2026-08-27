"""
Ball Analytics — YOLO tracking, single-camera speed estimate, length zones, pitch plot.

Designed for front-on / batter-facing net footage. All physics are ESTIMATES with
explicit reliability scores — see readme.md "Ball Analytics Module".
"""

from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import time
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np

try:
    import cv2
except ImportError:  # pragma: no cover
    cv2 = None  # type: ignore

logger = logging.getLogger("ball_analytics")

BASE_DIR = Path(__file__).resolve().parent


def _quiet_console() -> bool:
    return os.environ.get("CRICKEYE_QUIET", "").strip().lower() in ("1", "true", "yes")

# --- Defaults (override via env) ---
def _fenv(key: str, default: float) -> float:
    v = os.getenv(key)
    if v is None or v.strip() == "":
        return default
    try:
        return float(v)
    except ValueError:
        return default


def _ienv(key: str, default: int) -> int:
    v = os.getenv(key)
    if v is None or v.strip() == "":
        return default
    try:
        return int(float(v))
    except ValueError:
        return default


def _benv(key: str, default: bool) -> bool:
    v = os.getenv(key)
    if v is None:
        return default
    return v.strip().lower() in ("1", "true", "yes", "on")


def _senv(key: str, default: str) -> str:
    v = os.getenv(key)
    return v.strip() if v else default


# Length zones (metres from striker's stumps along pitch).
# Halfway = 11 yd ≈ 10.06 m per Law 7 (22 yd pitch); short zone runs to calibration length.
_YD = 0.9144
HALF_PITCH_FROM_STRIKER_M = 11.0 * _YD  # 10.0584

LENGTH_BOUNDS_M = {
    "yorker": (0.0, 2.0),
    "full": (2.0, 6.0),
    "good_length": (6.0, 8.0),
    "short": (8.0, HALF_PITCH_FROM_STRIKER_M),
}


@dataclass
class PaceConfig:
    slow_max_kmh: float = 85.0
    medium_max_kmh: float = 110.0
    very_fast_min_kmh: float = 130.0
    use_very_fast: bool = False


def pace_band_label(speed_kmh: Optional[float], cfg: PaceConfig) -> str:
    if speed_kmh is None or math.isnan(speed_kmh):
        return "unknown"
    if speed_kmh < cfg.slow_max_kmh:
        return "slow"
    if speed_kmh < cfg.medium_max_kmh:
        return "medium"
    if cfg.use_very_fast and speed_kmh >= cfg.very_fast_min_kmh:
        return "very_fast"
    return "fast"


def pace_config_from_env() -> PaceConfig:
    # Net / training defaults (softer than broadcast radar); override for club/pro.
    return PaceConfig(
        slow_max_kmh=_fenv("PACE_SLOW_MAX_KMH", 75.0),
        medium_max_kmh=_fenv("PACE_MEDIUM_MAX_KMH", 95.0),
        very_fast_min_kmh=_fenv("PACE_VERY_FAST_MIN_KMH", 120.0),
        use_very_fast=_benv("PACE_USE_VERY_FAST", False),
    )


# Align with analyse_session CONF_THRESHOLD for "confirmed" shots
CONFIRMED_SHOT_CONF = 0.30


def _path_length_px(frames: List[Tuple]) -> float:
    if len(frames) < 2:
        return 0.0
    s = 0.0
    for i in range(1, len(frames)):
        x1, y1 = float(frames[i - 1][1]), float(frames[i - 1][2])
        x2, y2 = float(frames[i][1]), float(frames[i][2])
        s += math.hypot(x2 - x1, y2 - y1)
    return s


def _is_moving_ball_segment(
    frames: List[Tuple],
    frame_w: int,
    frame_h: int,
) -> bool:
    """Drop static background false positives: require meaningful centroid motion.

    Tuned filters (v2.1 — slightly relaxed for net footage):
    - min_path: total cumulative path must exceed ~1.8% of frame diagonal
    - min_step: median per-frame displacement ≥1.2 px (still rejects jitter)
    - net displacement ratio: start→end ≥12% of path (rejects oscillating FPs)
    """
    if len(frames) < 3:
        return False
    diag = math.hypot(float(frame_w), float(frame_h))
    min_path = _fenv("BALL_MIN_PATH_PX", max(14.0, 0.011 * diag))
    min_step = _fenv("BALL_MIN_STEP_PX", 0.55)
    plen = _path_length_px(frames)
    if plen < min_path:
        return False

    steps = []
    for i in range(1, len(frames)):
        x1, y1 = float(frames[i - 1][1]), float(frames[i - 1][2])
        x2, y2 = float(frames[i][1]), float(frames[i][2])
        steps.append(math.hypot(x2 - x1, y2 - y1))
    med = float(np.median(np.array(steps))) if steps else 0.0
    if med < min_step:
        return False

    # Net displacement: start → end must be at least 12% of path length.
    # Static jitter has high path but near-zero net displacement.
    sx, sy = float(frames[0][1]), float(frames[0][2])
    ex, ey = float(frames[-1][1]), float(frames[-1][2])
    net_disp = math.hypot(ex - sx, ey - sy)
    min_net_ratio = _fenv("BALL_MIN_NET_DISP_RATIO", 0.04)
    if plen > 0 and (net_disp / plen) < min_net_ratio:
        return False

    return True


def _best_moving_segment_for_peak(
    segments: List[Dict[str, Any]],
    peak_frame: int,
    pad: int,
) -> Optional[Dict[str, Any]]:
    """Pick the moving track whose time span best contains the shot peak."""
    best = None
    best_score = -1e18
    for seg in segments:
        s0, s1 = int(seg["start_frame"]), int(seg["end_frame"])
        lo, hi = s0 - pad, s1 + pad
        if not (lo <= peak_frame <= hi):
            continue
        inside = 1.0 if s0 <= peak_frame <= s1 else 0.55
        mid = 0.5 * (s0 + s1)
        span = max(s1 - s0, 1)
        dist_pen = abs(peak_frame - mid) / span
        score = inside * 1000.0 - dist_pen * 100.0 + min(seg["frame_count"], 60) * 0.5
        if score > best_score:
            best_score = score
            best = seg
    return best


def _merge_tracks_to_timeline(
    tracks: Dict[int, List[Tuple[int, float, float, float, float, float]]],
) -> List[Tuple[int, float, float, float, float, float]]:
    """Merge all YOLO tracks into one time-ordered list; same-frame → keep max conf."""
    rows: List[Tuple[int, float, float, float, float, float]] = []
    for _tid, frs in tracks.items():
        rows.extend(frs)
    rows.sort(key=lambda x: x[0])
    if not rows:
        return []
    out: List[Tuple[int, float, float, float, float, float]] = []
    cur_f = -1
    best: Optional[Tuple[int, float, float, float, float, float]] = None
    for row in rows:
        f = int(row[0])
        if f != cur_f:
            if best is not None:
                out.append(best)
            best = row
            cur_f = f
        else:
            if best is not None and float(row[5]) > float(best[5]):
                best = row
    if best is not None:
        out.append(best)
    return out


def _exclusive_frame_windows_for_peaks(
    peak_frames: List[int],
    max_frame_idx: int,
) -> List[Tuple[int, int]]:
    """
    One non-overlapping [L,R] per peak (midpoints between consecutive peaks),
    intersected with [peak-pre, peak+post] so each shot gets its own ball window.
    """
    n = len(peak_frames)
    if n == 0:
        return []
    pre = _ienv("BALL_SHOT_BALL_PRE_FRAMES", 52)
    post = _ienv("BALL_SHOT_BALL_POST_FRAMES", 24)
    min_w = _ienv("BALL_SHOT_MIN_WINDOW_FRAMES", 28)

    out: List[Tuple[int, int]] = []
    for i, pf in enumerate(peak_frames):
        lm = 0 if i == 0 else (peak_frames[i - 1] + pf) // 2
        rm = max_frame_idx if i == n - 1 else (pf + peak_frames[i + 1]) // 2
        L = max(lm, pf - pre)
        R = min(rm, pf + post)
        if L > R:
            L, R = lm, min(rm, max_frame_idx)
        if R - L + 1 < min_w:
            need = min_w - (R - L)
            half = need // 2
            L = max(lm, L - half)
            R = min(rm, R + (need - half))
        L = max(0, min(L, max_frame_idx))
        R = max(L, min(R, max_frame_idx))
        out.append((L, R))
    return out


def _segment_from_timeline_slice(
    timeline: List[Tuple[int, float, float, float, float, float]],
    L: int,
    R: int,
    track_id: int,
) -> Optional[Dict[str, Any]]:
    frames = [t for t in timeline if L <= int(t[0]) <= R]
    if not frames:
        return None
    return {
        "track_id": track_id,
        "start_frame": int(frames[0][0]),
        "end_frame": int(frames[-1][0]),
        "frame_count": len(frames),
        "frames": frames,
    }


def classify_length_zone(
    distance_m: Optional[float],
    *,
    bounce_confidence: float,
    full_toss: bool,
) -> Dict[str, Any]:
    """Map distance from striker (m) to a length label. Always returns a concrete zone (no 'uncertain')."""
    if full_toss and bounce_confidence < 0.35:
        dm = distance_m
        if dm is None or (isinstance(dm, float) and math.isnan(dm)):
            dm = 0.8
        return {
            "label": "full_toss",
            "distance_m": round(float(dm), 4),
            "confidence": 0.55,
            "uncertain": False,
            "reason": "Classified as full toss from trajectory (weak bounce signal).",
        }

    eff = distance_m
    if eff is None or (isinstance(eff, float) and math.isnan(eff)):
        eff = 4.0
    d = float(np.clip(eff, 0.0, 50.0))
    if d < LENGTH_BOUNDS_M["yorker"][1]:
        lbl = "yorker"
    elif d < LENGTH_BOUNDS_M["full"][1]:
        lbl = "full"
    elif d < LENGTH_BOUNDS_M["good_length"][1]:
        lbl = "good_length"
    elif d < LENGTH_BOUNDS_M["short"][1]:
        lbl = "short"
    else:
        lbl = "short"

    conf = float(np.clip(0.28 + 0.72 * max(0.0, bounce_confidence), 0.25, 1.0))
    return {
        "label": lbl,
        "distance_m": round(d, 4),
        "confidence": round(conf, 4),
        "uncertain": False,
        "reason": None,
    }


def segment_deliveries(
    track_segments: List[Dict[str, Any]],
    *,
    max_frame_gap: int,
    min_track_frames: int,
) -> List[Dict[str, Any]]:
    """
    Each item in track_segments: {track_id, frames: [(f, cx, cy, w, h, conf), ...]}
    Split on large gaps; filter short tracks.
    """
    deliveries: List[Dict[str, Any]] = []
    for seg in track_segments:
        frames = sorted(seg["frames"], key=lambda x: x[0])
        if not frames:
            continue
        chunks: List[List[Tuple]] = []
        cur: List[Tuple] = []
        for row in frames:
            if not cur:
                cur.append(row)
                continue
            if row[0] - cur[-1][0] > max_frame_gap:
                chunks.append(cur)
                cur = [row]
            else:
                cur.append(row)
        if cur:
            chunks.append(cur)
        for ch in chunks:
            if len(ch) < min_track_frames:
                continue
            f0, f1 = ch[0][0], ch[-1][0]
            deliveries.append(
                {
                    "track_id": seg["track_id"],
                    "start_frame": int(f0),
                    "end_frame": int(f1),
                    "frame_count": len(ch),
                    "frames": ch,
                }
            )
    deliveries.sort(key=lambda d: d["start_frame"])
    return deliveries


def _smooth_1d(x: np.ndarray, k: int = 5) -> np.ndarray:
    if len(x) < k:
        return x
    pad = k // 2
    xp = np.pad(x.astype(float), (pad, pad), mode="edge")
    kernel = np.ones(k) / k
    return np.convolve(xp, kernel, mode="valid")


def estimate_bounce(
    points_px: Sequence[Tuple[float, float]],
) -> Tuple[Optional[int], float, str]:
    """
    Curvature / direction-change heuristic on the 2D path.
    Returns (frame_index_in_points, confidence 0-1, note).
    """
    n = len(points_px)
    if n < 6:
        return None, 0.0, "too_few_points"

    pts = np.array(points_px, dtype=float)
    bend = np.zeros(n - 2)
    for i in range(1, n - 1):
        v1 = pts[i] - pts[i - 1]
        v2 = pts[i + 1] - pts[i]
        n1 = np.linalg.norm(v1) + 1e-6
        n2 = np.linalg.norm(v2) + 1e-6
        c = float(np.clip(np.dot(v1, v2) / (n1 * n2), -1.0, 1.0))
        bend[i - 1] = 1.0 - c  # 0 straight, ~1 sharp turn

    kb = min(5, len(bend))
    if kb % 2 == 0:
        kb = max(1, kb - 1)
    bend_s = _smooth_1d(bend, kb) if len(bend) >= 3 else bend
    bi = int(np.argmax(bend_s)) + 1
    peak = float(bend_s.max())
    conf = float(np.clip(peak / 0.35, 0.0, 1.0))
    if peak < 0.08:
        return None, float(np.clip(peak / 0.08, 0.0, 0.25)), "low_curvature"
    return bi, conf, "curvature_peak"


def _axis_calibration(frame_w: int, frame_h: int) -> Tuple[np.ndarray, np.ndarray, float]:
    """Returns A_px, B_px, segment_m from env (normalized A/B + CALIB_SEGMENT_M)."""
    # Real-world default preset for front-on net videos:
    # A = batter-end stumps region, B = away from batter along pitch centerline.
    # 10.06 m ~= half-pitch (stumps to halfway on a 22-yard pitch).
    ax = _fenv("CALIB_AX_A_X", 0.50)
    ay = _fenv("CALIB_AX_A_Y", 0.88)
    bx = _fenv("CALIB_AX_B_X", 0.50)
    by = _fenv("CALIB_AX_B_Y", 0.18)
    seg_m = _fenv("CALIB_SEGMENT_M", HALF_PITCH_FROM_STRIKER_M)
    A = np.array([ax * frame_w, ay * frame_h], dtype=float)
    B = np.array([bx * frame_w, by * frame_h], dtype=float)
    return A, B, seg_m


def _project_along_axis(P: np.ndarray, A: np.ndarray, B: np.ndarray) -> float:
    v = B - A
    L2 = float(np.dot(v, v)) + 1e-9
    t = float(np.dot(P - A, v) / L2)
    return t


def _distance_from_batter_m(t: float, A: np.ndarray, B: np.ndarray, seg_m: float, batter_end: str) -> float:
    """t in [0,1] along A->B. batter_end 'A' => batter at A (t=0)."""
    t = float(np.clip(t, 0.0, 1.0))
    if batter_end.upper() == "A":
        return t * seg_m
    return (1.0 - t) * seg_m


def _robust_t_at_bounce(t_along: np.ndarray, bi: int) -> float:
    """Median projected t over frames near the bounce index.

    Single-frame bbox jitter often shifts t by enough to flip length zones (e.g. full vs good).
    Set BOUNCE_T_MEDIAN_WINDOW=0 to use only the peak frame.
    """
    w = max(0, _ienv("BOUNCE_T_MEDIAN_WINDOW", 2))
    if w == 0 or len(t_along) == 0:
        return float(np.clip(float(t_along[bi]), 0.0, 1.0))
    lo = max(0, bi - w)
    hi = min(len(t_along), bi + w + 1)
    return float(np.clip(float(np.median(t_along[lo:hi])), 0.0, 1.0))


def _speed_profile(
    ts: np.ndarray,
    t_along: np.ndarray,
    points_px: np.ndarray,
    seg_m: float,
    axis_px_len: float,
) -> Tuple[float, float, List[str]]:
    """
    Robust ball speed estimate:
    - Drop duplicate / gap frame pairs (bad dt) before differencing.
    - Per-frame speed from axis + 2D path (single-camera axis often under-reads).
    - Blend with whole-track (secant) speed so cumulative motion lifts typical under-reads.
    - Percentile + scale + sanity gates.
    """
    warnings: List[str] = []
    if len(ts) < 4:
        return float("nan"), 0.0, ["too_few_frames"]

    dt = np.diff(ts)
    da = np.diff(t_along)
    dp = np.linalg.norm(np.diff(points_px, axis=0), axis=1)
    axis_px_len = max(axis_px_len, 1.0)
    m_per_px = seg_m / axis_px_len

    dt_pos = dt[dt > 1e-9]
    med_dt = float(np.median(dt_pos)) if dt_pos.size else (1.0 / 30.0)
    fps_eff = float(np.clip(1.0 / max(med_dt, 1e-6), 12.0, 240.0))
    dt_min = max(0.35 / fps_eff, 1e-5)
    dt_max = max(med_dt * 6.0, 0.18)

    with np.errstate(divide="ignore", invalid="ignore"):
        v_axis = np.abs(da * seg_m) / (dt + 1e-9)
        v_2d = (dp * m_per_px) / (dt + 1e-9)

    valid = np.isfinite(v_axis) & np.isfinite(v_2d) & (dt > 0) & (dt >= dt_min) & (dt <= dt_max)
    if not np.any(valid):
        valid = np.isfinite(v_axis) & np.isfinite(v_2d) & (dt > 0)
        warnings.append("speed_dt_filter_relaxed")
    if not np.any(valid):
        return float("nan"), 0.15, ["sparse_motion"]
    v_axis = v_axis[valid]
    v_2d = v_2d[valid]
    dp_v = dp[valid]

    w2d = _fenv("BALL_SPEED_2D_WEIGHT", 0.92)
    w2d = float(np.clip(w2d, 0.5, 1.2))
    v_blend = np.maximum(v_axis, w2d * v_2d)
    if v_blend.size < 3:
        return float("nan"), 0.15, ["sparse_motion"]
    v_blend = _smooth_1d(v_blend, k=5 if v_blend.size >= 5 else 3)
    v_trim = v_blend[np.isfinite(v_blend) & (v_blend > 0.05)]
    if v_trim.size < 2:
        return float("nan"), 0.15, ["sparse_motion"]
    lo, hi = np.percentile(v_trim, [12.0, 92.0])
    v_blend = v_trim[(v_trim >= lo) & (v_trim <= hi)]
    if v_blend.size < 2:
        v_blend = v_trim

    speed_scale = _fenv("BALL_SPEED_SCALE", 1.30)
    speed_cap_kmh = _fenv("BALL_SPEED_CAP_KMH", 160.0)
    pct = _fenv("BALL_SPEED_PERCENTILE", 79.0)
    pct = float(np.clip(pct, 50.0, 95.0))
    if v_blend.size >= 8:
        pct = min(pct + 2.0, 90.0)
    spd_inst = float(np.percentile(v_blend, pct)) * 3.6 * speed_scale

    span_t = float(ts[-1] - ts[0])
    spd_sec = 0.0
    if span_t > 1e-6:
        axis_disp_m = abs(float(t_along[-1] - t_along[0])) * seg_m
        path_m = float(np.sum(dp_v)) * m_per_px
        v_sec_axis = (axis_disp_m / span_t) * 3.6 * speed_scale
        v_sec_path = (path_m / span_t) * 3.6 * speed_scale
        spd_sec = float(min(max(v_sec_axis, v_sec_path), speed_cap_kmh))

    sec_w = _fenv("BALL_SPEED_SECANT_BLEND", 0.42)
    sec_w = float(np.clip(sec_w, 0.0, 0.85))
    min_span = max(2.5 / fps_eff, 0.05)
    if span_t >= min_span and spd_sec > 1.0 and sec_w > 0:
        spd_comb = (1.0 - sec_w) * spd_inst + sec_w * max(spd_inst, spd_sec)
        if spd_comb > spd_inst * 1.04:
            warnings.append("speed_secant_blend")
        spd = float(min(spd_comb, speed_cap_kmh))
    else:
        spd = float(min(spd_inst, speed_cap_kmh))

    rel = 0.88

    total_px = float(np.sum(dp_v)) if dp_v.size else 0.0
    if total_px < 10:
        warnings.append("tiny_pixel_displacement")
        rel *= 0.55

    if np.std(v_blend) / (np.mean(v_blend) + 1e-6) > 0.65:
        warnings.append("high_speed_variance")
        rel *= 0.75
    if spd < 35:
        warnings.append("very_low_speed_estimate")
        rel *= 0.65
    if spd > speed_cap_kmh:
        warnings.append("speed_capped")
        spd = speed_cap_kmh
        rel *= 0.8
    return spd, float(np.clip(rel, 0.0, 1.0)), warnings


def _realistic_ball_speed_kmh(
    spd: float,
    warnings: List[str],
    reliability: float,
) -> Tuple[Optional[float], List[str], float]:
    """
    Post-process raw km/h: lift clearly under-read noisy tracks, then drop still-absurd values.

    Single-camera tracks often land far below plausible speeds (~8–30 km/h). We first
    blend noisy under-floor estimates toward BALL_SPEED_PLAUSIBLE_FLOOR_KMH, then
    discard anything still below BALL_SPEED_DISCARD_BELOW_KMH (e.g. static false positives).
    """
    w = list(warnings)
    rel = float(np.clip(reliability, 0.0, 1.0))

    if math.isnan(spd) or spd <= 0:
        return None, w, rel

    cap = _fenv("BALL_SPEED_CAP_KMH", 160.0)
    spd = float(min(spd, cap))

    if not _benv("BALL_SPEED_REALISM", True):
        return spd, w, rel

    floor = _fenv("BALL_SPEED_PLAUSIBLE_FLOOR_KMH", 52.0)
    blend_w = _fenv("BALL_SPEED_FLOOR_BLEND", 0.88)
    blend_w = float(np.clip(blend_w, 0.0, 1.0))
    risky = any(
        x in w
        for x in (
            "tiny_pixel_displacement",
            "very_low_speed_estimate",
            "high_speed_variance",
            "speed_secant_blend",
            "speed_dt_filter_relaxed",
        )
    )
    club_soft = _fenv("BALL_SPEED_CLUB_SOFT_FLOOR_KMH", 46.0)
    soft_min_raw = _fenv("BALL_SPEED_SOFT_FLOOR_MIN_RAW_KMH", 30.0)
    # Nudge before discard: net bowling rarely sustains < ~45–50 km/h for real pace.
    if spd < floor and risky:
        w.append("speed_adjusted_plausible_floor")
        spd = float(spd + blend_w * (floor - spd))
        spd = min(spd, cap)
        rel *= 0.82
    elif spd < club_soft and not risky and spd >= soft_min_raw:
        w.append("speed_adjusted_club_soft_floor")
        soft_b = _fenv("BALL_SPEED_SOFT_FLOOR_BLEND", 0.55)
        soft_b = float(np.clip(soft_b, 0.0, 1.0))
        spd = float(spd + soft_b * (club_soft - spd))
        spd = min(spd, cap)
        rel *= 0.9

    discard_below = _fenv("BALL_SPEED_DISCARD_BELOW_KMH", 24.0)
    if spd < discard_below:
        w.append("speed_discarded_sub_physical")
        return None, w, rel * 0.35

    return spd, w, rel


def _apply_session_ball_speed_rescale(
    deliveries: List[Dict[str, Any]],
    pace_cfg: PaceConfig,
) -> Optional[Dict[str, Any]]:
    """If matched speeds cluster below a plausible net median, scale the session once.

    Single-camera tracks often read low across an entire clip; this applies a single
    multiplicative factor (capped) so the session median approaches a coaching-realistic
    club-net pace. Disable with BALL_SPEED_SESSION_RESCALE=false.
    """
    if not _benv("BALL_SPEED_SESSION_RESCALE", True):
        return None
    target = _fenv("BALL_SPEED_SESSION_MEDIAN_TARGET_KMH", 70.0)
    trigger = _fenv("BALL_SPEED_SESSION_RESCALE_IF_MEDIAN_BELOW_KMH", 60.0)
    max_factor = _fenv("BALL_SPEED_SESSION_RESCALE_MAX_FACTOR", 1.62)
    min_factor = _fenv("BALL_SPEED_SESSION_RESCALE_MIN_FACTOR", 1.0)
    if target <= 1.0 or trigger <= 1.0:
        return None
    matched = [
        d
        for d in deliveries
        if d.get("ball_track_matched") and d.get("speed_kmh_est") is not None
    ]
    if len(matched) < 3:
        return None
    speeds = sorted(float(d["speed_kmh_est"]) for d in matched)
    med = float(speeds[len(speeds) // 2])
    if med >= trigger:
        return None
    factor = float(np.clip(target / max(med, 1.0), min_factor, max_factor))
    cap = _fenv("BALL_SPEED_CAP_KMH", 160.0)
    for d in deliveries:
        sk = d.get("speed_kmh_est")
        if sk is None:
            continue
        new_spd = float(min(float(sk) * factor, cap))
        d["speed_kmh_est"] = round(new_spd, 2)
        d["pace_band"] = pace_band_label(new_spd, pace_cfg)
        qf = d.get("quality_flags")
        if isinstance(qf, list) and "session_median_speed_rescale" not in qf:
            qf.append("session_median_speed_rescale")
    return {
        "applied": True,
        "factor": round(factor, 4),
        "median_before_kmh": round(med, 2),
        "median_target_kmh": round(target, 2),
        "trigger_below_kmh": trigger,
    }


def _match_shot(shot_log: List[Dict[str, Any]], start_f: int, end_f: int) -> Optional[int]:
    """Return shot_num / display num when peak_frame falls inside the delivery window."""
    best = None
    best_d = 1e9
    for s in shot_log:
        pf = s.get("peak_frame")
        if pf is None:
            continue
        pf = int(pf)
        if start_f <= pf <= end_f:
            d = abs(pf - (start_f + end_f) / 2)
            if d < best_d:
                best_d = d
                best = s.get("shot_num") or s.get("_display_num")
    return best


def _shot_conf(s: Dict[str, Any]) -> float:
    return float(s.get("conf") or s.get("confidence") or 0.0)


def _is_confirmed_shot(s: Dict[str, Any], thr: float = 0.30) -> bool:
    return _shot_conf(s) >= thr


def _display_length_label(d: Dict[str, Any]) -> str:
    L = d.get("length") or {}
    z = L.get("label")
    if z and z != "uncertain":
        return str(z)
    if z == "uncertain":
        dm = L.get("distance_m")
        if dm is not None:
            try:
                x = float(dm)
                if x < LENGTH_BOUNDS_M["yorker"][1]:
                    return "yorker"
                if x < LENGTH_BOUNDS_M["full"][1]:
                    return "full"
                if x < LENGTH_BOUNDS_M["good_length"][1]:
                    return "good_length"
                return "short"
            except (TypeError, ValueError):
                pass
    return "full"


def build_insights(
    deliveries: List[Dict[str, Any]],
    shot_log: List[Dict[str, Any]],
    pace_cfg: PaceConfig,
) -> Dict[str, Any]:
    """Cross-reference deliveries with existing shot classifier output."""
    batsman_rows: List[Dict[str, Any]] = []
    bowler_notes: List[str] = []

    for d in deliveries:
        sn = d.get("shot_num") or d.get("display_num") or d.get("matched_confirmed_shot_num")
        shot = None
        if sn is not None:
            for s in shot_log:
                if s.get("shot_num") == sn or s.get("_display_num") == sn:
                    shot = s
                    break
        pace = d.get("pace_band")
        zone = _display_length_label(d)
        outcome = None
        if shot:
            conf = _shot_conf(shot)
            outcome = {
                "shot_label": shot.get("label"),
                "shot_score": shot.get("shot_score"),
                "shot_quality": shot.get("shot_quality"),
                "confirmed": conf >= CONFIRMED_SHOT_CONF,
            }
        batsman_rows.append(
            {
                "delivery_id": d.get("delivery_id"),
                "matched_shot_num": sn,
                "ball_track_matched": d.get("ball_track_matched"),
                "pace_band": pace,
                "length_zone": zone,
                "shot_outcome": outcome,
            }
        )

    # Bowler: simple aggregates
    zones = [_display_length_label(d) for d in deliveries]
    zc = Counter(zones)
    speeds = [d.get("speed_kmh_est") for d in deliveries if d.get("speed_kmh_est") is not None]
    spd_std = float(np.std(speeds)) if len(speeds) > 1 else 0.0

    if spd_std > 12:
        bowler_notes.append("Pace varies noticeably between deliveries — work on run-up and release repeatability.")
    if zc:
        most = zc.most_common(1)[0][0]
        bowler_notes.append(f"Most common length zone this session: {most.replace('_', ' ')}.")

    pressure = sum(
        1
        for d in deliveries
        if _display_length_label(d) in ("good_length", "yorker")
        and d.get("pace_band") in ("fast", "very_fast")
    )
    if pressure:
        bowler_notes.append(
            f"{pressure} delivery/deliveries in threatening pace+length combinations (good yorker/good length at higher pace — estimated)."
        )

    return {
        "batsman": {
            "by_pace_and_outcome": batsman_rows,
            "summary": "Correlates estimated ball pace and length with classifier shot outcomes when peak_frame overlaps the ball track window.",
        },
        "bowler": {
            "length_distribution": dict(zc),
            "pace_consistency_std_kmh": round(spd_std, 2),
            "notes": bowler_notes,
        },
    }


def _emit(ws, loop, payload: dict):
    if ws is None or loop is None:
        return
    try:
        fut = asyncio.run_coroutine_threadsafe(ws.send_json(payload), loop)
        fut.result(timeout=5)
    except Exception as e:
        logger.debug("websocket emit skipped: %s", e)


def _pack_delivery_from_segment(
    seg: Dict[str, Any],
    *,
    delivery_id: str,
    frame_w: int,
    frame_h: int,
    fps: float,
    A: np.ndarray,
    B: np.ndarray,
    seg_m: float,
    batter_end: str,
    axis_px_len: float,
    pace_cfg: PaceConfig,
    render_conf: float,
    motion_validated: bool = True,
) -> Dict[str, Any]:
    """Full metrics dict from one track segment (moving ball)."""
    frames = seg["frames"]
    pts = [(float(r[1]), float(r[2])) for r in frames]
    ts = np.array([(r[0] / fps) for r in frames], dtype=float)
    t_along = np.array([_project_along_axis(np.array(p), A, B) for p in pts], dtype=float)

    bi, bconf, bnote = estimate_bounce(pts)
    bounce_frame = None
    distance_m = None
    full_toss = False

    if bi is not None:
        bounce_frame = int(frames[bi][0])
        tb = _robust_t_at_bounce(t_along, bi)
        distance_m = _distance_from_batter_m(tb, A, B, seg_m, batter_end)
    else:
        t_end = float(np.clip(t_along[-1], 0.0, 1.0))
        if batter_end.upper() == "A":
            near_batter_t = min(t_along.min(), t_end)
        else:
            near_batter_t = min(1.0 - t_along.max(), 1.0 - t_end)
        if near_batter_t < 0.12 and bconf < 0.2:
            full_toss = True
            distance_m = float(near_batter_t * seg_m)

    length_dist_m: Optional[float] = distance_m
    if length_dist_m is None and not full_toss and len(t_along) > 0:
        tm = float(np.median(t_along))
        length_dist_m = _distance_from_batter_m(tm, A, B, seg_m, batter_end)
    if length_dist_m is None:
        length_dist_m = float(min(4.0, 0.4 * float(seg_m)))

    length_conf = float(bconf) if bi is not None else 0.0
    if bi is None and not full_toss and len(t_along) > 0:
        length_conf = max(0.38, 0.5 * float(bconf) + 0.22)
    elif bi is None and not full_toss:
        length_conf = max(0.32, float(bconf))
    length_conf = max(length_conf, 0.18)

    spd_kmh, spd_rel, spd_warn = _speed_profile(
        ts=ts,
        t_along=t_along,
        points_px=np.array(pts, dtype=float),
        seg_m=seg_m,
        axis_px_len=axis_px_len,
    )
    if math.isnan(spd_kmh):
        spd_kmh = None
    else:
        spd_kmh, spd_warn, spd_rel = _realistic_ball_speed_kmh(spd_kmh, spd_warn, spd_rel)

    length_info = classify_length_zone(
        length_dist_m,
        bounce_confidence=length_conf,
        full_toss=full_toss,
    )
    pace = pace_band_label(spd_kmh, pace_cfg)

    hi = [r[5] for r in frames if r[5] >= render_conf]
    track_conf = float(np.mean(hi)) if hi else float(np.mean([r[5] for r in frames]))

    rel = spd_rel * (0.5 + 0.5 * min(1.0, bconf if bi is not None else 0.25))
    rel = float(np.clip(rel * (0.7 + 0.3 * min(1.0, track_conf)), 0.0, 1.0))
    if not motion_validated:
        rel = float(np.clip(rel * 0.5, 0.0, 1.0))

    traj_norm = []
    overlay_boxes = []
    for r in frames:
        fi, cx, cy, w, h, cf = r
        nx = cx / frame_w
        ny = cy / frame_h
        tt = _project_along_axis(np.array([cx, cy]), A, B)
        sm = _distance_from_batter_m(float(tt), A, B, seg_m, batter_end)
        traj_norm.append(
            {
                "frame": int(fi),
                "nx": round(nx, 5),
                "ny": round(ny, 5),
                "along_t": round(float(tt), 5),
                "distance_from_batter_m": round(float(sm), 4),
                "conf": round(float(cf), 4),
            }
        )
        if cf >= render_conf:
            overlay_boxes.append(
                {
                    "frame": int(fi),
                    "cx": round(cx, 2),
                    "cy": round(cy, 2),
                    "w": round(w, 2),
                    "h": round(h, 2),
                    "conf": round(float(cf), 4),
                }
            )

    bounce_norm = None
    if bi is not None:
        bx, by = pts[bi]
        bounce_norm = {
            "nx": round(bx / frame_w, 5),
            "ny": round(by / frame_h, 5),
            "distance_from_batter_m": round(float(distance_m or 0.0), 4),
        }
    elif traj_norm:
        td = length_info.get("distance_m")
        if td is not None:
            try:
                td_f = float(td)
                best = min(
                    traj_norm,
                    key=lambda p: abs(float(p["distance_from_batter_m"]) - td_f),
                )
                bounce_norm = {
                    "nx": best["nx"],
                    "ny": best["ny"],
                    "distance_from_batter_m": best["distance_from_batter_m"],
                }
            except (TypeError, ValueError):
                pass

    return {
        "delivery_id": delivery_id,
        "track_id": seg["track_id"],
        "start_frame": seg["start_frame"],
        "end_frame": seg["end_frame"],
        "frame_count": seg["frame_count"],
        "track_confidence_score": round(track_conf, 4),
        "speed_kmh_est": None if spd_kmh is None else round(spd_kmh, 2),
        "speed_is_estimated": True,
        "speed_reliability_score": round(rel, 4),
        "speed_warnings": spd_warn,
        "pace_band": pace,
        "bounce": {
            "frame": bounce_frame,
            "confidence": round(bconf, 4) if bi is not None else 0.0,
            "method_note": bnote,
            "point_norm": bounce_norm,
        },
        "length": length_info,
        "pitch_plot": {
            "trajectory": traj_norm,
            "bounce": bounce_norm,
            "length_zone": length_info.get("label"),
        },
        "quality_flags": list(
            dict.fromkeys(
                spd_warn
                + ([] if bi is not None else ["bounce_uncertain"])
                + (["low_track_conf"] if track_conf < 0.45 else [])
                + (["motion_filter_relaxed"] if not motion_validated else [])
            )
        ),
        "_overlay_boxes": overlay_boxes,
    }


def run_ball_analytics(
    video_path: str,
    shot_log: List[Dict[str, Any]],
    fps: float,
    frame_w: int,
    frame_h: int,
    ws=None,
    loop=None,
) -> Dict[str, Any]:
    """
    Full ball pipeline. Never raises — returns error object on failure.
    """
    debug = _benv("BALL_DEBUG", False)
    if debug:
        logging.basicConfig(level=logging.DEBUG)

    model_path = _senv("BALL_MODEL_WEIGHTS", str(BASE_DIR / "assets" / "best_ball.pt"))
    model_path = str(Path(model_path).expanduser().resolve())
    # Lower internal conf so YOLO tracker captures real ball detections (0.3-0.5 conf)
    # that were previously lost.  The motion filter handles false positives.
    internal_conf = _fenv("BALL_TRACK_CONF_INTERNAL", 0.15)
    # Render conf: bounding boxes in both the annotated MP4 and the dashboard overlay.
    # 0.6 was hiding almost all real detections.  0.30 shows them while still dropping
    # the weakest noise.
    render_conf = _fenv("BALL_RENDER_CONF", 0.30)
    # Short net deliveries may only span ~5-6 frames at close range
    min_frames = _ienv("BALL_MIN_TRACK_FRAMES", 5)
    max_gap = _ienv("BALL_MAX_FRAME_GAP", 28)
    batter_end = _senv("CALIB_BATTER_END", "A")

    pace_cfg = pace_config_from_env()
    A, B, seg_m = _axis_calibration(frame_w, frame_h)

    out: Dict[str, Any] = {
        "enabled": True,
        "model_path": model_path,
        "calibration": {
            "segment_m": seg_m,
            "axis_a_norm": [A[0] / frame_w, A[1] / frame_h],
            "axis_b_norm": [B[0] / frame_w, B[1] / frame_h],
            "batter_end": batter_end,
            "is_estimated": True,
            "note": "Single-camera axis from CALIB_* env; tune for your net camera.",
            "speed_realism": {
                "enabled": _benv("BALL_SPEED_REALISM", True),
                "scale": _fenv("BALL_SPEED_SCALE", 1.30),
                "percentile": _fenv("BALL_SPEED_PERCENTILE", 79.0),
                "secant_blend": _fenv("BALL_SPEED_SECANT_BLEND", 0.42),
                "weight_2d_vs_axis": _fenv("BALL_SPEED_2D_WEIGHT", 0.92),
                "discard_below_kmh": _fenv("BALL_SPEED_DISCARD_BELOW_KMH", 24.0),
                "plausible_floor_kmh": _fenv("BALL_SPEED_PLAUSIBLE_FLOOR_KMH", 52.0),
                "floor_blend": _fenv("BALL_SPEED_FLOOR_BLEND", 0.88),
                "club_soft_floor_kmh": _fenv("BALL_SPEED_CLUB_SOFT_FLOOR_KMH", 46.0),
                "soft_floor_min_raw_kmh": _fenv("BALL_SPEED_SOFT_FLOOR_MIN_RAW_KMH", 30.0),
                "session_rescale": {
                    "enabled": _benv("BALL_SPEED_SESSION_RESCALE", True),
                    "median_target_kmh": _fenv("BALL_SPEED_SESSION_MEDIAN_TARGET_KMH", 70.0),
                    "if_median_below_kmh": _fenv("BALL_SPEED_SESSION_RESCALE_IF_MEDIAN_BELOW_KMH", 60.0),
                    "max_factor": _fenv("BALL_SPEED_SESSION_RESCALE_MAX_FACTOR", 1.62),
                },
            },
        },
        "pace_bands_config": {
            "slow_max_kmh": pace_cfg.slow_max_kmh,
            "medium_max_kmh": pace_cfg.medium_max_kmh,
            "very_fast_min_kmh": pace_cfg.very_fast_min_kmh,
            "use_very_fast": pace_cfg.use_very_fast,
        },
        "deliveries": [],
        "frame_overlays": [],
        "video_trajectories": [],
        "insights": {},
        "session_aggregates": {},
    }

    if not Path(model_path).is_file():
        out["error"] = f"Ball model not found: {model_path}"
        out["enabled"] = False
        return out

    total_video_frames = 0
    if cv2 is not None:
        _cap = cv2.VideoCapture(str(video_path))
        if _cap.isOpened():
            total_video_frames = int(_cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
            _cap.release()

    _emit(
        ws,
        loop,
        {
            "type": "stage",
            "stage": "ball_tracking",
            "message": (
                "Ball tracking (YOLO) — scanning every frame"
                + (f" ({total_video_frames} frames)…" if total_video_frames else "…")
            ),
            "total_frames": total_video_frames,
        },
    )

    try:
        os.environ.setdefault("YOLO_VERBOSE", "false")
        from ultralytics import YOLO
        import logging as _lg

        _lg.getLogger("ultralytics").setLevel(_lg.ERROR)

        model = YOLO(model_path)
    except Exception as e:
        out["error"] = f"YOLO load failed: {e}"
        out["enabled"] = False
        return out

    # predict = per-frame detect (matches standalone scripts); track = ByteTrack IDs (can diverge).
    yolo_mode = _senv("BALL_YOLO_MODE", "predict").strip().lower()
    predict_conf = _fenv("BALL_PREDICT_CONF", 0.50)
    predict_iou = _fenv("BALL_PREDICT_IOU", 0.45)
    predict_imgsz = _ienv("BALL_PREDICT_IMGSZ", 640)
    track_imgsz = _ienv("BALL_TRACK_IMGSZ", 960)

    out["calibration"]["yolo_mode"] = yolo_mode
    if yolo_mode != "track":
        out["calibration"]["predict_conf"] = predict_conf
        out["calibration"]["predict_iou"] = predict_iou
        out["calibration"]["predict_imgsz"] = int(predict_imgsz)
    else:
        out["calibration"]["track_conf_internal"] = internal_conf
        out["calibration"]["track_imgsz"] = int(track_imgsz)

    # Collect per-track frame samples
    tracks: Dict[int, List[Tuple[int, float, float, float, float, float]]] = defaultdict(list)

    try:
        import torch
        has_torch = True
    except ImportError:
        has_torch = False

    dev_pref = _senv("CRICKEYE_DEVICE", "").strip().lower()
    if dev_pref == "cpu":
        yolo_device = "cpu"
    elif dev_pref in ("cuda", "gpu"):
        yolo_device = 0 if (has_torch and torch.cuda.is_available()) else "cpu"
    else:
        yolo_device = 0 if (has_torch and torch.cuda.is_available()) else "cpu"

    try:
        if yolo_mode == "track":
            results = model.track(
                source=str(video_path),
                stream=True,
                conf=internal_conf,
                iou=0.3,
                imgsz=track_imgsz,
                persist=True,
                verbose=False,
                device=yolo_device,
            )
            if not _quiet_console():
                print(
                    f"[ball_analytics] YOLO mode=track conf={internal_conf} imgsz={track_imgsz} device={yolo_device} "
                    f"(set BALL_YOLO_MODE=predict to match standalone predict() scripts)"
                )
        else:
            results = model.predict(
                source=str(video_path),
                stream=True,
                conf=predict_conf,
                iou=predict_iou,
                imgsz=predict_imgsz,
                verbose=False,
                device=yolo_device,
            )
            if not _quiet_console():
                print(
                    f"[ball_analytics] YOLO mode=predict conf={predict_conf} iou={predict_iou} "
                    f"imgsz={predict_imgsz} device={yolo_device} (same family as model.predict(save=True) workflows)"
                )

        progress_every = max(1, _ienv("BALL_TRACK_PROGRESS_EVERY", 25))
        t_track0 = time.time()
        max_ri = -1
        for ri, r in enumerate(results):
            # Stream order matches sequential decode (same indexing as Pass 2 / all_frames_rgb).
            fi = int(ri)
            max_ri = fi
            if has_torch and torch.cuda.is_available() and fi % 100 == 0:
                torch.cuda.empty_cache()
            if total_video_frames > 0 and fi > 0 and fi % progress_every == 0:
                elapsed = time.time() - t_track0
                pct = fi / total_video_frames * 100.0
                eta = (elapsed / fi) * (total_video_frames - fi) if fi else 0.0
                _emit(
                    ws,
                    loop,
                    {
                        "type": "progress",
                        "stage": "ball_tracking",
                        "frame": fi,
                        "total": total_video_frames,
                        "pct": round(pct, 1),
                        "eta": round(eta),
                    },
                )
                if not _quiet_console():
                    print(
                        f"  [ball {pct:5.1f}%] frame {fi}/{total_video_frames}  ETA {eta:.0f}s"
                    )
            elif total_video_frames <= 0 and fi > 0 and fi % progress_every == 0:
                elapsed = time.time() - t_track0
                if not _quiet_console():
                    print(f"  [ball] frame {fi}  elapsed {elapsed:.0f}s")

            if r.boxes is None or len(r.boxes) == 0:
                continue
            xyxy = r.boxes.xyxy.cpu().numpy()
            confs = r.boxes.conf.cpu().numpy()

            if yolo_mode == "track":
                ids = r.boxes.id
                if ids is None:
                    jb = int(np.argmax(confs))
                    x1, y1, x2, y2 = xyxy[jb]
                    cx = (x1 + x2) / 2.0
                    cy = (y1 + y2) / 2.0
                    w = float(x2 - x1)
                    h = float(y2 - y1)
                    tracks[0].append((fi, cx, cy, w, h, float(confs[jb])))
                    continue
                ids = ids.cpu().numpy().astype(int)
                for j in range(len(xyxy)):
                    x1, y1, x2, y2 = xyxy[j]
                    cx = (x1 + x2) / 2.0
                    cy = (y1 + y2) / 2.0
                    w = x2 - x1
                    h = y2 - y1
                    tid = int(ids[j])
                    c = float(confs[j])
                    tracks[tid].append((fi, cx, cy, w, h, c))
            else:
                # Single-ball net: one best detection per frame → synthetic track 0;
                # segment_deliveries splits on frame gaps between deliveries.
                jb = int(np.argmax(confs))
                x1, y1, x2, y2 = xyxy[jb]
                cx = (x1 + x2) / 2.0
                cy = (y1 + y2) / 2.0
                w = float(x2 - x1)
                h = float(y2 - y1)
                tracks[0].append((fi, cx, cy, w, h, float(confs[jb])))

        if total_video_frames <= 0 and max_ri >= 0:
            total_video_frames = max_ri + 1
    except Exception as e:
        logger.exception("ball YOLO failed")
        out["error"] = str(e)
        return out
    finally:
        if has_torch and torch.cuda.is_available():
            torch.cuda.empty_cache()

    track_segments: List[Dict[str, Any]] = []
    for tid, frames in tracks.items():
        frames.sort(key=lambda x: x[0])
        track_segments.append({"track_id": tid, "frames": frames})

    raw_deliveries = segment_deliveries(track_segments, max_frame_gap=max_gap, min_track_frames=min_frames)
    moving_deliveries = [d for d in raw_deliveries if _is_moving_ball_segment(d["frames"], frame_w, frame_h)]

    logger.info(
        "Ball tracking: %d track IDs, %d raw segments (>=%d frames), "
        "%d moving segments after still-ball filter",
        len(tracks), len(raw_deliveries), min_frames, len(moving_deliveries),
    )
    if not _quiet_console():
        print(
            f"[ball_analytics] {len(tracks)} track IDs → "
            f"{len(raw_deliveries)} raw segments → "
            f"{len(moving_deliveries)} moving (still balls filtered out)"
        )

    raw_sorted = sorted(raw_deliveries, key=lambda d: -d["frame_count"])

    assignment_from_raw_fallback = (len(moving_deliveries) == 0) and (len(raw_deliveries) > 0)
    pool_candidates: List[Dict[str, Any]] = (
        list(moving_deliveries) if moving_deliveries else list(raw_sorted)
    )

    merged_timeline = _merge_tracks_to_timeline(tracks)
    max_frame_obs = int(merged_timeline[-1][0]) if merged_timeline else max(0, (total_video_frames or 1) - 1)

    axis_px_len = float(np.linalg.norm(B - A))
    _video_render_conf = _fenv("BALL_VIDEO_RENDER_CONF", 0.0)

    colors_bgr = [
        (0, 255, 255),
        (0, 165, 255),
        (180, 105, 255),
        (60, 220, 120),
        (255, 140, 0),
        (200, 200, 40),
        (255, 60, 160),
    ]

    video_frame_map: Dict[int, List[Dict[str, Any]]] = defaultdict(list)
    video_trajectories: List[Dict[str, Any]] = []

    peak_pad = _ienv("BALL_PEAK_MATCH_PAD_FRAMES", 30)
    shots_ordered = sorted(
        shot_log,
        key=lambda s: int(s.get("peak_frame", 0) or 0),
    )
    confirmed_ordered = [s for s in shots_ordered if _is_confirmed_shot(s)]
    peak_list = [int(s.get("peak_frame", 0) or 0) for s in shots_ordered]
    shot_windows = _exclusive_frame_windows_for_peaks(peak_list, max_frame_obs)

    for row in merged_timeline:
        fi, cx, cy, w, h, cf = row
        if float(cf) >= _video_render_conf:
            video_frame_map[int(fi)].append(
                {
                    "cx": round(float(cx), 2),
                    "cy": round(float(cy), 2),
                    "w": round(float(w), 2),
                    "h": round(float(h), 2),
                    "conf": round(float(cf), 4),
                    "track_id": 0,
                }
            )
    for wi, (w_lo, w_hi) in enumerate(shot_windows):
        if wi >= len(shots_ordered):
            break
        shot_row = shots_ordered[wi]
        sub = [t for t in merged_timeline if w_lo <= int(t[0]) <= w_hi]
        tpts = [{"frame": int(t[0]), "x": int(round(t[1])), "y": int(round(t[2]))} for t in sub]
        if len(tpts) >= 2 and _is_confirmed_shot(shot_row):
            col = colors_bgr[wi % len(colors_bgr)]
            video_trajectories.append(
                {"track_id": wi, "bgr": [int(c) for c in col], "points": tpts}
            )

    if merged_timeline and not _quiet_console():
        print(
            f"[ball_analytics] Per-shot ball windows: {len(shots_ordered)} shots "
            f"({len(confirmed_ordered)} confirmed), "
            f"{len(merged_timeline)} merged ball detections on timeline"
        )

    min_shot_pts = max(2, _ienv("BALL_MIN_SHOT_BALL_FRAMES", 2))

    pool = list(pool_candidates)
    selected: List[Dict[str, Any]] = []

    def _attach_shot_meta(d: Dict[str, Any], shot: Dict[str, Any]) -> None:
        sc = round(float(_shot_conf(shot)), 4)
        ok = _is_confirmed_shot(shot)
        d["shot_classifier_conf"] = sc
        d["shot_confirmed"] = ok
        if not ok:
            pp = d.get("pitch_plot") or {}
            d["pitch_plot"] = {**pp, "trajectory": []}

    for idx, shot in enumerate(shots_ordered):
        sn = shot.get("shot_num") or shot.get("_display_num")
        dn = shot.get("_display_num") or sn
        pf = int(shot.get("peak_frame", 0) or 0)
        delivery_id = f"d{idx + 1}"

        from_timeline = False
        seg: Optional[Dict[str, Any]] = None
        if idx < len(shot_windows):
            w_lo, w_hi = shot_windows[idx]
            cand = _segment_from_timeline_slice(merged_timeline, w_lo, w_hi, track_id=idx)
            if cand is not None and cand["frame_count"] >= min_shot_pts:
                seg = cand
                from_timeline = True
        if seg is None:
            seg = _best_moving_segment_for_peak(pool, pf, peak_pad)
            from_timeline = False

        if seg is not None:
            if from_timeline:
                mv = _is_moving_ball_segment(seg["frames"], frame_w, frame_h)
            else:
                mv = not assignment_from_raw_fallback
            d = _pack_delivery_from_segment(
                seg,
                delivery_id=delivery_id,
                frame_w=frame_w,
                frame_h=frame_h,
                fps=fps,
                A=A,
                B=B,
                seg_m=seg_m,
                batter_end=batter_end,
                axis_px_len=axis_px_len,
                pace_cfg=pace_cfg,
                render_conf=render_conf,
                motion_validated=mv,
            )
            d["shot_num"] = sn
            d["display_num"] = dn
            d["peak_frame"] = pf
            d["ball_track_matched"] = True
            d["matched_confirmed_shot_num"] = sn
            d["match_source"] = "shot_time_window" if from_timeline else "greedy_segment"
            d.pop("_overlay_boxes", None)
            _attach_shot_meta(d, shot)
            if not from_timeline:
                try:
                    pool.remove(seg)
                except ValueError:
                    pass
            selected.append(d)
        else:
            stub: Dict[str, Any] = {
                "delivery_id": delivery_id,
                "shot_num": sn,
                "display_num": dn,
                "peak_frame": pf,
                "ball_track_matched": False,
                "track_id": None,
                "start_frame": None,
                "end_frame": None,
                "frame_count": 0,
                "track_confidence_score": 0.0,
                "speed_kmh_est": None,
                "speed_is_estimated": True,
                "speed_reliability_score": 0.12,
                "speed_warnings": ["no_moving_ball_track"],
                "pace_band": "unknown",
                "bounce": {"frame": None, "confidence": 0.0, "method_note": "no_track", "point_norm": None},
                "length": {
                    "label": "full",
                    "distance_m": 3.8,
                    "confidence": 0.32,
                    "uncertain": False,
                    "reason": "No ball track; nominal full length for display.",
                },
                "pitch_plot": {"trajectory": [], "bounce": None, "length_zone": "full"},
                "quality_flags": ["no_ball_track"],
            }
            _attach_shot_meta(stub, shot)
            selected.append(stub)

    session_speed_rescale = _apply_session_ball_speed_rescale(selected, pace_cfg)
    out["deliveries"] = selected
    out["frame_overlays"] = [{"frame": f, "boxes": v} for f, v in sorted(video_frame_map.items())]
    out["video_trajectories"] = video_trajectories
    out["insights"] = build_insights(selected, shot_log, pace_cfg)

    nz = [d for d in selected if d.get("length", {}).get("label")]
    out["session_aggregates"] = {
        "delivery_count": len(selected),
        "confirmed_shot_count": len(confirmed_ordered),
        "moving_track_segments": len(moving_deliveries),
        "raw_track_segments": len(raw_deliveries),
        "shot_assignment_pool": (
            "motion_validated"
            if moving_deliveries
            else ("raw_longest" if raw_deliveries else "empty")
        ),
        "shot_ball_mapping": "per_peak_time_window",
        "video_trajectory_layers": len(video_trajectories),
        "unmatched_tracks_after_assignment": max(0, len(pool)),
        "unmatched_moving_tracks_after_assignment": max(0, len(pool)),
        "pace_band_counts": dict(Counter(d.get("pace_band") for d in selected)),
        "length_zone_counts": dict(
            Counter((d.get("length") or {}).get("label") for d in nz)
        ),
        "mean_speed_kmh_est": (
            round(
                float(
                    np.mean(
                        [
                            d["speed_kmh_est"]
                            for d in selected
                            if d.get("speed_kmh_est") is not None and d.get("ball_track_matched")
                        ]
                    )
                ),
                2,
            )
            if any(d.get("speed_kmh_est") is not None and d.get("ball_track_matched") for d in selected)
            else None
        ),
        "uncertainty_note": "All ball metrics are single-camera estimates; see calibration section.",
        "session_ball_speed_rescale": session_speed_rescale,
    }

    if debug:
        out["debug"] = {
            "track_ids": list(tracks.keys()),
            "segments_raw": len(raw_deliveries),
            "segments_moving": len(moving_deliveries),
        }

    _emit(ws, loop, {"type": "stage", "stage": "ball_tracking", "message": "Ball analytics complete."})
    return out


def run_ball_analytics_json_stub() -> Dict[str, Any]:
    """For tests — minimal shape."""
    return {
        "enabled": True,
        "deliveries": [],
        "frame_overlays": [],
        "video_trajectories": [],
        "insights": {},
        "session_aggregates": {},
    }
