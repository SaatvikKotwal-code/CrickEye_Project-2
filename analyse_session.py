"""
CrickEye v7.0 — analyse_session.py
Full biomechanics pipeline with WebSocket real-time streaming.

KEY CHANGES vs v6.6 — Reliable Metrics Overhaul:
  - Only front-on-reliable metrics kept in shot score and player display.
  - Symmetry angle bug FIXED: was measuring line direction (~180 deg),
    now measures tilt-from-horizontal (0-15 deg). Score is real now.
  - Bat speed replaced with Swing Intensity: P90 of 5-frame rolling-mean
    bilateral velocity, session-relative 0-100 scale. Raw km/h kept in JSON.
  - FOOTWORK added: trigger movement detection (pre-delivery ankle Y dip-rise)
    + front foot plant timing (ankle Y-velocity zero-crossing vs contact).
  - Removed from score/display: weight_transfer, base_width, spine_ratio,
    knee_flex (all Z-axis dependent, unreliable from front-on camera).
    Still computed and stored in JSON for future validation.
  - New shot score: Head 35 + Footwork 25 + Symmetry 15 + Elbow 15
    + Swing Intensity 10 = 100 pts (/10 display).
  - New alerts: NO_TRIGGER, LATE_PLANT.

Entry points:
  run_pipeline()          -- CLI mode
  run_pipeline_ws_sync()  -- WebSocket mode (called from backend/main.py)
"""

import cv2
import csv
import json
import time
import asyncio
import numpy as np
import torch
import torch.nn as nn
import torchvision
from collections import deque, defaultdict
from pathlib import Path
from ultralytics import YOLO

# -----------------------------------------------------------------
# CONFIG
# -----------------------------------------------------------------

BASE_DIR    = Path(__file__).parent
VIDEO_PATH  = str(BASE_DIR / "assets" / "net_session_video.mp4")
MODEL_PATH  = str(BASE_DIR / "assets" / "crickeye_best.pth")
POSE_MODEL_PATH = str(BASE_DIR / "assets" / "yolov8n-pose.pt")
OUTPUT_PATH = str(BASE_DIR / "assets" / "analysed_out.mp4")
CSV_PATH    = str(BASE_DIR / "data"   / "session_log.csv")
JSON_PATH   = str(BASE_DIR / "data"   / "session_report.json")

# -- Shot detection
BILATERAL_VEL_THRESHOLD  = 12.0
MIN_SWING_FRAMES         = 5
BILATERAL_FRAME_FRAC     = 0.6
MIN_TRAVEL_PX            = 40
MIN_SHOT_GAP_FRAMES      = 45

# -- Stance detection
W_SHOULDER               = 3.0
W_BACK_FOOT              = 2.0
W_FRONT_FOOT             = 2.0
W_WRIST_DROP             = 1.0
STANCE_THRESHOLD         = 0.65
MIN_KEYPOINT_CONF        = 0.30
MIN_POSE_CONF            = 0.40
PRESHOT_START            = 10
PRESHOT_END              = 3

# -- Shot classifier
SHOT_CLASSES             = ['cover', 'flick', 'pull', 'straight', 'sweep']
CONF_THRESHOLD           = 0.60
NUM_FRAMES               = 16
IMG_SIZE                 = 224
CLIP_PRE_FRAMES          = 10
CLIP_POST_FRAMES         = 30
MEAN                     = [0.45, 0.45, 0.45]
STD                      = [0.225, 0.225, 0.225]

# -- Biomechanics thresholds (tuned for front-on camera, short clips)
BACK_PLANTED_PX          = 18.0
FRONT_STRIDE_PX          = 20.0
HIP_SHIFT_PX             = 10.0
BACK_PIVOT_RATIO         = 1.2

# Head quality (loosened for front-on camera — normal shot rotation
# registers as lateral movement; thresholds were previously too strict)
HEAD_STABLE_GOOD         = 60      # was 70
HEAD_STABLE_WARN         = 35      # was 40
STABILITY_GOOD           = 60      # was 70
STABILITY_WARN           = 35      # was 45

# Head-score penalty multiplier (front-on camera; was 12 → 7 → now 5.5)
# Lower = more lenient. Front-on camera sees Z-axis lunge as vertical
# movement, so we must be more forgiving than a side-on camera would be.
HEAD_SCORE_MULTIPLIER    = 5.5

# Minimum keypoint frames required before we trust a biomech metric
MIN_SYMMETRY_FRAMES      = 4       # symmetry needs at least this many readings
MIN_ELBOW_FRAMES         = 3       # elbow ratio needs at least this many readings

# Shoulder width plausibility gate
MIN_SHOULDER_PX          = 30.0    # below this = bad detection, use fallback
SHOULDER_FALLBACK_PX     = 90.0    # typical webcam / net distance when pose width fails

# Session vs clip shoulder filtering (pose_conf gate in _shoulder_px_from_window)
SHOULDER_POSE_CONF_MIN   = 0.55
SHOULDER_SESSION_BAND    = 1.5     # clip widths within [session/1.5, session*1.5]

# Bat speed cap
SPEED_SANITY_CAP_KMH     = 140.0
POWER_SCORE_CEILING_KMH  = 140.0

# -- CALIBRATION -- bat speed -----------------------------------------
# Average adult shoulder width in metres used as the pixel ruler.
# Tune SHOULDER_WIDTH_M per your player population if needed.
SHOULDER_WIDTH_M         = 0.45
# Wrist velocity underestimates bat-tip speed because the bat is a lever.
# 1.35 is a conservative midpoint (range 1.25-1.50).
# Replace with a measured value once you have radar or Hawk-Eye ground truth.
BAT_TIP_MULTIPLIER       = 1.35

# Head quality rules per shot type
# Format: (lat_w, vert_w, vert_free, lat_flag_thr, vert_flag_thr, lat_free)
#
# Cover/flick: batsman moves TOWARD the ball — lateral and vertical head
# movement is expected and correct. Front-on camera also converts the
# forward lunge (Z-axis) into apparent vertical drop. Generous free
# ratios prevent penalizing correct technique.
#
# Straight: head should be very still — ball is coming straight at you.
# Pull/sweep: cross-bat, body rotates — vertical movement is free.
HEAD_RULES = {
    'cover'    : (0.65, 0.35, 0.25, 0.22, 0.28, 0.10),
    'straight' : (0.80, 0.20, 0.10, 0.14, 0.15, 0.04),
    'flick'    : (0.70, 0.30, 0.18, 0.18, 0.20, 0.06),
    'pull'     : (0.15, 0.85, 0.35, 0.22, 0.30, 0.08),
    'sweep'    : (0.20, 0.80, 0.40, 0.22, 0.32, 0.08),
}
HEAD_RULES_DEFAULT = (0.80, 0.20, 0.10, 0.14, 0.15, 0.04)

# ── Balance / Posture constants (new metrics) ──────────────────────────
# Base width: ankle separation as multiple of shoulder width.
# Front-on camera: ankles appear narrower (depth); thresholds relaxed.
BASE_WIDTH_GOOD          = 0.75    # fine for front-on
BASE_WIDTH_WIDE          = 1.6     # above this = too wide
BASE_WIDTH_NARROW        = 0.50    # below this = genuinely narrow (needs 5+ ankle frames to flag)

# Weight transfer: hip-midpoint X-shift from pre-shot to contact,
# as a ratio of shoulder width. Positive = moving toward the ball (good).
WEIGHT_TRANSFER_GOOD     = 0.08    # at least 8% of shoulder width
WEIGHT_TRANSFER_OVER     = 0.35    # lunging / over-committed
WEIGHT_TRANSFER_MAX_PLAUSIBLE = 0.60   # beyond this = discard (measurement error)

# Spine height ratio: nose-to-hip-mid distance at contact vs at setup.
# Ratio < 0.88 = significant crouch/collapse at contact.
SPINE_COLLAPSE_THRESHOLD = 0.88

# Knee bend: vertical distance knee-to-ankle normalized by femur length
# (knee-to-hip). Low value = stiff legs; high = good athletic position.
KNEE_BEND_GOOD           = 0.30    # knee drop ≥ 30% of femur = good flex
KNEE_BEND_STIFF          = 0.15    # below 15% = stiff-legged

MIN_HEAD_FRAMES = 2   # short clips: 2 frames minimum for basic std

# -- COCO keypoint indices
KP_NOSE                  = 0
KP_L_EYE, KP_R_EYE      = 1,  2
KP_L_EAR, KP_R_EAR      = 3,  4
KP_LS,    KP_RS          = 5,  6
KP_LE,    KP_RE          = 7,  8
KP_LW,    KP_RW          = 9,  10
KP_LH,    KP_RH          = 11, 12
KP_LK,    KP_RK          = 13, 14
KP_LA,    KP_RA          = 15, 16

# -- Render colours
FONT       = cv2.FONT_HERSHEY_SIMPLEX
COL_NORMAL = (200, 200, 200)
COL_AMBER  = (0, 190, 255)
COL_TEAL   = (180, 200, 0)
COL_GREEN  = (0, 210, 100)
COL_RED    = (50,  50, 220)
COL_CYAN   = (255, 220, 0)
COL_PANEL  = (15,  15,  25)
CLASS_COLS = {
    'cover'   : (0, 200, 100),
    'flick'   : (0, 180, 255),
    'pull'    : (0, 120, 255),
    'straight': (180, 200, 0),
    'sweep'   : (200, 100, 0),
}

# -----------------------------------------------------------------
# WebSocket helper
# -----------------------------------------------------------------

def ws_emit(ws, loop, payload: dict):
    if ws is None or loop is None:
        return
    future = asyncio.run_coroutine_threadsafe(ws.send_json(payload), loop)
    try:
        future.result(timeout=5)
    except Exception as e:
        print(f"[WS emit error] {e}")

# -----------------------------------------------------------------
# GEOMETRY HELPERS
# -----------------------------------------------------------------

def dist(p1, p2):
    if p1 is None or p2 is None:
        return 0.0
    return float(np.hypot(p1[0] - p2[0], p1[1] - p2[1]))

def midpoint(p1, p2):
    if p1 is None or p2 is None:
        return None
    return ((p1[0] + p2[0]) / 2.0, (p1[1] + p2[1]) / 2.0)

def smooth_points(points):
    pts = [p for p in points if p]
    return pts if len(pts) >= 2 else pts

# -----------------------------------------------------------------
# POSE MODEL
# -----------------------------------------------------------------

_pose_model = None

def get_pose_model():
    global _pose_model
    if _pose_model is None:
        path = POSE_MODEL_PATH
        if not Path(path).is_file():
            raise FileNotFoundError(
                f"Pose weights not found: {path}\n"
                "Place yolov8n-pose.pt in assets/ (same folder as crickeye_best.pth)."
            )
        print(f"[CrickEye] Loading YOLOv8n-pose from disk: {path}")
        _pose_model = YOLO(path)
        print("[CrickEye] Pose model ready")
    return _pose_model

# -----------------------------------------------------------------
# PASS 1 - KEYPOINT EXTRACTION
# -----------------------------------------------------------------

KP_KEYS = [
    'nose', 'l_eye', 'r_eye', 'l_ear', 'r_ear',
    'ls', 'rs', 'le', 're', 'lw', 'rw',
    'lh', 'rh', 'lk', 'rk', 'la', 'ra',
]

def extract_all_keypoints(video_path, ws=None, loop=None):
    pose_model   = get_pose_model()
    cap          = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise FileNotFoundError(f"Cannot open: {video_path}")

    fps          = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    orig_w       = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    orig_h       = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    print(f"[CrickEye] Video: {orig_w}x{orig_h} @ {fps:.1f}fps | {total_frames} frames")
    ws_emit(ws, loop, {
        "type": "stage", "stage": "keypoints",
        "message": "Pass 1 - Extracting pose keypoints...",
        "total_frames": total_frames, "fps": fps,
        "width": orig_w, "height": orig_h,
    })

    all_frames_rgb = []
    all_keypoints  = []
    frame_idx      = 0
    t0             = time.time()

    while True:
        ret, frame_bgr = cap.read()
        if not ret:
            break

        all_frames_rgb.append(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB))

        results  = pose_model(frame_bgr, verbose=False)
        kp_entry = {k: None for k in KP_KEYS}
        kp_entry['pose_conf'] = 0.0

        if results and results[0].keypoints is not None:
            boxes = results[0].boxes
            if boxes is not None and len(boxes) > 0:
                areas = ((boxes.xyxy[:, 2] - boxes.xyxy[:, 0]) *
                         (boxes.xyxy[:, 3] - boxes.xyxy[:, 1]))
                best  = int(areas.argmax())
                kp_entry['pose_conf'] = float(boxes.conf[best])
                kpts  = results[0].keypoints.xy[best]
                confs = results[0].keypoints.conf[best]

                def get_kp(idx):
                    x = float(kpts[idx][0])
                    y = float(kpts[idx][1])
                    c = float(confs[idx]) if confs is not None else 1.0
                    return (x, y) if (x > 0 and y > 0 and c >= MIN_KEYPOINT_CONF) else None

                for i, key in enumerate(KP_KEYS):
                    kp_entry[key] = get_kp(i)

        all_keypoints.append(kp_entry)
        frame_idx += 1

        if frame_idx % 100 == 0:
            pct     = frame_idx / total_frames * 100
            elapsed = time.time() - t0
            eta     = (elapsed / frame_idx) * (total_frames - frame_idx)
            print(f"  [{pct:5.1f}%] frame {frame_idx}/{total_frames}  ETA {eta:.0f}s")
            ws_emit(ws, loop, {
                "type": "progress", "stage": "keypoints",
                "frame": frame_idx, "total": total_frames,
                "pct": round(pct, 1), "eta": round(eta),
            })

    cap.release()
    ws_emit(ws, loop, {
        "type": "progress", "stage": "keypoints",
        "frame": total_frames, "total": total_frames,
        "pct": 100.0, "eta": 0,
    })
    print(f"[CrickEye] Keypoint extraction done - {frame_idx} frames  elapsed {time.time()-t0:.1f}s")
    return all_frames_rgb, all_keypoints, fps, total_frames, orig_w, orig_h

