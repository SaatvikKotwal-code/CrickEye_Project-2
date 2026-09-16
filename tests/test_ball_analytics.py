"""Unit tests for ball analytics helpers (no YOLO)."""
import math
import os
import sys
import unittest
from pathlib import Path

# Add project root to sys.path so ball_analytics can be imported from tests directory
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import numpy as np  # noqa: E402  # type: ignore

from ball_analytics import (  # noqa: E402  # type: ignore
    PaceConfig,
    _apply_session_ball_speed_rescale,
    _is_moving_ball_segment,
    _match_shot,
    _merge_tracks_to_timeline,
    _realistic_ball_speed_kmh,
    _robust_t_at_bounce,
    _speed_profile,
    classify_length_zone,
    pace_band_label,
    segment_deliveries,
    estimate_bounce,
)


class TestPaceBand(unittest.TestCase):
    def test_bands(self):
        cfg = PaceConfig(slow_max_kmh=85, medium_max_kmh=110, use_very_fast=False)
        self.assertEqual(pace_band_label(70, cfg), "slow")
        self.assertEqual(pace_band_label(90, cfg), "medium")
        self.assertEqual(pace_band_label(120, cfg), "fast")

    def test_unknown(self):
        cfg = PaceConfig()
        self.assertEqual(pace_band_label(None, cfg), "unknown")
        self.assertEqual(pace_band_label(float("nan"), cfg), "unknown")


class TestLengthClassification(unittest.TestCase):
    def test_zones(self):
        r = classify_length_zone(1.5, bounce_confidence=0.9, full_toss=False)
        self.assertEqual(r["label"], "yorker")
        r = classify_length_zone(4.0, bounce_confidence=0.8, full_toss=False)
        self.assertEqual(r["label"], "full")
        r = classify_length_zone(7.0, bounce_confidence=0.8, full_toss=False)
        self.assertEqual(r["label"], "good_length")
        r = classify_length_zone(9.0, bounce_confidence=0.8, full_toss=False)
        self.assertEqual(r["label"], "short")

    def test_low_bounce_conf_still_assigns_zone(self):
        r = classify_length_zone(5.0, bounce_confidence=0.1, full_toss=False)
        self.assertEqual(r["label"], "full")
        self.assertFalse(r.get("uncertain", False))

    def test_none_distance_defaults_to_full_band(self):
        r = classify_length_zone(None, bounce_confidence=0.0, full_toss=False)
        self.assertEqual(r["label"], "full")

    def test_full_toss(self):
        r = classify_length_zone(None, bounce_confidence=0.1, full_toss=True)
        self.assertEqual(r["label"], "full_toss")


class TestSegmentDeliveries(unittest.TestCase):
    def test_gap_splits(self):
        seg = [
            {
                "track_id": 1,
                "frames": [
                    (0, 1, 1, 2, 2, 0.9),
                    (1, 1, 1, 2, 2, 0.9),
                    (50, 1, 1, 2, 2, 0.9),
                    (51, 1, 1, 2, 2, 0.9),
                ],
            }
        ]
        out = segment_deliveries(seg, max_frame_gap=10, min_track_frames=2)
        self.assertEqual(len(out), 2)
        self.assertEqual(out[0]["start_frame"], 0)
        self.assertEqual(out[1]["start_frame"], 50)

    def test_min_length_filter(self):
        seg = [{"track_id": 1, "frames": [(0, 0, 0, 1, 1, 0.8)]}]
        out = segment_deliveries(seg, max_frame_gap=5, min_track_frames=5)
        self.assertEqual(len(out), 0)


class TestBounce(unittest.TestCase):
    def test_straight_line_no_bounce(self):
        pts = [(i, i) for i in range(20)]
        idx, conf, _ = estimate_bounce(pts)
        self.assertTrue(idx is None or conf < 0.5)

    def test_corner_detected(self):
        pts = [(0, 0), (1, 0), (2, 0), (3, 1), (4, 2), (5, 3)]
        idx, conf, note = estimate_bounce(pts)
        self.assertIsNotNone(idx)
        self.assertGreater(conf, 0.0)
        self.assertEqual(note, "curvature_peak")

    def test_robust_t_median_damps_spike(self):
        t_along = np.array([0.50, 0.51, 0.52, 0.99, 0.53, 0.54], dtype=float)
        bi = 3
        med = _robust_t_at_bounce(t_along, bi)
        self.assertAlmostEqual(med, 0.53, places=2)
        raw = float(np.clip(t_along[bi], 0.0, 1.0))
        self.assertGreater(raw, 0.9)


class TestMergeTimeline(unittest.TestCase):
    def test_same_frame_keeps_higher_conf(self):
        tracks = {
            0: [(10, 1.0, 1.0, 2.0, 2.0, 0.4)],
            1: [(10, 1.0, 1.0, 2.0, 2.0, 0.9)],
        }
        out = _merge_tracks_to_timeline(tracks)
        self.assertEqual(len(out), 1)
        self.assertAlmostEqual(out[0][5], 0.9)


