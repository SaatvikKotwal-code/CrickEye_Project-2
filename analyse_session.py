"""
CrickEye v6.4 — analyse_session.py
Full biomechanics pipeline with WebSocket real-time streaming.

KEY CHANGES vs v6.3:
  - Bat speed is now calibrated to km/h using shoulder-width-derived
    pixels-per-metre scale factor, computed per-shot inside extract_biomechanics().
  - A bat-tip multiplier (BAT_TIP_MULTIPLIER = 1.35) is applied because wrist
    velocity underestimates bat-tip speed by ~30-40%.  Tune this against known
    radar/Hawk-Eye data when available.
  - peak_swing_speed stored in the JSON / CSV / WS messages is now in km/h.
  - power_score formula rescaled: 100 = 120 km/h (hard hitting ceiling).
  - fps is now passed into extract_biomechanics() so the conversion is accurate.
  - All display labels updated: "px/s" -> "km/h".

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

# -- Biomechanics thresholds
BACK_PLANTED_PX          = 18.0
FRONT_STRIDE_PX          = 20.0
HIP_SHIFT_PX             = 10.0
BACK_PIVOT_RATIO         = 1.2
HEAD_STABLE_GOOD         = 70
HEAD_STABLE_WARN         = 40
STABILITY_GOOD           = 70
STABILITY_WARN           = 45

# -- CALIBRATION -- bat speed -----------------------------------------
# Average adult shoulder width in metres used as the pixel ruler.
# Tune SHOULDER_WIDTH_M per your player population if needed.
SHOULDER_WIDTH_M         = 0.45
# Wrist velocity underestimates bat-tip speed because the bat is a lever.
# 1.35 is a conservative midpoint (range 1.25-1.50).
# Replace with a measured value once you have radar or Hawk-Eye ground truth.
BAT_TIP_MULTIPLIER       = 0.95
# km/h ceiling for power_score = 100.  120 km/h = hard attacking shot.
POWER_SCORE_CEILING_KMH  = 140.0

SPEED_SANITY_CAP_KMH     = 130.0
SHOULDER_FALLBACK_PX     = 89.0          # session-avg, not fixed 60
MIN_SHOULDER_PX          = 25.0

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
# BIOMECHANICS ENGINE
# -----------------------------------------------------------------

def extract_biomechanics(all_keypoints, lw_vels, rw_vels, bilateral,
                         start_frame, onset_frame, end_frame,
                         handedness='RHB',
                         fps=30.0):           # CALIBRATION: fps added
    N = len(all_keypoints)

    def kp_at(f):
        return all_keypoints[max(0, min(f, N - 1))]

    def safe_get(f, key):
        return kp_at(f).get(key)

    clip_bilateral = bilateral[start_frame:end_frame]
    if len(clip_bilateral) == 0:
        clip_bilateral = [0.0]
    contact_frame = start_frame + int(np.argmax(clip_bilateral))

    # 1. RAW SWING SPEED (px/frame) -- internal only
    raw_peak_px_per_frame = float(np.max(clip_bilateral))

    # 2. FOOTWORK
    if handedness == 'LHB':
        back_key, front_key = 'la', 'ra'
    else:
        back_key, front_key = 'ra', 'la'

    back_anchor   = safe_get(start_frame, back_key)
    front_anchor  = safe_get(start_frame, front_key)
    back_contact  = safe_get(contact_frame, back_key)
    front_contact = safe_get(contact_frame, front_key)

    back_disp  = dist(back_anchor, back_contact)
    front_disp = dist(front_anchor, front_contact)

    lh_start = safe_get(start_frame, 'lh')
    rh_start = safe_get(start_frame, 'rh')
    lh_cont  = safe_get(contact_frame, 'lh')
    rh_cont  = safe_get(contact_frame, 'rh')

    hip_start   = midpoint(lh_start, rh_start)
    hip_contact = midpoint(lh_cont, rh_cont)

    if hip_start and hip_contact:
        hip_shift = (hip_start[0] - hip_contact[0] if handedness == 'RHB'
                     else hip_contact[0] - hip_start[0])
    else:
        hip_shift = 0

    if front_disp > back_disp * 1.15 and hip_shift > 3:
        footwork = "front_foot"; footwork_conf = "high"
    elif back_disp > front_disp * 1.1 and hip_shift < -3:
        footwork = "back_foot";  footwork_conf = "high"
    else:
        footwork = "neutral";    footwork_conf = "low"

    # 3. HEAD STABILITY
    head_positions = []
    for f in range(contact_frame - 3, contact_frame + 4):
        kp   = kp_at(f)
        nose = kp.get('nose')
        if nose:
            head_positions.append(nose)
        else:
            mp = midpoint(kp.get('ls'), kp.get('rs'))
            if mp:
                head_positions.append(mp)

    head_positions = smooth_points(head_positions)
    ls_c = safe_get(contact_frame, 'ls')
    rs_c = safe_get(contact_frame, 'rs')
    shoulder_px = dist(ls_c, rs_c)   # CALIBRATION: captured for converter
    # Use session-level average shoulder if this shot's detection is weak
    if shoulder_px < MIN_SHOULDER_PX:
        shoulder_px = SHOULDER_FALLBACK_PX

    if len(head_positions) >= 2 and shoulder_px > 5:
        xs = [p[0] for p in head_positions]
        ys = [p[1] for p in head_positions]
        raw_var    = float(np.var(xs) + np.var(ys))
        normalised = raw_var / (shoulder_px ** 2)
        head_stability = round(100 / (1 + normalised * 5), 1)
    else:
        head_stability = 50.0

    # 4. STABILITY SCORE
    jitter_keys  = ['la', 'ra', 'lk', 'rk']
    jitter_total = 0.0
    jitter_count = 0

    for key in jitter_keys:
        pts = []
        for f in range(contact_frame - 3, contact_frame + 4):
            p = kp_at(f).get(key)
            if p:
                pts.append(p)
        if len(pts) >= 2:
            jitter_total += float(np.var([p[0] for p in pts]) +
                                   np.var([p[1] for p in pts]))
            jitter_count += 1

    if jitter_count > 0:
        avg_jitter     = jitter_total / jitter_count
        body_score     = max(0, 100 - (avg_jitter / 20))
        stability_score = round(0.7 * body_score + 0.3 * head_stability, 1)
    else:
        stability_score = 50.0

    # CALIBRATION: convert raw px/frame -> km/h
    peak_swing_speed_kmh = px_per_frame_to_kmh(
        raw_peak_px_per_frame, shoulder_px, fps
    )

    # 5. SHOT SCORE  (speed component uses km/h, ceiling = POWER_SCORE_CEILING_KMH)
    speed_norm = min(1.0, peak_swing_speed_kmh / POWER_SCORE_CEILING_KMH)
    head_norm  = head_stability / 100
    stab_norm  = stability_score / 100
    shot_score = round((0.4*speed_norm + 0.25*head_norm + 0.35*stab_norm)*10, 1)

    if shot_score >= 8:   shot_quality = "Excellent"
    elif shot_score >= 6: shot_quality = "Good"
    elif shot_score >= 4: shot_quality = "Average"
    else:                 shot_quality = "Poor"

    flags = []
    if head_stability < 30:      flags.append("HEAD_MOVING")
    if stability_score < 50:     flags.append("UNSTABLE")
    if footwork == "neutral":    flags.append("FOOTWORK_UNCLEAR")

    return {
        "peak_swing_speed": peak_swing_speed_kmh,  # CALIBRATION: now km/h
        "footwork":         footwork,
        "footwork_conf":    footwork_conf,
        "head_stability":   head_stability,
        "stability_score":  stability_score,
        "shot_score":       shot_score,
        "shot_quality":     shot_quality,
        "flags":            flags,
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
            'count'            : len(shots),
            'avg_conf'         : safe_mean([s['conf'] for s in shots]),
            'peak_swing_speed' : agg('peak_swing_speed'),   # km/h
            'head_stability'   : agg('head_stability'),
            'stability_score'  : agg('stability_score'),
            'footwork_counts'  : {
                'front_foot': sum(1 for s in shots if s.get('footwork') == 'front_foot'),
                'back_foot' : sum(1 for s in shots if s.get('footwork') == 'back_foot'),
                'neutral'   : sum(1 for s in shots if s.get('footwork') == 'neutral'),
            },
        }

    all_speeds = [e.get('peak_swing_speed') for e in confirmed]
    all_head   = [e.get('head_stability')    for e in confirmed]
    all_stab   = [e.get('stability_score')   for e in confirmed]

    mid         = n // 2
    first_half  = confirmed[:mid] if mid > 0 else confirmed
    second_half = confirmed[mid:] if mid < n else confirmed

    def half_mean(shots, key):
        return safe_mean([s.get(key) for s in shots])

    trend = {
        'peak_swing_speed': {
            'first_half' : half_mean(first_half,  'peak_swing_speed'),
            'second_half': half_mean(second_half, 'peak_swing_speed'),
        },
        'head_stability': {
            'first_half' : half_mean(first_half,  'head_stability'),
            'second_half': half_mean(second_half, 'head_stability'),
        },
        'stability_score': {
            'first_half' : half_mean(first_half,  'stability_score'),
            'second_half': half_mean(second_half, 'stability_score'),
        },
    }

    s1 = trend['peak_swing_speed']['first_half']
    s2 = trend['peak_swing_speed']['second_half']
    fatigue_flag = (s1 is not None and s2 is not None and s2 < s1 * 0.80)

    front_count   = sum(1 for e in confirmed if e.get('footwork') == 'front_foot')
    back_count    = sum(1 for e in confirmed if e.get('footwork') == 'back_foot')
    neutral_count = sum(1 for e in confirmed if e.get('footwork') == 'neutral')

    valid_speeds = [s for s in all_speeds if s is not None]
    avg_speed    = round(float(np.mean(valid_speeds)), 1) if valid_speeds else None
    power_score  = round(min(100.0, (avg_speed / POWER_SCORE_CEILING_KMH) * 100), 1) if avg_speed else None

    head_score  = safe_mean(all_head)
    stab_score  = safe_mean(all_stab)

    alerts = []
    all_flags   = [f for e in confirmed for f in e.get('flags', [])]
    flag_counts = defaultdict(int)
    for f in all_flags:
        flag_counts[f.split(':')[0]] += 1

    if flag_counts.get('HEAD_MOVING', 0) >= 2:
        worst_head = min(confirmed, key=lambda e: e.get('head_stability', 100))
        alerts.append({
            'severity': 'HIGH',
            'metric'  : 'Head stability',
            'message' : f"Poor head stability on {flag_counts['HEAD_MOVING']} shots. "
                        f"Worst: Shot #{worst_head['_display_num']} {worst_head['label']} "
                        f"(score={worst_head.get('head_stability', 0):.0f}/100)",
            'action'  : "Keep eyes level and still through contact. "
                        "Shadow drills in front of mirror. Focus on watching ball onto bat.",
        })
    if fatigue_flag:
        alerts.append({
            'severity': 'MEDIUM',
            'metric'  : 'Fatigue / swing speed',
            # CALIBRATION: fatigue message now in km/h
            'message' : f"Bat speed dropped from {s1:.0f} to {s2:.0f} km/h "
                        f"({((s1-s2)/s1*100):.0f}% decline in second half of session).",
            'action'  : "Reduce session length or add mid-session rest. "
                        "Consider bat speed conditioning drills.",
        })
    if flag_counts.get('UNSTABLE', 0) >= 2:
        alerts.append({
            'severity': 'MEDIUM',
            'metric'  : 'Body balance',
            'message' : f"Low stability score on {flag_counts['UNSTABLE']} confirmed shots.",
            'action'  : "Single-leg balance drills. Focus on head-over-ball at contact. "
                        "Widen stance slightly.",
        })
    # CALIBRATION: low-speed alert threshold updated to km/h
    if avg_speed is not None and avg_speed < 40.0:
        alerts.append({
            'severity': 'LOW',
            'metric'  : 'Bat speed',
            'message' : f"Average bat speed {avg_speed:.0f} km/h is low for competitive play.",
            'action'  : "Resistance band bat-swing exercises. Check grip tension.",
        })

    best_shot  = max(confirmed, key=lambda e: e.get('shot_score', 0))
    worst_shot = min(confirmed, key=lambda e: e.get('shot_score', 0))

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
        'session_scores'     : {
            'power'           : power_score,
            'head_discipline' : head_score,
            'stability'       : stab_score,
        },
        'session_averages'   : {
            'peak_swing_speed': safe_mean(all_speeds),   # km/h
            'head_stability'  : safe_mean(all_head),
            'stability_score' : safe_mean(all_stab),
        },
        'footwork_summary'   : {
            'front_foot_count': front_count,
            'back_foot_count' : back_count,
            'neutral_count'   : neutral_count,
        },
        'trend'              : trend,
        'fatigue_detected'   : fatigue_flag,
        'by_shot_type'       : type_stats,
        'coaching_alerts'    : alerts,
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
            fps=fps,          # CALIBRATION: pass fps through
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
        # CALIBRATION: log now shows km/h
        print(f"  Shot #{i+1:3d} @ frame {onset_frame:5d} ({ts}): "
              f"{label.upper():10s} {conf*100:.1f}%  "
              f"stance={hand_str}  foot={biomech['footwork']}  "
              f"speed={biomech['peak_swing_speed']:.1f}km/h  "
              f"head={biomech['head_stability']:.0f}  "
              f"stab={biomech['stability_score']:.0f}  "
              f"score={biomech['shot_score']}/10  {flag_str}")

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
        # CALIBRATION: header label updated
        w.writerow(['shot_num','display_num','timestamp','label','confidence','confirmed',
                    'bat_speed_kmh','footwork','footwork_conf',
                    'head_stability','stability_score','shot_score','shot_quality'])
        for e in shot_log:
            w.writerow([
                e['shot_num'],
                e['_display_num'] if e['_display_num'] else '---',
                e['timestamp'], e['label'],
                f"{e['conf']:.4f}",
                'YES' if e['conf'] >= CONF_THRESHOLD else 'NO',
                e.get('peak_swing_speed'),    # km/h
                e.get('footwork'),
                e.get('footwork_conf'),
                e.get('head_stability'),
                e.get('stability_score'),
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
                'shot_num'        : e['shot_num'],
                'display_num'     : e['_display_num'],
                'label'           : e['label'],
                'confidence'      : round(e['conf'], 4),
                'confirmed'       : e['conf'] >= CONF_THRESHOLD,
                'timestamp'       : e['timestamp'],
                'peak_frame'      : e['peak_frame'],
                'travel_px'       : e['onset_score'],
                'peak_swing_speed': e.get('peak_swing_speed'),  # km/h
                'footwork'        : e.get('footwork'),
                'footwork_conf'   : e.get('footwork_conf'),
                'head_stability'  : e.get('head_stability'),
                'stability_score' : e.get('stability_score'),
                'shot_score'      : e.get('shot_score'),
                'shot_quality'    : e.get('shot_quality'),
                'flags'           : e.get('flags', []),
                'probs'           : {cls: round(p, 4)
                                     for cls, p in zip(SHOT_CLASSES, e['probs'])},
            } for e in shot_log],
        }, f, indent=2)
    print(f"[CrickEye] JSON -> {json_path}")


def print_summary(shot_log, session_info, analysis):
    confirmed = [e for e in shot_log if e['conf'] >= CONF_THRESHOLD]
    print("\n" + "="*60)
    print("  CRICKEYE v6.4 -- SESSION ANALYSIS COMPLETE")
    print("="*60)
    print(f"  Stance: {session_info['handedness']}  ({session_info['conf']:.0%})")
    print(f"\n  Per-Shot Analysis (confirmed only):\n")
    for e in confirmed:
        flags    = e.get('flags', [])
        flag_str = f" [{', '.join(flags)}]" if flags else ""
        # CALIBRATION: summary shows km/h
        print(
            f"  Shot #{e['_display_num']:2d} | {e['label']:<8} "
            f"{e['conf']*100:4.0f}%  | "
            f"Speed={e.get('peak_swing_speed',0):>6.1f}km/h | "
            f"Head={e.get('head_stability',0):>5.0f} | "
            f"Stab={e.get('stability_score',0):>5.0f} | "
            f"Score={e.get('shot_score',0):>4.1f}/10 | "
            f"{e.get('shot_quality','-')}{flag_str}"
        )
    if analysis and not analysis.get('error'):
        b  = analysis.get('best_shot',  {})
        wr = analysis.get('worst_shot', {})
        if b:  print(f"\n  Best Shot:  #{b['shot_num']} {b['label']} ({b['shot_score']}/10)")
        if wr: print(f"  Worst Shot: #{wr['shot_num']} {wr['label']} ({wr['shot_score']}/10)")
        scores = analysis.get('session_scores', {})
        avgs   = analysis.get('session_averages', {})
        print("\n  Session Scores (confirmed shots only):")
        for k, v in scores.items():
            if v is not None: print(f"    {k}: {v:.1f}")
        # CALIBRATION: avg speed in km/h
        spd = avgs.get('peak_swing_speed')
        if spd: print(f"  Avg bat speed: {spd:.1f} km/h")
    print("="*60 + "\n")

# -----------------------------------------------------------------
# ENTRY POINTS
# -----------------------------------------------------------------

def run_pipeline(video_path=None, output_path=None):
    vp = video_path or VIDEO_PATH
    op = output_path or OUTPUT_PATH
    print("\n" + "="*60)
    print("  CrickEye v6.4 -- CLI Mode")
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
                "type":             "shot",
                "shot_num":         e['_display_num'],
                "label":            e['label'],
                "conf":             round(e['conf'], 4),
                "confirmed":        True,
                "timestamp":        e['timestamp'],
                "peak_frame":       e['peak_frame'],
                "onset_score":      e['onset_score'],
                "handedness":       e.get('_session_hand', session_info['handedness']),
                "stance_conf":      e.get('_session_conf', session_info['conf']),
                "peak_swing_speed": e['peak_swing_speed'],  # km/h
                "footwork":         e['footwork'],
                "footwork_conf":    e['footwork_conf'],
                "head_stability":   e['head_stability'],
                "stability_score":  e['stability_score'],
                "shot_score":       e['shot_score'],
                "shot_quality":     e['shot_quality'],
                "flags":            e['flags'],
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