# -----------------------------------------------------------------
# WRIST VELOCITY
# -----------------------------------------------------------------

def compute_wrist_signals(all_keypoints):
    lw_vels   = []
    rw_vels   = []
    bilateral = []
    prev_lw   = None
    prev_rw   = None

    for kp in all_keypoints:
        lw = kp['lw']
        rw = kp['rw']
        pc = kp['pose_conf']
        lw_vel = 0.0
        rw_vel = 0.0

        if pc >= MIN_POSE_CONF:
            if lw and prev_lw:
                lw_vel = float(np.hypot(lw[0]-prev_lw[0], lw[1]-prev_lw[1]))
            if rw and prev_rw:
                rw_vel = float(np.hypot(rw[0]-prev_rw[0], rw[1]-prev_rw[1]))

        lw_vels.append(lw_vel)
        rw_vels.append(rw_vel)
        bilateral.append(0.6 * max(lw_vel, rw_vel) + 0.4 * min(lw_vel, rw_vel))

        if lw: prev_lw = lw
        if rw: prev_rw = rw

    return lw_vels, rw_vels, bilateral

# -----------------------------------------------------------------
# SWING WINDOW DETECTION
# -----------------------------------------------------------------

def find_swing_windows(bilateral):
    N           = len(bilateral)
    bil_arr     = np.array(bilateral, dtype=np.float32)
    W           = MIN_SWING_FRAMES
    swing_valid = np.zeros(N, dtype=bool)
    swing_score = np.zeros(N, dtype=np.float32)
    soft_thr    = BILATERAL_VEL_THRESHOLD * 0.7

    for i in range(N - W):
        window = bil_arr[i : i + W]
        if float(window.mean()) < BILATERAL_VEL_THRESHOLD:
            continue
        if int(np.sum(window >= soft_thr)) < int(np.ceil(W * BILATERAL_FRAME_FRAC)):
            continue
        peak_idx = int(np.argmax(window))
        if not (int(W * 0.20) <= peak_idx <= int(W * 0.80)):
            continue
        total_travel = float(window.sum())
        if total_travel < MIN_TRAVEL_PX:
            continue
        swing_valid[i] = True
        swing_score[i] = total_travel

    return swing_valid, swing_score


def find_shot_onsets(lw_vels, rw_vels, bilateral, fps, ws=None, loop=None):
    ws_emit(ws, loop, {"type": "stage", "stage": "detection",
                       "message": "Detecting swing windows..."})

    swing_valid, swing_score = find_swing_windows(bilateral)
    candidates = [(i, float(swing_score[i]))
                  for i in range(len(swing_valid)) if swing_valid[i]]

    if not candidates:
        bil_arr = np.array(bilateral)
        print(f"[CrickEye] WARNING: No valid swing windows. Max bil={bil_arr.max():.1f}")
        ws_emit(ws, loop, {"type": "warning",
                           "message": f"No swing windows found. Max bilateral vel = {bil_arr.max():.1f} px/frame"})
        return []

    grouped = []
    for frame_i, score_i in candidates:
        if not grouped:
            grouped.append([frame_i, score_i]); continue
        if frame_i - grouped[-1][0] <= MIN_SWING_FRAMES:
            if score_i > grouped[-1][1]: grouped[-1] = [frame_i, score_i]
        else:
            grouped.append([frame_i, score_i])

    shots = []
    for frame_i, score_i in grouped:
        if not shots:
            shots.append([frame_i, score_i]); continue
        if frame_i - shots[-1][0] >= MIN_SHOT_GAP_FRAMES:
            shots.append([frame_i, score_i])
        else:
            if score_i > shots[-1][1]: shots[-1] = [frame_i, score_i]

    print(f"[CrickEye] Shot onsets found: {len(shots)}")
    ws_emit(ws, loop, {"type": "onsets_found", "count": len(shots)})
    return [(p[0], p[1]) for p in shots]

# -----------------------------------------------------------------
# STANCE DETECTION
# -----------------------------------------------------------------

def vote_handedness_from_keypoints(all_keypoints, pre_start, pre_end, frame_w):
    rhb_weight = 0.0
    lhb_weight = 0.0
    window = [all_keypoints[f] for f in range(pre_start, pre_end)
              if f < len(all_keypoints)]
    if not window:
        return None, 0.0

    frame_cx = frame_w / 2.0
    for kp in window:
        if kp['pose_conf'] < MIN_POSE_CONF: continue
        ls = kp['ls']; rs = kp['rs']
        la = kp['la']; ra = kp['ra']
        lw = kp['lw']; rw = kp['rw']

        if ls and rs:
            sd = rs[1] - ls[1]
            if abs(sd) > 2.0:
                if sd > 0: rhb_weight += W_SHOULDER
                else:      lhb_weight += W_SHOULDER

        if la and ra:
            if abs(ra[0]-frame_cx) > abs(la[0]-frame_cx): rhb_weight += W_BACK_FOOT
            else:                                           lhb_weight += W_BACK_FOOT

        first_kp = window[0]
        if lw and first_kp['lw'] and rw and first_kp['rw']:
            drw = rw[1] - first_kp['rw'][1]
            dlw = lw[1] - first_kp['lw'][1]
            if abs(drw) > 3.0 or abs(dlw) > 3.0:
                if drw > dlw: rhb_weight += W_WRIST_DROP
                else:         lhb_weight += W_WRIST_DROP

    first_kp = window[0]; last_kp = window[-1]
    la_move = ra_move = 0.0
    if first_kp['la'] and last_kp['la']:
        la_move = float(np.hypot(last_kp['la'][0]-first_kp['la'][0],
                                  last_kp['la'][1]-first_kp['la'][1]))
    if first_kp['ra'] and last_kp['ra']:
        ra_move = float(np.hypot(last_kp['ra'][0]-first_kp['ra'][0],
                                  last_kp['ra'][1]-first_kp['ra'][1]))
    if la_move > 4.0 or ra_move > 4.0:
        if la_move > ra_move: rhb_weight += W_FRONT_FOOT
        else:                  lhb_weight += W_FRONT_FOOT

    total = rhb_weight + lhb_weight
    if total == 0: return None, 0.0
    if rhb_weight >= lhb_weight: return 'RHB', round(rhb_weight/total, 2)
    else:                         return 'LHB', round(lhb_weight/total, 2)

# -----------------------------------------------------------------
# SHOT CLASSIFIER
# -----------------------------------------------------------------

def load_shot_classifier(checkpoint_path, device):
    print(f"[CrickEye] Loading shot classifier: {checkpoint_path}")
    ckpt  = torch.load(checkpoint_path, map_location=device)
    model = torchvision.models.video.swin3d_t(weights=None)
    model.head = nn.Linear(model.head.in_features, len(SHOT_CLASSES))
    model.load_state_dict(ckpt['model_state_dict'])
    model.eval().to(device)
    print("[CrickEye] Shot classifier ready")
    return model


def apply_clahe(frame_rgb):
    lab = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2LAB)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    lab[:, :, 0] = clahe.apply(lab[:, :, 0])
    return cv2.cvtColor(lab, cv2.COLOR_LAB2RGB)


def frames_to_tensor(frames_rgb, device):
    T = len(frames_rgb)
    scale = T / 40.0
    z0_end = max(1, int(14*scale))
    z1_start = z0_end
    z1_end = max(z1_start+1, int(27*scale))
    z2_start = z1_end
    early = np.linspace(0, z0_end, 5, dtype=int)
    mid   = np.linspace(z1_start, z1_end, 8, dtype=int)
    late  = np.linspace(z2_start, T-1, 3, dtype=int)
    indices = sorted(dict.fromkeys(np.concatenate([early, mid, late]).tolist()))[:NUM_FRAMES]
    while len(indices) < NUM_FRAMES: indices.append(T-1)

    mean_arr = np.array(MEAN, dtype=np.float32)
    std_arr  = np.array(STD,  dtype=np.float32)
    proc = []
    for i in indices:
        f = cv2.resize(frames_rgb[i], (IMG_SIZE, IMG_SIZE))
        proc.append(apply_clahe(f))
    arr = np.stack(proc, axis=0).astype(np.float32) / 255.0
    arr = (arr - mean_arr) / std_arr
    arr = arr.transpose(3, 0, 1, 2)
    return torch.from_numpy(arr).unsqueeze(0).to(device)


def classify_shot(model, frames_rgb, device):
    if len(frames_rgb) < 4:
        return 'unclear', 0.0, [0.2]*len(SHOT_CLASSES)
    tensor = frames_to_tensor(frames_rgb, device)
    with torch.no_grad():
        logits = model(tensor)
        probs  = torch.softmax(logits, dim=1)[0].cpu().numpy()
    top = int(probs.argmax())
    return SHOT_CLASSES[top], float(probs[top]), probs.tolist()

# -----------------------------------------------------------------
# CALIBRATION HELPER
# -----------------------------------------------------------------

def px_per_frame_to_kmh(peak_px_per_frame, shoulder_px, fps):
    """
    Convert raw bilateral wrist velocity (px/frame) to km/h bat-tip speed.

    Steps:
      1. px/frame  ->  m/s  :  multiply by fps, then by metres_per_pixel
      2. m/s       ->  km/h :  multiply by 3.6
      3. wrist     ->  tip  :  multiply by BAT_TIP_MULTIPLIER

    Falls back to a fixed scale (shoulder_px = 60px ~= typical net-session
    pixel width) if pose didn't detect shoulders for this shot.
    """
    if shoulder_px and shoulder_px > 10.0:
        metres_per_pixel = SHOULDER_WIDTH_M / shoulder_px
    else:
        # CALIBRATION fallback: assume 60 px shoulder in frame
        metres_per_pixel = SHOULDER_WIDTH_M / SHOULDER_FALLBACK_PX

    speed_ms  = peak_px_per_frame * fps * metres_per_pixel
    speed_kmh = speed_ms * 3.6 * BAT_TIP_MULTIPLIER
    speed_kmh = min(speed_kmh, SPEED_SANITY_CAP_KMH)
    return round(speed_kmh, 1)

# -----------------------------------------------------------------
# PLAIN ENGLISH LABELS — single source of truth for player-facing text
# -----------------------------------------------------------------

PLAIN_ENGLISH = {
    # Head position — short chips for the card
    "HEAD_LATERAL_DRIFT"      : "Eyes off the ball",
    "HEAD_VERTICAL_DRIFT"     : "Head moving too early",
    "HEAD_DUCKING_PULL"       : "Head too low on the pull",
    # Stance
    "STANCE_ASYMMETRIC"       : "Stance uneven",
    # Bat control
    "ELBOW_COLLAPSE"          : "Bat too tight to the body",
    "ELBOW_COLLAPSE_PULL"     : "Bat rolling across on the pull",
    "ELBOW_REACHING"          : "Reaching for the ball",
    "ELBOW_REACHING_FLICK"    : "Flick: trying too hard",
    "ELBOW_BEHIND_PAD"        : "Sweep: bat turning in early",
    # Balance (kept for JSON / dev)
    "NARROW_BASE"             : "Feet a bit narrow",
    "WIDE_BASE"               : "Feet a bit wide",
    "LOW_WEIGHT_TRANSFER"     : "Mostly arms, less body",
    "OVER_COMMITTED"          : "Lunging at the ball",
    "SPINE_COLLAPSE"          : "Too low in the body",
    "STIFF_LEGGED"            : "Legs very straight",
    # Foot movement
    "FLAT_FOOTED"             : "Little movement with the feet",
    "LATE_PLANT"              : "Front foot down late",
    # Fatigue
    "LOW_BAT_SPEED"           : "Soft swing — add intent",
    "FATIGUE"                 : "Swing dropping off late",
}