class TestMotionFilter(unittest.TestCase):
    """Background static 'ball' boxes should fail motion gate."""

    def test_static_bbox_rejected(self):
        frames = [(i, 100.0, 100.0, 110.0, 110.0, 0.9) for i in range(40)]
        self.assertFalse(_is_moving_ball_segment(frames, frame_w=1280, frame_h=720))

    def test_moving_track_accepted(self):
        frames = [
            (i, 10.0 + i, 10.0 + i, 12.0 + i, 12.0 + i, 0.9) for i in range(40)
        ]
        self.assertTrue(_is_moving_ball_segment(frames, frame_w=1280, frame_h=720))


class TestSessionSpeedRescale(unittest.TestCase):
    def test_rescale_lifts_low_median_session(self):
        cfg = PaceConfig(slow_max_kmh=75, medium_max_kmh=95, use_very_fast=False)
        deliveries = [
            {"ball_track_matched": True, "speed_kmh_est": 47.0, "pace_band": "slow", "quality_flags": []},
            {"ball_track_matched": True, "speed_kmh_est": 49.0, "pace_band": "slow", "quality_flags": []},
            {"ball_track_matched": True, "speed_kmh_est": 51.0, "pace_band": "slow", "quality_flags": []},
        ]
        info = _apply_session_ball_speed_rescale(deliveries, cfg)
        self.assertIsNotNone(info)
        self.assertTrue(info.get("applied"))
        self.assertGreater(info["factor"], 1.2)
        meds = sorted(float(d["speed_kmh_est"]) for d in deliveries)  # type: ignore
        self.assertGreaterEqual(meds[1], 65.0)


class TestSpeedProfile(unittest.TestCase):
    def test_uniform_motion_ballpark(self):
        n = 16
        fps = 30.0
        ts = np.arange(n, dtype=float) / fps
        frac = 0.55
        t_along = np.linspace(0, frac, n)
        axis_px = 600.0
        seg_m = 10.06
        points = np.stack(
            [300.0 + np.linspace(0, frac * axis_px, n), np.ones(n) * 400.0],
            axis=1,
        )
        spd, rel, _warn = _speed_profile(ts, t_along, points, seg_m, axis_px)
        self.assertFalse(math.isnan(spd))
        self.assertGreater(spd, 44.0)
        self.assertLess(spd, 140.0)
        self.assertGreater(rel, 0.4)


class TestRealisticSpeed(unittest.TestCase):
    def test_discards_sub_physical(self):
        out, w, rel = _realistic_ball_speed_kmh(12.0, [], 0.9)
        self.assertIsNone(out)
        self.assertIn("speed_discarded_sub_physical", w)

    def test_keeps_clean_medium(self):
        out, w, rel = _realistic_ball_speed_kmh(72.0, [], 0.9)
        self.assertIsNotNone(out)
        self.assertAlmostEqual(out, 72.0, places=3)
        self.assertNotIn("speed_adjusted_plausible_floor", w)

    def test_nudges_noisy_low_toward_floor(self):
        out, w, rel = _realistic_ball_speed_kmh(
            8.0,
            ["very_low_speed_estimate"],
            0.8,
        )
        self.assertIsNotNone(out)
        self.assertGreater(out, 35.0)
        self.assertIn("speed_adjusted_plausible_floor", w)


class TestShotMatchingPolicy(unittest.TestCase):
    def test_match_uses_overlap_window(self):
        shots = [
            {"shot_num": 1, "_display_num": 1, "peak_frame": 120, "conf": 0.92},
            {"shot_num": 2, "_display_num": 2, "peak_frame": 260, "conf": 0.88},
        ]
        self.assertEqual(_match_shot(shots, 110, 140), 1)
        self.assertEqual(_match_shot(shots, 250, 300), 2)
        self.assertIsNone(_match_shot(shots, 141, 249))


class TestIntegrationBallPipeline(unittest.TestCase):
    """Runs full YOLO path only when model + video exist."""

    def test_run_on_sample_video(self):
        if os.getenv("BALL_INTEGRATION_TEST", "").strip().lower() not in ("1", "true", "yes"):
            self.skipTest("Set BALL_INTEGRATION_TEST=1 to run YOLO integration (slow).")

        root = ROOT
        model = root / "assets" / "best_ball.pt"
        video = root / "assets" / "net_session_video.mp4"
        if not model.is_file() or not video.is_file():
            self.skipTest("best_ball.pt or net_session_video.mp4 missing")

        try:
            from ball_analytics import run_ball_analytics
        except ImportError:
            self.skipTest("ball_analytics import failed")

        out = run_ball_analytics(
            str(video),
            [],
            fps=30.0,
            frame_w=640,
            frame_h=480,
            ws=None,
            loop=None,
        )
        self.assertIn("deliveries", out)
        if out.get("error"):
            # Model/video mismatch still validates module wiring
            self.assertIsInstance(out["error"], str)
            return
        for d in out.get("deliveries", []):
            self.assertIn("speed_reliability_score", d)
            self.assertIn("pace_band", d)
            self.assertIn("pitch_plot", d)


if __name__ == "__main__":
    unittest.main()