HEAD_QUALITY_LABEL = [
    (85, "Ball watched well"),
    (70, "Head fairly still"),
    (50, "Small head movement"),
    (35, "Eyes leaving the ball"),
    (0,  "Lost sight of the ball"),
]

SYMMETRY_LABEL = [
    (80, "Balanced stance"),
    (60, "Slight open shape"),
    (40, "Leaning a bit"),
    (20, "Off balance"),
]

SWING_INTENSITY_LABEL = [
    (80, "Strong, committed swing"),
    (60, "Good tempo"),
    (40, "Gentle swing"),
    (20, "Mostly arms"),
    (0,  "Very little swing"),
]

SHOT_SCORE_LABEL = [
    (8.5, "Top class"),
    (6.5, "Good"),
    (4.5, "Average"),
    (0,   "Poor"),
]

def plain_flag(flag_key):
    return PLAIN_ENGLISH.get(flag_key, flag_key.replace('_', ' ').title())

def label_from_scale(value, scale):
    if value is None:
        return "No data"
    for threshold, label in scale:
        if value >= threshold:
            return label
    return scale[-1][1]


# -----------------------------------------------------------------
# Final shot score — uses session-normalized swing_intensity
# -----------------------------------------------------------------

def _recompute_shot_score_from_final_swing(e):
    """Re-run composite /10 using session-normalized swing_intensity."""
    hq = float(e.get('head_quality_score') or 0)
    head_pts = (hq / 100.0) * 35.0
    fw = float(e.get('footwork_score') or 0)
    footwork_pts = (fw / 100.0) * 25.0
    sym = e.get('symmetry_score')
    if sym is not None:
        sym_pts = (float(sym) / 100.0) * 15.0
    else:
        sym_pts = 7.5
    elbow_collapse = e.get('elbow_collapse') or 'unknown'
    label = e.get('label') or 'cover'
    elbow_pts_map = {
        "consistent": 15.0,
        "marginal":    9.0,
        "reaching":    5.0,
        "cramped":     3.0,
        "unknown":     7.5,
    }
    if label == 'pull' and elbow_collapse == 'cramped':
        elbow_pts = 1.5
    else:
        elbow_pts = elbow_pts_map.get(elbow_collapse, 7.5)
    si = float(e.get('swing_intensity') or 0)
    swing_pts = (si / 100.0) * 10.0
    raw = head_pts + footwork_pts + sym_pts + elbow_pts + swing_pts
    shot_score = round(raw / 10.0, 1)
    e['shot_score'] = shot_score
    if shot_score >= 8.5:
        e['shot_quality'] = 'Top class'
    elif shot_score >= 6.5:
        e['shot_quality'] = 'Good'
    elif shot_score >= 4.5:
        e['shot_quality'] = 'Average'
    else:
        e['shot_quality'] = 'Poor'
    e['shot_quality_label'] = label_from_scale(
        shot_score * 10,
        [(85, "Top class"), (65, "Good"), (45, "Average"), (0, "Poor")],
    )


def finalize_shot_player_copy(e):
    """Call after swing_intensity is session-normalized. Updates shot_score / quality only."""
    _recompute_shot_score_from_final_swing(e)


# -----------------------------------------------------------------
# SWING INTENSITY — P90 of rolling-mean bilateral velocity
# -----------------------------------------------------------------

SWING_INTENSITY_ROLLING_W = 5   # rolling mean window (frames)

def _compute_swing_intensity_raw(clip_bilateral):
    """
    P90 of a 5-frame rolling mean of bilateral velocity within the clip.
    Filters single-frame keypoint jitter while still capturing genuine
    peak effort. Returns raw P90 value in px/frame.
    """
    if not clip_bilateral or len(clip_bilateral) < SWING_INTENSITY_ROLLING_W:
        if clip_bilateral:
            return float(np.max(clip_bilateral))
        return 0.0
    arr = np.array(clip_bilateral, dtype=np.float32)
    kernel = np.ones(SWING_INTENSITY_ROLLING_W) / SWING_INTENSITY_ROLLING_W
    smoothed = np.convolve(arr, kernel, mode='valid')
    return float(np.percentile(smoothed, 90))

def _compute_bat_speed_kmh(raw_p90_px, shoulder_px, session_shoulder_px, fps):
    """Convert raw P90 px/frame to km/h estimate (kept in JSON for dev use)."""
    candidates = []
    if shoulder_px and shoulder_px >= 40.0:
        candidates.append(shoulder_px)
    if session_shoulder_px and session_shoulder_px >= 40.0:
        candidates.append(session_shoulder_px)
    candidates.append(SHOULDER_FALLBACK_PX)
    best_shoulder = max(candidates)
    metres_per_pixel = SHOULDER_WIDTH_M / best_shoulder
    speed_ms  = raw_p90_px * fps * metres_per_pixel
    speed_kmh = speed_ms * 3.6 * BAT_TIP_MULTIPLIER
    speed_kmh = min(speed_kmh, SPEED_SANITY_CAP_KMH)
    is_capped = (speed_kmh >= SPEED_SANITY_CAP_KMH * 0.99)
    return round(speed_kmh, 1), is_capped

# -----------------------------------------------------------------
# FOOTWORK DETECTION
# -----------------------------------------------------------------

# Trigger movement: pre-delivery foot press/lift detected via ankle
# Y-axis dip-then-rise in the pre-shot window.
# -- Footwork thresholds
FOOTWORK_POSE_CONF_MIN   = 0.35

# Front foot plant: ankle Y-velocity drops to near-zero after descent
PLANT_VEL_THRESHOLD       = 1.5    # px/frame — below = "planted"
PLANT_MIN_DESCENT_PX      = 4.0    # min total Y-descent to qualify as stride
PLANT_GOOD_TIMING_FRAMES  = 4      # plant within +/- this many frames of contact = good

# Shot types where front-foot plant is the primary footwork measure
FRONT_FOOT_SHOTS = {'cover', 'straight', 'flick'}
BACK_FOOT_SHOTS  = {'pull', 'sweep'}


def _measure_pre_shot_movement(all_keypoints, pre_start, pre_end):
    """
    Measure total ankle movement in the pre-shot window.
    Returns (movement_px, n_frames) — total ankle midpoint displacement
    and how many frames contributed. Higher movement = more active feet.
    """
    ankle_pts = []
    for f in range(pre_start, pre_end):
        if f >= len(all_keypoints):
            break
        kp = all_keypoints[f]
        if kp.get('pose_conf', 0) < FOOTWORK_POSE_CONF_MIN:
            continue
        la = kp.get('la')
        ra = kp.get('ra')
        if la and ra:
            ankle_pts.append(((la[0]+ra[0])/2.0, (la[1]+ra[1])/2.0))
        elif la:
            ankle_pts.append(la)
        elif ra:
            ankle_pts.append(ra)

    if len(ankle_pts) < 3:
        return 0.0, len(ankle_pts)

    total_move = 0.0
    for i in range(1, len(ankle_pts)):
        dx = ankle_pts[i][0] - ankle_pts[i-1][0]
        dy = ankle_pts[i][1] - ankle_pts[i-1][1]
        total_move += float(np.hypot(dx, dy))

    return round(total_move, 1), len(ankle_pts)


def _detect_foot_plant(all_keypoints, onset_frame, contact_frame, end_frame,
                       handedness, shot_label):
    """
    Detect when the front foot plants relative to contact.
    Front foot = left ankle for RHB on front-foot shots.
    Returns (plant_frame: int or None, timing: int or None).
    timing = plant_frame - contact_frame (negative = planted before contact = good).
    """
    N = len(all_keypoints)

    is_front_foot = shot_label in FRONT_FOOT_SHOTS
    is_back_foot  = shot_label in BACK_FOOT_SHOTS

    if not (is_front_foot or is_back_foot):
        return None, None

    if is_front_foot:
        ankle_key = 'la' if handedness == 'RHB' else 'ra'
    else:
        ankle_key = 'ra' if handedness == 'RHB' else 'la'

    scan_start = max(0, onset_frame - 5)
    scan_end   = min(N, end_frame)

    ankle_track = []
    for f in range(scan_start, scan_end):
        kp = all_keypoints[f]
        if kp.get('pose_conf', 0) < FOOTWORK_POSE_CONF_MIN:
            continue
        pt = kp.get(ankle_key)
        if pt:
            ankle_track.append((f, pt[1]))

    if len(ankle_track) < 4:
        return None, None

    frames = [t[0] for t in ankle_track]
    ys     = [t[1] for t in ankle_track]

    velocities = []
    for i in range(1, len(ys)):
        dt = max(1, frames[i] - frames[i-1])
        velocities.append((frames[i], (ys[i] - ys[i-1]) / dt))

    if not velocities:
        return None, None

    total_descent = max(ys) - min(ys[:max(1, len(ys)//2)])
    if total_descent < PLANT_MIN_DESCENT_PX:
        return None, None

    was_moving = False
    plant_frame = None
    for vf, vel in velocities:
        if vf < onset_frame:
            continue
        if abs(vel) > PLANT_VEL_THRESHOLD:
            was_moving = True
        elif was_moving and abs(vel) <= PLANT_VEL_THRESHOLD:
            plant_frame = vf
            break

    if plant_frame is None:
        return None, None

    timing = plant_frame - contact_frame
    return plant_frame, timing


FOOTWORK_LABEL = [
    (80, "Good foot timing"),
    (60, "Front foot used well"),
    (40, "Late or stretching"),
    (20, "Feet very quiet"),
    (0,  "Almost no step"),
]

def _compute_footwork_score(pre_shot_movement, plant_timing, shot_label,
                            shoulder_px):
    """
    Footwork score (0-100) based on:
    - Pre-shot foot activity (did the feet move at all before the swing?)
    - Plant timing (did the foot get down before contact?)
    """
    # Pre-shot activity: normalize by shoulder width for camera-independence
    norm_movement = (pre_shot_movement / max(shoulder_px, 30.0))

    # Activity score: 0-50 points
    if norm_movement >= 0.40:
        activity_pts = 50.0
    elif norm_movement >= 0.20:
        activity_pts = 35.0
    elif norm_movement >= 0.10:
        activity_pts = 20.0
    else:
        activity_pts = 5.0

    # Plant timing: 0-50 points
    plant_pts = 0.0
    if plant_timing is not None:
        if abs(plant_timing) <= PLANT_GOOD_TIMING_FRAMES:
            plant_pts = 50.0
        elif plant_timing > PLANT_GOOD_TIMING_FRAMES:
            late_by = plant_timing - PLANT_GOOD_TIMING_FRAMES
            plant_pts = max(0.0, 50.0 - late_by * 8.0)
        else:
            plant_pts = 40.0   # early plant is still good
    elif shot_label in FRONT_FOOT_SHOTS:
        plant_pts = 5.0    # no plant on front-foot shot = limited
    else:
        plant_pts = 25.0   # back-foot: plant less critical

    return round(min(100.0, activity_pts + plant_pts), 1)


# -----------------------------------------------------------------
# BIOMECHANICS ENGINE
# -----------------------------------------------------------------

def _session_shoulder_median_all_frames(all_keypoints):
    """Robust session-wide shoulder width (px) for cross-clip calibration."""
    widths = []
    for kp in all_keypoints:
        if kp.get('pose_conf', 0) < SHOULDER_POSE_CONF_MIN:
            continue
        ls, rs = kp.get('ls'), kp.get('rs')
        if ls and rs:
            w = float(np.hypot(rs[0] - ls[0], rs[1] - ls[1]))
            if w > MIN_SHOULDER_PX:
                widths.append(w)
    if not widths:
        return None
    med = float(np.median(widths))
    return med if med > MIN_SHOULDER_PX else None


def _shoulder_px_from_window(all_keypoints, start_f, end_f,
                             session_shoulder_px=None):
    """
    Median shoulder width across the clip window, gated by pose confidence.
    If session_shoulder_px is set, keep widths within SHOULDER_SESSION_BAND
    of that median to drop per-clip outliers. Falls back to session median,
    then SHOULDER_FALLBACK_PX.
    """
    widths = []
    for f in range(max(0, start_f), min(end_f, len(all_keypoints))):
        kp = all_keypoints[f]
        if kp.get('pose_conf', 0) < SHOULDER_POSE_CONF_MIN:
            continue
        ls = kp.get('ls')
        rs = kp.get('rs')
        if ls and rs:
            w = float(np.hypot(rs[0] - ls[0], rs[1] - ls[1]))
            if w > MIN_SHOULDER_PX:
                widths.append(w)

    def _pick_median(ws):
        if not ws:
            return None
        m = float(np.median(ws))
        return m if m > MIN_SHOULDER_PX else None

    if not widths:
        if session_shoulder_px and session_shoulder_px > MIN_SHOULDER_PX:
            return session_shoulder_px
        return SHOULDER_FALLBACK_PX

    use_widths = widths
    if session_shoulder_px and session_shoulder_px > MIN_SHOULDER_PX:
        lo = session_shoulder_px / SHOULDER_SESSION_BAND
        hi = session_shoulder_px * SHOULDER_SESSION_BAND
        filtered = [w for w in widths if lo <= w <= hi]
        if len(filtered) >= 2:
            use_widths = filtered

    median_w = _pick_median(use_widths)
    if median_w is None:
        median_w = _pick_median(widths)
    if median_w is None:
        if session_shoulder_px and session_shoulder_px > MIN_SHOULDER_PX:
            return session_shoulder_px
        return SHOULDER_FALLBACK_PX
    return median_w


def extract_biomechanics(all_keypoints, lw_vels, rw_vels, bilateral,
                         start_frame, onset_frame, end_frame,
                         handedness='RHB',
                         fps=30.0,
                         shot_label='cover',
                         session_shoulder_px=None):
    N = len(all_keypoints)

    def kp_at(f):
        return all_keypoints[max(0, min(f, N - 1))]

    # ── Clip-relative pre-shot window ────────────────────────────────────
    # FIX: Use the first 30% of the clip as "pre-shot" instead of a fixed
    # -10 to -3 offset from onset. Short YouTube clips start AT stance so
    # there are no pre-swing quiet frames before onset_frame - 10.
    clip_len   = max(1, end_frame - start_frame)
    pre_start  = start_frame
    pre_end    = start_frame + max(4, int(clip_len * 0.30))
    pre_end    = min(pre_end, onset_frame)   # never go past onset

    # ── Contact frame: peak bilateral velocity inside clip ───────────────
    clip_bilateral = bilateral[start_frame:end_frame]
    if not clip_bilateral:
        clip_bilateral = [0.0]
    contact_frame = start_frame + int(np.argmax(clip_bilateral))

    # ── Shoulder width — clip window + optional session median for stability ─
    shoulder_px = _shoulder_px_from_window(
        all_keypoints, start_frame, end_frame,
        session_shoulder_px=session_shoulder_px,
    )

    # ── Swing intensity (P90 of rolling-mean bilateral velocity) ────────
    swing_raw_p90 = _compute_swing_intensity_raw(clip_bilateral)
    peak_swing_speed_kmh, speed_is_capped = _compute_bat_speed_kmh(
        swing_raw_p90, shoulder_px, session_shoulder_px, fps
    )
    # swing_intensity (0-100) is computed post-hoc after all shots are scored,
    # so we store the raw P90 now and fill the percentile later.
    _swing_raw = swing_raw_p90

    # ── HEAD POSITION QUALITY ────────────────────────────────────────────
    # Uses nose position (or ear midpoint fallback) from pre-shot onset
    # through contact. Front-on camera: X = lateral, Y = vertical.
    head_rule = HEAD_RULES.get(shot_label, HEAD_RULES_DEFAULT)
    lat_w, vert_w, vert_free = head_rule[0], head_rule[1], head_rule[2]
    lat_flag_thr  = head_rule[3]
    vert_flag_thr = head_rule[4]
    lat_free      = head_rule[5] if len(head_rule) > 5 else 0.0

    nose_pts = []
    for f in range(max(start_frame, onset_frame - 6), min(N, contact_frame + 8)):
        n = kp_at(f).get('nose')
        if n:
            nose_pts.append(n)
        else:
            le = kp_at(f).get('l_ear')
            re = kp_at(f).get('r_ear')
            if le and re:
                nose_pts.append(((le[0]+re[0])/2.0, (le[1]+re[1])/2.0))

    head_lateral_ratio  = None
    head_vertical_ratio = None
    head_flag           = None
    head_frames_used    = len(nose_pts)
    head_confidence     = "measured"

    if head_frames_used >= 2 and shoulder_px > 10:
        lat_std  = float(np.std([p[0] for p in nose_pts]))
        vert_std = float(np.std([p[1] for p in nose_pts]))

        head_lateral_ratio  = round(lat_std  / shoulder_px, 4)
        head_vertical_ratio = round(vert_std / shoulder_px, 4)

        penalised_lat  = max(0.0, head_lateral_ratio  - lat_free)
        penalised_vert = max(0.0, head_vertical_ratio - vert_free)
        combined = (lat_w * penalised_lat + vert_w * penalised_vert)

        head_quality_score = round(100.0 / (1.0 + combined * HEAD_SCORE_MULTIPLIER), 1)

        if head_frames_used < 5:
            head_confidence = "low"

        if head_lateral_ratio > lat_flag_thr:
            head_flag = "HEAD_LATERAL_DRIFT"
        elif shot_label not in ('pull', 'sweep') and penalised_vert > vert_flag_thr:
            head_flag = "HEAD_VERTICAL_DRIFT"
        elif shot_label == 'pull' and head_frames_used >= 5:
            early_y = float(np.mean([p[1] for p in nose_pts[:3]]))
            late_y  = float(np.mean([p[1] for p in nose_pts[-3:]]))
            if (late_y - early_y) / shoulder_px > 0.15:
                head_flag = "HEAD_DUCKING_PULL"

    elif head_frames_used == 1 and shoulder_px > 10:
        head_quality_score = 45.0
        head_confidence = "estimated"
    else:
        # Zero nose frames: conservative default by shot type
        _defaults = {'pull': 55.0, 'sweep': 50.0, 'cover': 40.0,
                     'straight': 40.0, 'flick': 35.0}
        head_quality_score = _defaults.get(shot_label, 40.0)
        head_confidence = "estimated"

    # ── STANCE SYMMETRY (shoulder + hip tilt) ───────────────────────────
    # Symmetry: scan FULL clip for stable stance frames.
    # A "stable" frame = pose_conf >= 0.45 AND bilateral velocity
    # at that frame is below 0.3 * max bilateral in clip
    # (i.e. the batsman is not mid-swing). This gives us true
    # setup frames anywhere in the clip, not just the first 30%.

    max_bil = max(clip_bilateral) if clip_bilateral else 1.0
    stable_threshold_bil = max_bil * 0.30

    shoulder_tilts = []
    hip_tilts      = []

    for f in range(start_frame, end_frame):
        if f >= N: break
        kp = kp_at(f)
        if kp.get('pose_conf', 0) < 0.45:
            continue
        bil_at_f = bilateral[f] if f < len(bilateral) else 0.0
        if bil_at_f > stable_threshold_bil:
            continue   # skip frames where the bat is moving
        ls, rs = kp.get('ls'), kp.get('rs')
        lh, rh = kp.get('lh'), kp.get('rh')
        if ls and rs:
            raw_ang = abs(float(np.degrees(np.arctan2(
                rs[1]-ls[1], rs[0]-ls[0]))))
            tilt = raw_ang if raw_ang <= 90 else 180.0 - raw_ang
            if tilt <= 45.0:   # >45 deg = bad pose detection, discard
                shoulder_tilts.append(tilt)
        if lh and rh:
            raw_ang = abs(float(np.degrees(np.arctan2(
                rh[1]-lh[1], rh[0]-lh[0]))))
            tilt = raw_ang if raw_ang <= 90 else 180.0 - raw_ang
            if tilt <= 45.0:
                hip_tilts.append(tilt)

    # Use median (robust to single-frame noise)
    avg_shoulder_tilt = float(np.median(shoulder_tilts)) if shoulder_tilts else None
    avg_hip_tilt      = float(np.median(hip_tilts))      if hip_tilts      else None

    symmetry_score = None
    stance_flag    = None

    if len(shoulder_tilts) >= 3 or len(hip_tilts) >= 3:
        st = min(avg_shoulder_tilt or 0.0, 18.0)
        ht = min(avg_hip_tilt      or 0.0, 14.0)
        # Score: 100 = perfectly level, 20 = floor (not zero)
        symmetry_score = round(max(20.0, 100.0 - (st * 3.0 + ht * 3.0)), 1)
        # Only flag if we have 5+ stable readings AND tilt is genuinely high
        if ((len(shoulder_tilts) >= 5 and (avg_shoulder_tilt or 0) > 14.0) or
                (len(hip_tilts) >= 5 and (avg_hip_tilt or 0) > 11.0)):
            stance_flag = "STANCE_ASYMMETRIC"

    # ── ELBOW SHAPE (arm geometry) ───────────────────────────────────────
    # Front-on: elbow X-spread relative to shoulder width is valid.
    def elbow_spread_ratio(f_start, f_end):
        ratios = []
        for f in range(max(0, f_start), min(N, f_end)):
            kp = kp_at(f)
            if kp.get('pose_conf', 0) < 0.35:
                continue
            le = kp.get('le')
            re = kp.get('re')
            if le and re and shoulder_px > 10:
                spread = float(abs(re[0] - le[0]))
                ratios.append(spread / shoulder_px)
        return float(np.median(ratios)) if len(ratios) >= MIN_ELBOW_FRAMES else None

    setup_elbow_ratio   = elbow_spread_ratio(pre_start, pre_end)
    contact_elbow_ratio = elbow_spread_ratio(
        max(0, contact_frame - 2), min(N, contact_frame + 3))

    elbow_collapse = "unknown"
    elbow_delta    = None
    elbow_flag     = None

    if setup_elbow_ratio is not None and contact_elbow_ratio is not None:
        elbow_delta = round(
            (contact_elbow_ratio - setup_elbow_ratio) / max(setup_elbow_ratio, 0.01), 3)
        if elbow_delta < -0.25:
            elbow_collapse = "cramped"
            elbow_flag = ("ELBOW_COLLAPSE_PULL"
                          if shot_label == 'pull' else "ELBOW_COLLAPSE")
        elif elbow_delta > 0.25:
            elbow_collapse = "reaching"
            elbow_flag = ("ELBOW_REACHING_FLICK"
                          if shot_label == 'flick' else "ELBOW_REACHING")
        elif abs(elbow_delta) <= 0.15:
            elbow_collapse = "consistent"
        else:
            elbow_collapse = "marginal"

    elbow_behind_pad = False
    if shot_label == 'sweep':
        cf_kp = kp_at(contact_frame)
        if handedness == 'RHB':
            le_c = cf_kp.get('le'); lk_c = cf_kp.get('lk')
            if le_c and lk_c and le_c[0] > lk_c[0] + 10:
                elbow_behind_pad = True
                elbow_flag = "ELBOW_BEHIND_PAD"
        else:
            re_c = cf_kp.get('re'); rk_c = cf_kp.get('rk')
            if re_c and rk_c and re_c[0] < rk_c[0] - 10:
                elbow_behind_pad = True
                elbow_flag = "ELBOW_BEHIND_PAD"

    # ── FOOTWORK — Pre-shot movement + Front Foot Plant timing ─────────
    pre_shot_movement, pre_shot_frames = _measure_pre_shot_movement(
        all_keypoints, pre_start, pre_end)
    plant_frame, plant_timing = _detect_foot_plant(
        all_keypoints, onset_frame, contact_frame, end_frame,
        handedness, shot_label)
    footwork_score = _compute_footwork_score(
        pre_shot_movement, plant_timing, shot_label, shoulder_px)

    # Foot activity level for display
    norm_move = pre_shot_movement / max(shoulder_px, 30.0)
    feet_active = norm_move >= 0.15

    footwork_flag = None
    if not feet_active and (plant_timing is None or plant_timing > PLANT_GOOD_TIMING_FRAMES):
        footwork_flag = "FLAT_FOOTED"
    elif plant_timing is not None and plant_timing > PLANT_GOOD_TIMING_FRAMES:
        footwork_flag = "LATE_PLANT"

    # ════════════════════════════════════════════════════════════════════
    # SHOT SCORE — WEIGHTED COMPOSITE (100 pts / 10 for display)
    # Only reliable front-on metrics:
    #   Head quality   35% — #1 batting fundamental, most reliable metric
    #   Footwork       25% — #2 coaching priority, trigger + plant
    #   Symmetry       15% — pre-delivery setup quality (now fixed)
    #   Elbow shape    15% — arm mechanics, relative delta is reliable
    #   Swing intensity 10% — effort/consistency indicator
    # ════════════════════════════════════════════════════════════════════

    # Head (35 pts) — always has a score now (estimated if no nose frames)
    head_pts = (head_quality_score / 100.0) * 35.0

    # Footwork (25 pts)
    footwork_pts = (footwork_score / 100.0) * 25.0

    # Symmetry (15 pts)
    if symmetry_score is not None:
        sym_pts = (symmetry_score / 100.0) * 15.0
    else:
        sym_pts = 7.5   # neutral

    # Elbow (15 pts)
    elbow_pts_map = {
        "consistent": 15.0,
        "marginal":    9.0,
        "reaching":    5.0,
        "cramped":     3.0,
        "unknown":     7.5,
    }
    if shot_label == 'pull' and elbow_collapse == 'cramped':
        elbow_pts = 1.5
    else:
        elbow_pts = elbow_pts_map.get(elbow_collapse, 7.5)

    # Swing intensity (10 pts) — filled as session-relative percentile later;
    # for now use raw P90 scaled against a reasonable max (~50 px/frame)
    swing_intensity_preliminary = min(100.0, (_swing_raw / 50.0) * 100.0)
    swing_pts = (swing_intensity_preliminary / 100.0) * 10.0

    raw_score  = head_pts + footwork_pts + sym_pts + elbow_pts + swing_pts
    shot_score = round(raw_score / 10.0, 1)

    if shot_score >= 8.5:   shot_quality = "Top class"
    elif shot_score >= 6.5: shot_quality = "Good"
    elif shot_score >= 4.5: shot_quality = "Average"
    else:                   shot_quality = "Poor"

    # Collect flags — only reliable metrics
    all_metric_flags = [
        f for f in [
            head_flag, stance_flag, elbow_flag, footwork_flag,
        ] if f is not None
    ]

    # ── Data quality indicator ────────────────────────────────────────
    reliable_count = sum([
        head_quality_score is not None,
        symmetry_score is not None,
        elbow_collapse not in ("unknown", None),
        footwork_score is not None,
    ])

    if reliable_count >= 3:
        data_quality = "good"
    elif reliable_count >= 2:
        data_quality = "partial"
    else:
        data_quality = "limited"

    data_quality_note = {
        "good"   : "Reliable read",
        "partial": "Some numbers estimated",
        "limited": "Rough — clip very short",
    }[data_quality]

    return {
        # ── Head ──────────────────────────────────────────────────────────
        "head_quality_score"    : head_quality_score,
        "head_lateral_ratio"    : head_lateral_ratio,
        "head_vertical_ratio"   : head_vertical_ratio,
        "head_frames_used"      : head_frames_used,
        "head_flag"             : head_flag,
        # ── Symmetry ──────────────────────────────────────────────────────
        "symmetry_score"        : symmetry_score,
        "avg_shoulder_tilt"     : round(avg_shoulder_tilt, 2) if avg_shoulder_tilt else None,
        "avg_hip_tilt"          : round(avg_hip_tilt, 2)      if avg_hip_tilt      else None,
        "stance_flag"           : stance_flag,
        # ── Swing Intensity / Bat Speed ───────────────────────────────────
        "peak_swing_speed"      : peak_swing_speed_kmh,
        "speed_is_capped"       : speed_is_capped,
        "swing_raw_p90"         : round(_swing_raw, 2),
        "swing_intensity"       : round(swing_intensity_preliminary, 1),
        # ── Elbow ─────────────────────────────────────────────────────────
        "elbow_collapse"        : elbow_collapse,
        "elbow_delta"           : elbow_delta,
        "setup_elbow_ratio"     : round(setup_elbow_ratio, 3)   if setup_elbow_ratio   else None,
        "contact_elbow_ratio"   : round(contact_elbow_ratio, 3) if contact_elbow_ratio else None,
        "elbow_behind_pad"      : elbow_behind_pad,
        "elbow_flag"            : elbow_flag,
        # ── Footwork ──────────────────────────────────────────────────────
        "feet_active"           : feet_active,
        "pre_shot_movement"     : pre_shot_movement,
        "plant_timing"          : plant_timing,
        "footwork_score"        : footwork_score,
        "footwork_flag"         : footwork_flag,
        # ── Score ─────────────────────────────────────────────────────────
        "shot_score"            : shot_score,
        "shot_quality"          : shot_quality,
        "flags"                 : all_metric_flags,
        # ── Plain English labels (for direct frontend display) ────────────
        "head_confidence"       : head_confidence,
        "head_quality_label"    : (label_from_scale(head_quality_score, HEAD_QUALITY_LABEL)
                                   + (" (approx.)" if head_confidence == "estimated" else "")),
        "symmetry_label"        : label_from_scale(symmetry_score, SYMMETRY_LABEL),
        "swing_intensity_label" : label_from_scale(swing_intensity_preliminary, SWING_INTENSITY_LABEL),
        "footwork_label"        : label_from_scale(footwork_score, FOOTWORK_LABEL),
        "shot_quality_label"    : label_from_scale(shot_score * 10, [(85,"Top class"),(65,"Good"),(45,"Average"),(0,"Poor")]),
        "flags_plain"           : [plain_flag(f) for f in all_metric_flags],
        # ── Data quality ──────────────────────────────────────────────────
        "data_quality"          : data_quality,
        "data_quality_note"     : data_quality_note,
    }

# -----------------------------------------------------------------
# SESSION ANALYSIS ENGINE
# -----------------------------------------------------------------

def run_session_analysis(shot_log, session_info):
    confirmed = [e for e in shot_log if e['conf'] >= CONF_THRESHOLD]
    if not confirmed:
        return {"error": "No confirmed shots to analyse."}

    n = len(confirmed)

    def safe_mean(lst):
        vals = [v for v in lst if v is not None]
        return round(float(np.mean(vals)), 2) if vals else None

    def safe_std(lst):
        vals = [v for v in lst if v is not None]
        return round(float(np.std(vals)), 2) if len(vals) > 1 else None

    # dict.get(k, default) does not substitute when the value is explicitly None.
    def _head_quality_for_min(e):
        v = e.get('head_quality_score')
        return float('-inf') if v is None else float(v)

    def _shot_score_for_max(e):
        v = e.get('shot_score')
        return float('-inf') if v is None else float(v)

    def _shot_score_for_min(e):
        v = e.get('shot_score')
        return float('inf') if v is None else float(v)

    by_type = defaultdict(list)
    for e in confirmed:
        by_type[e['label']].append(e)

    type_stats = {}
    for shot_type, shots in by_type.items():
        def agg(key):
            return {
                'mean': safe_mean([s.get(key) for s in shots]),
                'std' : safe_std( [s.get(key) for s in shots]),
                'n'   : len(shots),
            }
        type_stats[shot_type] = {
            'count'              : len(shots),
            'avg_conf'           : safe_mean([s['conf'] for s in shots]),
            'swing_intensity'    : agg('swing_intensity'),
            'head_quality_score' : agg('head_quality_score'),
            'symmetry_score'     : agg('symmetry_score'),
            'footwork_score'     : agg('footwork_score'),
            'shot_score'         : agg('shot_score'),
            'elbow_breakdown'    : {
                'consistent': sum(1 for s in shots if s.get('elbow_collapse') == 'consistent'),
                'cramped'   : sum(1 for s in shots if s.get('elbow_collapse') == 'cramped'),
                'reaching'  : sum(1 for s in shots if s.get('elbow_collapse') == 'reaching'),
                'marginal'  : sum(1 for s in shots if s.get('elbow_collapse') == 'marginal'),
            },
            'head_flag_breakdown': {
                'HEAD_LATERAL_DRIFT'   : sum(1 for s in shots if s.get('head_flag') == 'HEAD_LATERAL_DRIFT'),
                'HEAD_VERTICAL_DRIFT'  : sum(1 for s in shots if s.get('head_flag') == 'HEAD_VERTICAL_DRIFT'),
                'HEAD_DUCKING_PULL'    : sum(1 for s in shots if s.get('head_flag') == 'HEAD_DUCKING_PULL'),
            },
        }

    mid         = n // 2
    first_half  = confirmed[:mid] if mid > 0 else confirmed
    second_half = confirmed[mid:] if mid < n else confirmed

    def half_mean(shots, key):
        return safe_mean([s.get(key) for s in shots])

    trend = {
        'first_half_swing_intensity'     : half_mean(first_half,  'swing_intensity'),
        'second_half_swing_intensity'    : half_mean(second_half, 'swing_intensity'),
        'first_half_head_quality_score'  : half_mean(first_half,  'head_quality_score'),
        'second_half_head_quality_score' : half_mean(second_half, 'head_quality_score'),
        'first_half_symmetry_score'      : half_mean(first_half,  'symmetry_score'),
        'second_half_symmetry_score'     : half_mean(second_half, 'symmetry_score'),
        'first_half_footwork_score'      : half_mean(first_half,  'footwork_score'),
        'second_half_footwork_score'     : half_mean(second_half, 'footwork_score'),
    }

    s1 = trend['first_half_swing_intensity']
    s2 = trend['second_half_swing_intensity']
    fatigue_flag = (s1 is not None and s2 is not None and s2 < s1 * 0.75)

    all_speeds = [e.get('peak_swing_speed') for e in confirmed]
    valid_speeds = [s for s in all_speeds if s is not None]
    avg_speed    = round(float(np.mean(valid_speeds)), 1) if valid_speeds else None
    avg_head = safe_mean([e.get('head_quality_score') for e in confirmed])
    avg_sym  = safe_mean([e.get('symmetry_score') for e in confirmed])
    avg_shot_score = safe_mean([e.get('shot_score') for e in confirmed])

    alerts = []
    all_flags = []
    for e in confirmed:
        for f in e.get('flags', []) or []:
            all_flags.append(f.split(':')[0])
    flag_counts = defaultdict(int)
    for f in all_flags:
        flag_counts[f] += 1

    lat_count = flag_counts.get('HEAD_LATERAL_DRIFT', 0)
    if lat_count >= 2:
        worst = min(confirmed, key=_head_quality_for_min)
        shot_breakdown = {}
        for e in confirmed:
            if e.get('head_flag') == 'HEAD_LATERAL_DRIFT':
                shot_breakdown[e['label']] = shot_breakdown.get(e['label'], 0) + 1
        main_shot = max(shot_breakdown, key=shot_breakdown.get) if shot_breakdown else 'unknown'
        _wqh = worst.get('head_quality_score')
        _hq_msg = f"{_wqh:.0f}" if _wqh is not None else "—"
        alerts.append({
            'severity'   : 'HIGH',
            'metric'     : 'Ball watch',
            'flag'       : 'HEAD_LATERAL_DRIFT',
            'shot_type'  : main_shot,
            'message'    : (
                f"Head sliding off line on {lat_count} shots (often the {main_shot}). "
                f"Lowest score: #{worst['_display_num']} ({_hq_msg}/100)."
            ),
            'player_cue' : (
                "Watch the seam onto the bat. Keep the head still — let the eyes track."
            ),
            'drill'      : (
                "20 balls on a tee at off stump; restart if your head drifts sideways."
            ),
        })

    duck_count = flag_counts.get('HEAD_DUCKING_PULL', 0)
    if duck_count >= 2:
        alerts.append({
            'severity'   : 'HIGH',
            'metric'     : 'Pull shape',
            'flag'       : 'HEAD_DUCKING_PULL',
            'shot_type'  : 'pull',
            'message'    : (
                f"Head dropping on {duck_count} pull shots — easy to miscue."
            ),
            'player_cue' : (
                "Stay tall; meet the short ball up around chest height, don't dip under it."
            ),
            'drill'      : (
                "Chest-height feeds; keep chin level for 20–30 pulls."
            ),
        })

    vert_count = flag_counts.get('HEAD_VERTICAL_DRIFT', 0)
    if vert_count >= 2:
        alerts.append({
            'severity'   : 'MEDIUM',
            'metric'     : 'Head on drives',
            'flag'       : 'HEAD_VERTICAL_DRIFT',
            'shot_type'  : 'cover/straight',
            'message'    : (
                f"Head bobbing up or down early on {vert_count} drives."
            ),
            'player_cue' : (
                "Eyes stay level through contact; don't look up too soon."
            ),
            'drill'      : (
                "Mirror shadow drives — keep head height steady for 20 reps."
            ),
        })

    asym_count = flag_counts.get('STANCE_ASYMMETRIC', 0)
    if asym_count >= 3:
        alerts.append({
            'severity'   : 'HIGH',
            'metric'     : 'Stance',
            'flag'       : 'STANCE_ASYMMETRIC',
            'shot_type'  : 'all',
            'message'    : (
                f"Uneven stance kept showing on {asym_count} shots."
            ),
            'player_cue' : (
                "Level shoulders, even weight, head quiet in the middle before you move."
            ),
            'drill'      : (
                "Eyes closed, settle, open — check shoulders in a mirror. Repeat 10 times."
            ),
        })

    ec_count = (flag_counts.get('ELBOW_COLLAPSE', 0) +
                flag_counts.get('ELBOW_COLLAPSE_PULL', 0))
    if ec_count >= 2:
        pull_collapse = flag_counts.get('ELBOW_COLLAPSE_PULL', 0)
        if pull_collapse >= ec_count // 2:
            player_cue = (
                "On the pull, give the ball space — extend through the ball, don't roll across."
            )
            drill = (
                "15 pulls with a slightly heavier bat; full extension through contact."
            )
        else:
            player_cue = (
                "Let the ball come; keep a little room so the bat doesn't jam into the body."
            )
            drill = (
                "Underarm feeds with cones under the armpits — don't drop them for 20 balls."
            )
        alerts.append({
            'severity'   : 'MEDIUM',
            'metric'     : 'Bat path',
            'flag'       : 'ELBOW_COLLAPSE',
            'shot_type'  : 'pull' if pull_collapse >= ec_count // 2 else 'all',
            'message'    : (
                f"Bat too tight to the body on {ec_count} shots"
                f"{' — often on the pull' if pull_collapse >= ec_count // 2 else ''}."
            ),
            'player_cue' : player_cue,
            'drill'      : drill,
        })

    er_count = (flag_counts.get('ELBOW_REACHING', 0) +
                flag_counts.get('ELBOW_REACHING_FLICK', 0))
    if er_count >= 2:
        flick_reach = flag_counts.get('ELBOW_REACHING_FLICK', 0)
        alerts.append({
            'severity'   : 'MEDIUM',
            'metric'     : 'Reach',
            'flag'       : 'ELBOW_REACHING',
            'shot_type'  : 'flick' if flick_reach >= er_count // 2 else 'all',
            'message'    : (
                f"Reaching or over-hitting on {er_count} shots"
                + (" — often on the flick." if flick_reach >= er_count // 2 else ".")
            ),
            'player_cue' : (
                "Let it come; soft hands on the flick — timing, not a big hit."
            ) if flick_reach >= er_count // 2 else (
                "Don't stretch; a slight bend in the arms keeps the face under control."
            ),
            'drill'      : (
                "Slower feeds; hit straight back to the feeder with the full face — 25 balls."
            ),
        })

    ebp_count = flag_counts.get('ELBOW_BEHIND_PAD', 0)
    if ebp_count >= 2:
        alerts.append({
            'severity'   : 'HIGH',
            'metric'     : 'Sweep',
            'flag'       : 'ELBOW_BEHIND_PAD',
            'shot_type'  : 'sweep',
            'message'    : (
                f"On {ebp_count} sweeps the bat rolled in early — easy to miss-hit."
            ),
            'player_cue' : (
                "Lead elbow forward first, then hands — keeps the face open longer."
            ),
            'drill'      : (
                "Kneeling sweep feeds; check lead elbow is in front at contact — 20 reps."
            ),
        })

    # ── FLAT FOOTED alert ─────────────────────────────────────────────
    flat_count = flag_counts.get('FLAT_FOOTED', 0)
    if flat_count >= 3:
        alerts.append({
            'severity'   : 'HIGH',
            'metric'     : 'Feet',
            'flag'       : 'FLAT_FOOTED',
            'shot_type'  : 'all',
            'message'    : (
                f"Very little foot movement before the ball on {flat_count} shots."
            ),
            'player_cue' : (
                "Add a small press or trigger so you're not static when the ball is bowled."
            ),
            'drill'      : (
                "Partner calls 'go' — small step, then shadow drive. 25 reps."
            ),
        })

    # ── LATE FOOT PLANT alert ─────────────────────────────────────────
    late_plant_count = flag_counts.get('LATE_PLANT', 0)
    if late_plant_count >= 2:
        alerts.append({
            'severity'   : 'HIGH',
            'metric'     : 'Front foot',
            'flag'       : 'LATE_PLANT',
            'shot_type'  : 'cover/straight/flick',
            'message'    : (
                f"Front foot still moving at contact on {late_plant_count} shots."
            ),
            'player_cue' : (
                "Land the front foot, then swing — not both at the same time."
            ),
            'drill'      : (
                "Feeder says 'foot' then 'hit' with a clear gap between — 20 balls."
            ),
        })

    # ── LOW BAT SPEED alert ───────────────────────────────────────────
    avg_intensity = safe_mean([e.get('swing_intensity') for e in confirmed])
    if avg_intensity is not None and avg_intensity < 30.0:
        alerts.append({
            'severity'   : 'MEDIUM',
            'metric'     : 'Swing',
            'flag'       : 'LOW_BAT_SPEED',
            'shot_type'  : 'all',
            'message'    : (
                f"Swing looked soft across the session — mostly arms."
            ),
            'player_cue' : (
                "Turn hips and trunk first, then let the arms follow."
            ),
            'drill'      : (
                "10 hard shadow swings with a heavy bat, then 10 with your match bat."
            ),
        })

    mid_f = len(confirmed) // 2
    if mid_f > 0:
        s1f = safe_mean([e.get('swing_intensity') for e in confirmed[:mid_f]])
        s2f = safe_mean([e.get('swing_intensity') for e in confirmed[mid_f:]])
        if s1f and s2f and s2f < s1f * 0.75:
            alerts.append({
                'severity'   : 'LOW',
                'metric'     : 'Tiredness',
                'flag'       : 'FATIGUE',
                'shot_type'  : 'all',
                'message'    : (
                    f"Swing dropped in the second half ({s1f:.0f} → {s2f:.0f})."
                ),
                'player_cue' : "Take a break or shorten the net next time.",
                'drill'      : "Light fitness between nets so the last balls stay sharp.",
            })

    best_shot  = max(confirmed, key=_shot_score_for_max)
    worst_shot = min(confirmed, key=_shot_score_for_min)

    return {
        'session_handedness' : session_info['handedness'],
        'stance_conf'        : session_info['conf'],
        'shots_total'        : len(shot_log),
        'shots_confirmed'    : len(confirmed),
        'best_shot'          : {
            'shot_num'    : best_shot['_display_num'],
            'label'       : best_shot['label'],
            'shot_score'  : best_shot.get('shot_score', 0),
            'shot_quality': best_shot.get('shot_quality', '-'),
            'timestamp'   : best_shot['timestamp'],
        },
        'worst_shot'         : {
            'shot_num'    : worst_shot['_display_num'],
            'label'       : worst_shot['label'],
            'shot_score'  : worst_shot.get('shot_score', 0),
            'shot_quality': worst_shot.get('shot_quality', '-'),
            'timestamp'   : worst_shot['timestamp'],
        },
        'session_summary'    : {
            'shots_confirmed'      : len(confirmed),
            'shots_total_detected' : len(shot_log),
            'avg_bat_speed_kmh'    : avg_speed,
            'avg_head_quality_score': avg_head,
            'avg_symmetry_score'   : avg_sym,
            'avg_footwork_score'   : safe_mean([e.get('footwork_score') for e in confirmed]),
            'avg_swing_intensity'  : safe_mean([e.get('swing_intensity') for e in confirmed]),
            'avg_shot_score'       : avg_shot_score,
            'feet_active_rate': round(
                sum(1 for e in confirmed if e.get('feet_active')) / max(len(confirmed), 1), 2),
            'fatigue_detected'     : fatigue_flag,
            'trend'                : trend,
            'flags_summary'        : {
                'HEAD_LATERAL_DRIFT_count'  : flag_counts.get('HEAD_LATERAL_DRIFT', 0),
                'HEAD_VERTICAL_DRIFT_count' : flag_counts.get('HEAD_VERTICAL_DRIFT', 0),
                'HEAD_DUCKING_PULL_count'   : flag_counts.get('HEAD_DUCKING_PULL', 0),
                'STANCE_ASYMMETRIC_count'   : flag_counts.get('STANCE_ASYMMETRIC', 0),
                'ELBOW_COLLAPSE_count'      : flag_counts.get('ELBOW_COLLAPSE', 0)
                                            + flag_counts.get('ELBOW_COLLAPSE_PULL', 0),
                'ELBOW_REACHING_count'      : flag_counts.get('ELBOW_REACHING', 0)
                                            + flag_counts.get('ELBOW_REACHING_FLICK', 0),
                'ELBOW_BEHIND_PAD_count'    : flag_counts.get('ELBOW_BEHIND_PAD', 0),
                'FLAT_FOOTED_count'          : flag_counts.get('FLAT_FOOTED', 0),
                'LATE_PLANT_count'           : flag_counts.get('LATE_PLANT', 0),
            },
            'by_shot_type'         : type_stats,
        },
        'coaching_alerts'    : alerts,
        'shots_with_flags'   : [
            {
                'shot_num'    : e.get('_display_num'),
                'label'       : e.get('label'),
                'shot_score'  : e.get('shot_score'),
                'flags_plain' : list(e.get('flags_plain') or []),
            }
            for e in sorted(
                confirmed,
                key=lambda x: (x.get('_display_num') is None, x.get('_display_num') or 0),
            )
        ],
    }

# -----------------------------------------------------------------
# CLASSIFY ALL SHOTS
# -----------------------------------------------------------------

def classify_all_shots(all_frames_rgb, all_keypoints, shot_onsets,
                       fps, total_frames, orig_w, shot_classifier, device,
                       lw_vels, rw_vels, bilateral,
                       ws=None, loop=None):

    shot_log           = []
    session_rhb_weight = 0.0
    session_lhb_weight = 0.0
    session_info       = {'handedness': 'UNKNOWN', 'conf': 0.0}

    ws_emit(ws, loop, {
        "type": "stage", "stage": "classifying",
        "message": f"Classifying {len(shot_onsets)} shots...",
        "total_shots": len(shot_onsets),
    })
    print(f"\n[CrickEye] Classifying {len(shot_onsets)} shots ...")

    session_shoulder_px = _session_shoulder_median_all_frames(all_keypoints)
    if session_shoulder_px:
        print(f"[CrickEye] Session shoulder width (median): {session_shoulder_px:.1f} px")

    for i, (onset_frame, onset_score) in enumerate(shot_onsets):

        pre_start = max(0, onset_frame - PRESHOT_START)
        pre_end   = max(pre_start + 1, onset_frame - PRESHOT_END)

        shot_dom, shot_conf = vote_handedness_from_keypoints(
            all_keypoints, pre_start, pre_end, orig_w)

        if shot_dom is not None and shot_conf >= 0.60:
            vote_weight = shot_conf ** 2
            if shot_dom == 'RHB': session_rhb_weight += vote_weight
            else:                  session_lhb_weight += vote_weight

        session_total = session_rhb_weight + session_lhb_weight
        if session_total > 0:
            if session_rhb_weight >= session_lhb_weight:
                cur_hand = 'RHB'; cur_conf = round(session_rhb_weight / session_total, 2)
            else:
                cur_hand = 'LHB'; cur_conf = round(session_lhb_weight / session_total, 2)
            session_info['handedness'] = cur_hand if cur_conf >= STANCE_THRESHOLD else 'UNCERTAIN'
            session_info['conf']       = cur_conf
        else:
            cur_hand = 'UNKNOWN'; cur_conf = 0.0

        start = max(0, onset_frame - CLIP_PRE_FRAMES)
        end   = min(total_frames - 1, onset_frame + CLIP_POST_FRAMES)
        clip  = all_frames_rgb[start : end + 1]

        label, conf, probs = classify_shot(shot_classifier, clip, device)
        ts = f"{int(onset_frame/fps//60):02d}:{onset_frame/fps%60:05.2f}"

        biomech = extract_biomechanics(
            all_keypoints, lw_vels, rw_vels, bilateral,
            start, onset_frame, end,
            handedness=cur_hand if cur_hand != 'UNKNOWN' else 'RHB',
            fps=fps,
            shot_label=label,
            session_shoulder_px=session_shoulder_px,
        )

        entry = dict(
            shot_num    = i + 1,
            label       = label,
            conf        = conf,
            timestamp   = ts,
            probs       = probs,
            peak_frame  = onset_frame,
            start_frame = start,
            end_frame   = end,
            onset_score = round(onset_score, 1),
            _display_num     = None,
            _cur_hand        = cur_hand,
            _session_hand    = session_info['handedness'],
            _session_conf    = session_info['conf'],
        )
        entry.update(biomech)
        shot_log.append(entry)

        flag_str = " ".join([f"[{f}]" for f in biomech['flags']]) if biomech['flags'] else ""
        hand_str = f"{cur_hand}({cur_conf:.0%})" if shot_dom else "no-pose"
        _hq = biomech.get('head_quality_score')
        _sym = biomech.get('symmetry_score')
        _hq_s = f"{_hq:.0f}" if _hq is not None else "--"
        _sym_s = f"{_sym:.0f}" if _sym is not None else "--"
        print(f"  Shot #{i+1:3d} @ frame {onset_frame:5d} ({ts}): "
              f"{label.upper():10s} {conf*100:.1f}%  "
              f"stance={hand_str}  "
              f"speed={biomech['peak_swing_speed']:.1f}km/h  "
              f"headQ={_hq_s}  "
              f"sym={_sym_s}  "
              f"score={biomech['shot_score']}/10  {flag_str}")

    # ── Post-hoc: compute session-relative swing intensity percentiles ──
    raw_swings = [e.get('swing_raw_p90', 0) for e in shot_log if e.get('swing_raw_p90')]
    if raw_swings:
        max_raw = max(raw_swings) if raw_swings else 1.0
        for e in shot_log:
            raw = e.get('swing_raw_p90', 0) or 0
            if max_raw > 0:
                e['swing_intensity'] = round(min(100.0, (raw / max_raw) * 100.0), 1)
            else:
                e['swing_intensity'] = 0.0
            e['swing_intensity_label'] = label_from_scale(
                e['swing_intensity'], SWING_INTENSITY_LABEL)

    for e in shot_log:
        finalize_shot_player_copy(e)

    final = session_info['handedness']
    fconf = session_info['conf']
    print(f"\n[CrickEye] Session stance: {final} ({fconf:.0%})")
    return shot_log, session_info


# -----------------------------------------------------------------
# ASSIGN DISPLAY NUMBERS
# -----------------------------------------------------------------

def assign_display_numbers(shot_log):
    display_num = 0
    for e in shot_log:
        if e['conf'] >= CONF_THRESHOLD:
            display_num += 1
            e['_display_num'] = display_num
        else:
            e['_display_num'] = None


# -----------------------------------------------------------------
# PASS 2 - RENDER ANNOTATED VIDEO
# -----------------------------------------------------------------

def draw_label(frame, text, pos, color, scale=0.60, thickness=2):
    (tw, th), bl = cv2.getTextSize(text, FONT, scale, thickness)
    x, y = pos
    cv2.rectangle(frame, (x-4, y-th-6), (x+tw+4, y+bl), (0,0,0), -1)
    cv2.putText(frame, text, (x, y), FONT, scale, color, thickness, cv2.LINE_AA)


def draw_handedness_badge(frame, handedness, conf, frame_w):
    if not handedness or handedness == 'UNKNOWN': return
    col  = COL_AMBER if handedness == 'UNCERTAIN' else COL_TEAL
    text = f"{handedness}  {conf:.0%}"
    (tw, th), _ = cv2.getTextSize(text, FONT, 0.58, 1)
    bx = frame_w - tw - 24; by = 32
    cv2.rectangle(frame, (bx-8, by-th-8), (bx+tw+8, by+8), (0,0,0), -1)
    cv2.rectangle(frame, (bx-8, by-th-8), (bx+tw+8, by+8), col, 1)
    cv2.putText(frame, text, (bx, by), FONT, 0.58, col, 1, cv2.LINE_AA)


def draw_skeleton(frame, kp):
    nose = kp.get('nose')
    ls   = kp.get('ls');  rs  = kp.get('rs')
    le   = kp.get('le');  re  = kp.get('re')
    lw   = kp.get('lw');  rw  = kp.get('rw')
    lh   = kp.get('lh');  rh  = kp.get('rh')
    lk   = kp.get('lk');  rk  = kp.get('rk')
    la   = kp.get('la');  ra  = kp.get('ra')

    SKELETON_PAIRS = [
        (ls, rs), (ls, le), (le, lw), (rs, re), (re, rw),
        (ls, lh), (rs, rh), (lh, rh), (lh, lk), (lk, la),
        (rh, rk), (rk, ra),
    ]
    LINE_COL = (60, 80, 60)
    for p1, p2 in SKELETON_PAIRS:
        if p1 and p2:
            cv2.line(frame, (int(p1[0]), int(p1[1])),
                     (int(p2[0]), int(p2[1])), LINE_COL, 1, cv2.LINE_AA)

    if lw: cv2.circle(frame, (int(lw[0]), int(lw[1])), 6, (0, 220, 80), -1)
    if rw: cv2.circle(frame, (int(rw[0]), int(rw[1])), 6, (0, 165, 255), -1)

    DOT_COL = (100, 130, 100)
    for pt in [nose, ls, rs, le, re, lh, rh, lk, rk, la, ra]:
        if pt:
            cv2.circle(frame, (int(pt[0]), int(pt[1])), 3, DOT_COL, -1)

    if la: cv2.circle(frame, (int(la[0]), int(la[1])), 4, (255, 200, 0), -1)
    if ra: cv2.circle(frame, (int(ra[0]), int(ra[1])), 4, (200, 0, 255), -1)


def draw_bilateral_bar(frame, bilateral_vel, h, w):
    bar_h = int(h*0.45); bar_w = 10; bar_x = w-bar_w-6; bar_y = int(h*0.25)
    norm  = min(bilateral_vel / max(BILATERAL_VEL_THRESHOLD*3, 1.0), 1.0)
    filled = int(bar_h * norm)
    cv2.rectangle(frame, (bar_x, bar_y), (bar_x+bar_w, bar_y+bar_h), (30,30,30), -1)
    col = (0,255,0) if bilateral_vel >= BILATERAL_VEL_THRESHOLD else \
          (0,165,255) if norm > 0.3 else (60,60,60)
    if filled > 0:
        cv2.rectangle(frame, (bar_x, bar_y+bar_h-filled),
                      (bar_x+bar_w, bar_y+bar_h), col, -1)
    thr_y = bar_y+bar_h - int(bar_h*(BILATERAL_VEL_THRESHOLD/max(BILATERAL_VEL_THRESHOLD*3,1.0)))
    cv2.line(frame, (bar_x-2, thr_y), (bar_x+bar_w+2, thr_y), (0,180,180), 1)
    cv2.rectangle(frame, (bar_x, bar_y), (bar_x+bar_w, bar_y+bar_h), (100,100,100), 1)


def pass2_render(video_path, output_path, all_frames_rgb, all_keypoints,
                 shot_log, lw_vels, rw_vels, bilateral,
                 fps, total_frames, orig_w, orig_h, session_info,
                 slow_factor=3, ws=None, loop=None):

    fourcc  = cv2.VideoWriter_fourcc(*'mp4v')
    writer  = cv2.VideoWriter(output_path, fourcc, fps, (orig_w, orig_h))

    peak_set      = {e['peak_frame'] for e in shot_log}
    frame_to_shot = {}
    for entry in shot_log:
        for f in range(entry['start_frame'], entry['end_frame']+1):
            frame_to_shot[f] = entry

    handedness = session_info['handedness']
    conf       = session_info['conf']

    ws_emit(ws, loop, {"type": "stage", "stage": "rendering",
                       "message": "Rendering annotated video...",
                       "total_frames": total_frames})
    print(f"\n[CrickEye] Pass 2: rendering {total_frames} frames ...")
    t0 = time.time()

    for frame_idx, frame_rgb in enumerate(all_frames_rgb):
        out = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR)

        lw_v = lw_vels[frame_idx]   if frame_idx < len(lw_vels)   else 0.0
        rw_v = rw_vels[frame_idx]   if frame_idx < len(rw_vels)    else 0.0
        bil  = bilateral[frame_idx] if frame_idx < len(bilateral)  else 0.0
        kp   = all_keypoints[frame_idx] if frame_idx < len(all_keypoints) else {}

        is_peak = frame_idx in peak_set
        in_clip = frame_idx in frame_to_shot

        draw_skeleton(out, kp)
        draw_bilateral_bar(out, bil, orig_h, orig_w)
        draw_handedness_badge(out, handedness, conf, orig_w)

        if is_peak:
            e  = frame_to_shot.get(frame_idx)
            if e:
                lc  = (CLASS_COLS.get(e['label'], COL_GREEN)
                       if e['conf'] >= CONF_THRESHOLD else COL_RED)
                ovl = out.copy()
                cv2.rectangle(ovl, (0,0), (orig_w, orig_h), (0,60,200), -1)
                cv2.addWeighted(ovl, 0.18, out, 0.82, 0, out)
                # CALIBRATION: overlay shows km/h
                spd = e.get('peak_swing_speed', 0)
                pt  = f"  {e['label'].upper()}  {e['conf']*100:.0f}%  {spd:.0f}km/h  "
                pw  = len(pt)*11 + 10
                cv2.rectangle(out, (8, 8), (8+pw, 46), lc, -1, cv2.LINE_AA)
                cv2.putText(out, pt, (12, 36), FONT, 0.75, (0,0,0), 2, cv2.LINE_AA)
                display_label = e['_display_num'] if e['_display_num'] else f"~{e['shot_num']}"
                draw_label(out, f"#{display_label}", (10, 68),
                           (0,80,255), scale=0.52, thickness=1)

        elif in_clip:
            e  = frame_to_shot[frame_idx]
            if e['conf'] >= CONF_THRESHOLD:
                lc  = CLASS_COLS.get(e['label'], COL_GREEN)
                ovl = out.copy()
                cv2.rectangle(ovl, (0,0), (orig_w, 44), (0,0,0), -1)
                cv2.addWeighted(ovl, 0.5, out, 0.5, 0, out)
                pt  = f"  {e['label'].upper()}  {e['conf']*100:.0f}%  "
                pw  = len(pt)*10 + 10
                cv2.rectangle(out, (8,5), (8+pw, 38), lc, -1, cv2.LINE_AA)
                cv2.putText(out, pt, (12, 28), FONT, 0.60, (0,0,0), 2, cv2.LINE_AA)

        writer.write(out)

        if is_peak and slow_factor > 1:
            for _ in range(slow_factor - 1):
                writer.write(out)

        if frame_idx % max(1, int(fps*5)) == 0 and frame_idx > 0:
            pct     = frame_idx / total_frames * 100
            elapsed = time.time() - t0
            eta     = (elapsed / frame_idx) * (total_frames - frame_idx)
            print(f"  [{pct:5.1f}%] {frame_idx}/{total_frames}  ETA {eta:.0f}s")
            ws_emit(ws, loop, {
                "type": "progress", "stage": "rendering",
                "frame": frame_idx, "total": total_frames,
                "pct": round(pct, 1), "eta": round(eta),
            })

    writer.release()
    print(f"[CrickEye] Raw output -> {output_path}")
    _reencode_for_browser(output_path, ws, loop)


def _reencode_for_browser(output_path: str, ws=None, loop=None):
    import subprocess, shutil, os

    ws_emit(ws, loop, {"type": "stage", "stage": "encoding",
                       "message": "Re-encoding video for browser playback..."})

    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        try:
            import imageio_ffmpeg
            ffmpeg_bin = imageio_ffmpeg.get_ffmpeg_exe()
        except Exception:
            ffmpeg_bin = None

    if not ffmpeg_bin:
        warn = (
            "ffmpeg not found — OpenCV wrote MPEG-4 (mp4v) which most browsers cannot play. "
            "Install ffmpeg or: pip install imageio-ffmpeg"
        )
        print(f"[CrickEye] WARNING: {warn}")
        ws_emit(ws, loop, {"type": "warning", "message": warn})
        return

    tmp_path = output_path.replace(".mp4", "_h264.mp4")
    cmd = [
        ffmpeg_bin, "-y", "-i", output_path,
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-movflags", "+faststart", "-pix_fmt", "yuv420p", "-an",
        tmp_path
    ]
    try:
        result = subprocess.run(cmd, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, timeout=300)
        if result.returncode == 0 and os.path.exists(tmp_path):
            os.replace(tmp_path, output_path)
            print(f"[CrickEye] H.264 re-encode complete -> {output_path}")
        else:
            err = result.stderr.decode(errors='replace')[-300:]
            print(f"[CrickEye] ffmpeg failed:\n{err}")
    except Exception as e:
        print(f"[CrickEye] ffmpeg error: {e}")

# -----------------------------------------------------------------
# SAVE RESULTS
# -----------------------------------------------------------------

def save_csv(shot_log, csv_path, handedness, conf):
    with open(csv_path, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow([
            'shot_num', 'display_num', 'timestamp', 'label', 'confidence', 'confirmed',
            'swing_intensity', 'peak_swing_speed_kmh',
            'head_quality_score', 'head_lateral_ratio', 'head_vertical_ratio',
            'head_frames_used', 'head_flag',
            'symmetry_score', 'avg_shoulder_tilt', 'avg_hip_tilt', 'stance_flag',
            'elbow_collapse', 'elbow_delta', 'setup_elbow_ratio',
            'contact_elbow_ratio', 'elbow_behind_pad', 'elbow_flag',
            'feet_active', 'pre_shot_movement', 'plant_timing',
            'footwork_score', 'footwork_flag',
            'shot_score', 'shot_quality',
        ])
        for e in shot_log:
            w.writerow([
                e['shot_num'],
                e['_display_num'] if e['_display_num'] else '---',
                e['timestamp'], e['label'],
                f"{e['conf']:.4f}",
                'YES' if e['conf'] >= CONF_THRESHOLD else 'NO',
                e.get('swing_intensity'),
                e.get('peak_swing_speed'),
                e.get('head_quality_score'),
                e.get('head_lateral_ratio'),
                e.get('head_vertical_ratio'),
                e.get('head_frames_used'),
                e.get('head_flag', ''),
                e.get('symmetry_score'),
                e.get('avg_shoulder_tilt'),
                e.get('avg_hip_tilt'),
                e.get('stance_flag', ''),
                e.get('elbow_collapse'),
                e.get('elbow_delta'),
                e.get('setup_elbow_ratio'),
                e.get('contact_elbow_ratio'),
                e.get('elbow_behind_pad', False),
                e.get('elbow_flag', ''),
                e.get('feet_active', False),
                e.get('pre_shot_movement'),
                e.get('plant_timing'),
                e.get('footwork_score'),
                e.get('footwork_flag', ''),
                e.get('shot_score'),
                e.get('shot_quality'),
            ])
    print(f"[CrickEye] CSV -> {csv_path}")


def save_json(shot_log, fps, total_frames, session_info, analysis, json_path):
    with open(json_path, 'w') as f:
        json.dump({
            'total_frames'      : total_frames,
            'fps'               : fps,
            'session_handedness': session_info['handedness'],
            'stance_conf'       : session_info['conf'],
            'speed_unit'        : 'km/h',   # CALIBRATION: document unit
            'analysis'          : analysis,
            'shots': [{
                'shot_num'             : e['shot_num'],
                'display_num'          : e['_display_num'],
                'label'                : e['label'],
                'confidence'           : round(e['conf'], 4),
                'confirmed'            : e['conf'] >= CONF_THRESHOLD,
                'timestamp'            : e['timestamp'],
                'peak_frame'           : e['peak_frame'],
                'travel_px'            : e['onset_score'],
                'swing_intensity'      : e.get('swing_intensity'),
                'peak_swing_speed'     : e.get('peak_swing_speed'),
                'speed_is_capped'      : e.get('speed_is_capped', False),
                'head_quality_score'   : e.get('head_quality_score'),
                'head_lateral_ratio'   : e.get('head_lateral_ratio'),
                'head_vertical_ratio'  : e.get('head_vertical_ratio'),
                'head_frames_used'     : e.get('head_frames_used'),
                'head_flag'            : e.get('head_flag'),
                'symmetry_score'       : e.get('symmetry_score'),
                'avg_shoulder_tilt'    : e.get('avg_shoulder_tilt'),
                'avg_hip_tilt'         : e.get('avg_hip_tilt'),
                'stance_flag'          : e.get('stance_flag'),
                'elbow_collapse'       : e.get('elbow_collapse'),
                'elbow_delta'          : e.get('elbow_delta'),
                'setup_elbow_ratio'    : e.get('setup_elbow_ratio'),
                'contact_elbow_ratio'  : e.get('contact_elbow_ratio'),
                'elbow_behind_pad'     : e.get('elbow_behind_pad', False),
                'elbow_flag'           : e.get('elbow_flag'),
                'feet_active'          : e.get('feet_active', False),
                'pre_shot_movement'    : e.get('pre_shot_movement'),
                'plant_timing'         : e.get('plant_timing'),
                'footwork_score'       : e.get('footwork_score'),
                'footwork_flag'        : e.get('footwork_flag'),
                'shot_score'           : e.get('shot_score'),
                'shot_quality'         : e.get('shot_quality'),
                'flags'                : e.get('flags', []),
                'head_quality_label'   : e.get('head_quality_label'),
                'symmetry_label'       : e.get('symmetry_label'),
                'swing_intensity_label': e.get('swing_intensity_label'),
                'footwork_label'       : e.get('footwork_label'),
                'shot_quality_label'   : e.get('shot_quality_label'),
                'flags_plain'          : e.get('flags_plain', []),
                'data_quality'         : e.get('data_quality'),
                'data_quality_note'    : e.get('data_quality_note'),
                'head_confidence'      : e.get('head_confidence'),
                'probs'                : {cls: round(p, 4)
                                          for cls, p in zip(SHOT_CLASSES, e['probs'])},
            } for e in shot_log],
        }, f, indent=2)
    print(f"[CrickEye] JSON -> {json_path}")


def print_summary(shot_log, session_info, analysis):
    confirmed = [e for e in shot_log if e['conf'] >= CONF_THRESHOLD]
    print("\n" + "="*60)
    print("  CRICKEYE v7.0 -- SESSION ANALYSIS COMPLETE")
    print("="*60)
    print(f"  Stance: {session_info['handedness']}  ({session_info['conf']:.0%})")
    print(f"\n  Per-Shot Analysis (confirmed only):\n")
    for e in confirmed:
        flags = e.get('flags', [])
        _phq = e.get('head_quality_score')
        _psym = e.get('symmetry_score')
        _fw = e.get('footwork_score')
        _si = e.get('swing_intensity')
        _tr = "T" if e.get('trigger_detected') else "-"
        _pt = e.get('plant_timing')
        _pt_s = f"{_pt:+d}f" if _pt is not None else "--"
        print(
            f"  Shot #{e['_display_num']:2d} | {e['label']:<8} "
            f"{e['conf']*100:4.0f}%  | "
            f"Swing={(_si if _si is not None else 0):>5.1f} | "
            f"HeadQ={(_phq if _phq is not None else 0):>5.0f} | "
            f"Sym={(_psym if _psym is not None else 0):>5.0f} | "
            f"Foot={(_fw if _fw is not None else 0):>5.0f}({_tr}{_pt_s}) | "
            f"Elbow={e.get('elbow_collapse','?'):>10s} | "
            f"Score={e.get('shot_score',0):>4.1f}/10 | "
            f"{e.get('shot_quality','-')}"
            + (f"  [{', '.join(flags)}]" if flags else "")
        )
    if analysis and not analysis.get('error'):
        b  = analysis.get('best_shot',  {})
        wr = analysis.get('worst_shot', {})
        if b:  print(f"\n  Best Shot:  #{b['shot_num']} {b['label']} ({b['shot_score']}/10)")
        if wr: print(f"  Worst Shot: #{wr['shot_num']} {wr['label']} ({wr['shot_score']}/10)")
        summary = analysis.get('session_summary', {})
        print("\n  Session Summary (confirmed shots only):")
        used = summary.get('shots_confirmed')
        total = summary.get('shots_total_detected')
        if used is not None and total is not None:
            print(f"    shots used: {used}/{total}")
        hs = summary.get('avg_head_quality_score')
        st = summary.get('avg_symmetry_score')
        fw = summary.get('avg_footwork_score')
        si = summary.get('avg_swing_intensity')
        ss = summary.get('avg_shot_score')
        tr = summary.get('trigger_detection_rate')
        if hs is not None: print(f"    avg_head_quality: {hs:.1f}/100")
        if st is not None: print(f"    avg_symmetry: {st:.1f}/100")
        if fw is not None: print(f"    avg_footwork: {fw:.1f}/100")
        if si is not None: print(f"    avg_swing_intensity: {si:.1f}/100")
        if ss is not None: print(f"    avg_shot_score: {ss:.1f}/10")
        far = summary.get('feet_active_rate')
        if far is not None: print(f"    feet_active_rate: {far:.0%}")
    print("="*60 + "\n")

# -----------------------------------------------------------------
# ENTRY POINTS
# -----------------------------------------------------------------

def run_pipeline(video_path=None, output_path=None):
    vp = video_path or VIDEO_PATH
    op = output_path or OUTPUT_PATH
    print("\n" + "="*60)
    print("  CrickEye v7.0 -- CLI Mode")
    print("="*60)
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"[CrickEye] Device: {device}\n")

    shot_classifier = load_shot_classifier(MODEL_PATH, device)
    all_frames_rgb, all_keypoints, fps, total_frames, orig_w, orig_h = \
        extract_all_keypoints(vp)
    lw_vels, rw_vels, bilateral = compute_wrist_signals(all_keypoints)
    shot_onsets = find_shot_onsets(lw_vels, rw_vels, bilateral, fps)
    shot_log, session_info = classify_all_shots(
        all_frames_rgb, all_keypoints, shot_onsets,
        fps, total_frames, orig_w, shot_classifier, device,
        lw_vels, rw_vels, bilateral)

    assign_display_numbers(shot_log)
    analysis = run_session_analysis(shot_log, session_info)
    pass2_render(vp, op, all_frames_rgb, all_keypoints, shot_log,
                 lw_vels, rw_vels, bilateral,
                 fps, total_frames, orig_w, orig_h, session_info)
    save_csv(shot_log, CSV_PATH, session_info['handedness'], session_info['conf'])
    save_json(shot_log, fps, total_frames, session_info, analysis, JSON_PATH)
    print_summary(shot_log, session_info, analysis)


def run_pipeline_ws_sync(video_path: str, ws, loop):
    output_path = str(BASE_DIR / "assets" / "analysed_out.mp4")

    try:
        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        ws_emit(ws, loop, {
            "type": "stage", "stage": "loading",
            "message": f"Models loaded -- device: {device}"
        })

        shot_classifier = load_shot_classifier(MODEL_PATH, device)

        all_frames_rgb, all_keypoints, fps, total_frames, orig_w, orig_h = \
            extract_all_keypoints(video_path, ws, loop)

        lw_vels, rw_vels, bilateral = compute_wrist_signals(all_keypoints)
        shot_onsets = find_shot_onsets(lw_vels, rw_vels, bilateral, fps, ws, loop)

        shot_log, session_info = classify_all_shots(
            all_frames_rgb, all_keypoints, shot_onsets,
            fps, total_frames, orig_w, shot_classifier, device,
            lw_vels, rw_vels, bilateral,
            ws, loop)

        assign_display_numbers(shot_log)
        analysis = run_session_analysis(shot_log, session_info)

        pass2_render(video_path, output_path,
                     all_frames_rgb, all_keypoints, shot_log,
                     lw_vels, rw_vels, bilateral,
                     fps, total_frames, orig_w, orig_h,
                     session_info, ws=ws, loop=loop)

        save_csv(shot_log, CSV_PATH, session_info['handedness'], session_info['conf'])
        save_json(shot_log, fps, total_frames, session_info, analysis, JSON_PATH)
        print_summary(shot_log, session_info, analysis)

        confirmed_shots = [e for e in shot_log if e['conf'] >= CONF_THRESHOLD]

        for e in confirmed_shots:
            ws_emit(ws, loop, {
                "type"                 : "shot",
                "shot_num"             : e['_display_num'],
                "label"                : e['label'],
                "conf"                 : round(e['conf'], 4),
                "confirmed"            : True,
                "timestamp"            : e['timestamp'],
                "peak_frame"           : e['peak_frame'],
                "onset_score"          : e['onset_score'],
                "handedness"           : e.get('_session_hand', session_info['handedness']),
                "stance_conf"          : e.get('_session_conf', session_info['conf']),
                "swing_intensity"      : e.get('swing_intensity'),
                "peak_swing_speed"     : e.get('peak_swing_speed'),
                "speed_is_capped"      : e.get('speed_is_capped', False),
                "head_quality_score"   : e.get('head_quality_score'),
                "head_flag"            : e.get('head_flag'),
                "symmetry_score"       : e.get('symmetry_score'),
                "stance_flag"          : e.get('stance_flag'),
                "elbow_collapse"       : e.get('elbow_collapse'),
                "elbow_flag"           : e.get('elbow_flag'),
                "feet_active"          : e.get('feet_active', False),
                "plant_timing"         : e.get('plant_timing'),
                "footwork_score"       : e.get('footwork_score'),
                "footwork_flag"        : e.get('footwork_flag'),
                "shot_score"           : e.get('shot_score'),
                "shot_quality"         : e.get('shot_quality'),
                "flags"                : e.get('flags', []),
                "head_quality_label"   : e.get('head_quality_label'),
                "symmetry_label"       : e.get('symmetry_label'),
                "swing_intensity_label": e.get('swing_intensity_label'),
                "footwork_label"       : e.get('footwork_label'),
                "shot_quality_label"   : e.get('shot_quality_label'),
                "flags_plain"          : e.get('flags_plain', []),
                "data_quality"         : e.get('data_quality'),
                "data_quality_note"    : e.get('data_quality_note'),
                "head_confidence"      : e.get('head_confidence'),
                "probs": {cls: round(p, 4) for cls, p in zip(SHOT_CLASSES, e['probs'])},
            })

        ws_emit(ws, loop, {
            "type":       "session",
            "handedness": session_info['handedness'],
            "conf":       session_info['conf'],
        })

        ws_emit(ws, loop, {
            "type":     "analysis",
            "analysis": analysis,
        })

        counts = {cls: 0 for cls in SHOT_CLASSES}
        for e in confirmed_shots:
            if e['label'] in counts:
                counts[e['label']] += 1

        ws_emit(ws, loop, {
            "type":         "complete",
            "total_shots":  len(shot_log),
            "confirmed":    len(confirmed_shots),
            "unclear":      len(shot_log) - len(confirmed_shots),
            "output_video": "/assets/analysed_out.mp4",
            "handedness":   session_info['handedness'],
            "stance_conf":  session_info['conf'],
            "shot_counts":  counts,
            "avg_conf":     round(float(np.mean([e['conf'] for e in confirmed_shots])), 3)
                            if confirmed_shots else 0.0,
            "total_frames": total_frames,
            "fps":          round(fps, 3),
            "analysis":     analysis,
            "speed_unit":   "km/h",   # CALIBRATION: tell frontend the unit
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        ws_emit(ws, loop, {"type": "error", "message": str(e)})


if __name__ == '__main__':
    run_pipeline()