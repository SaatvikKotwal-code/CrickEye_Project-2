# CrickEye v7.0 — Complete AI Models, Architecture & End-to-End Documentation

---

## 1. Project Overview & Layman Explanation

**CrickEye** is a single-camera AI cricket batting biomechanics and Hawkeye-style ball analytics platform. It converts any standard smartphone, laptop webcam, or tripod-mounted net camera into an automated coaching and biomechanics lab without requiring wearable bat sensors or multi-camera broadcast rigs.

- **Core Problem Solved**: Commercial multi-camera Hawkeye installations cost **$60,000 to $250,000 (₹50 Lakhs to ₹2 Crores)** and require 6 to 10 ultra-high-speed industrial cameras. Grassroots academies, schools, and club cricketers cannot afford this. Meanwhile, wearable bat sensors alter bat swing weight and pickup, while remaining completely blind to the batsman's head, hips, and footwork.
- **CrickEye Solution**: Runs an end-to-end deep learning and physics pipeline from a single front-on camera, returning an annotated slow-motion MP4, a `/10` biomechanical score per shot, pitch bounce zones, a 360° Wagon Wheel, and AI coaching drills.

---

### 1.1 Technicality Explained in Plain English (Layman's Guide)

If you strip away all mathematical jargon (neural networks, GFLOPs, tensors), the core concept is straightforward:

> **"It turns an ordinary smartphone camera or webcam into an elite International Cricket Coach and TV Broadcast Hawkeye system."**

When you record a shot at the nets, **three AI experts** inspect the video simultaneously:

```
                    ┌──────────────────────────────────────────────────────────┐
                    │                  UPLOADED CRICKET VIDEO                  │
                    └─────────────────────────────┬────────────────────────────┘
                                                  │
         ┌────────────────────────────────────────┼────────────────────────────────────────┐
         ▼                                        ▼                                        ▼
┌──────────────────────┐               ┌───────────────────────┐               ┌───────────────────────┐
│   EXPERT 1: EYES     │               │    EXPERT 2: JUDGE    │               │  EXPERT 3: HAWKEYE    │
│    (YOLOv8-Pose)     │               │  (Swin3D Transformer) │               │   (Ball Detector)     │
│ Tracks the batsman's │               │ Watches human motion  │               │ Finds the ball, where │
│ skeleton, balance,   │               │ to recognize the shot │               │ it bounces, and how   │
│ posture, and swing.  │               │ (Cover, Pull, Sweep). │               │ fast the bowler bowled│
└──────────────────────┘               └───────────────────────┘               └───────────────────────┘
```

1. **Expert 1: The Biomechanics Coach (YOLOv8-Pose)**:
   - Sticks 17 virtual motion-capture markers on the batsman's nose, shoulders, elbows, wrists, hips, knees, and ankles.
   - Evaluates whether the head was steady over the ball, measures bat swing speed (km/h) via wrist acceleration, and checks if the front foot stepped in line.
2. **Expert 2: The Shot Identifier (3D Swin Transformer)**:
   - Just like a human spectator recognizes a shot within 1 second, this model analyzes 16 continuous video frames to classify the stroke into **Cover Drive, Flick, Pull, Straight Drive, or Sweep**, and checks if the batter is Right-Handed or Left-Handed.
3. **Expert 3: The Virtual Hawkeye (YOLO Ball Detector)**:
   - Detects the small, high-speed cricket ball in flight.
   - Fits a physics trajectory to mark the exact **pitch bounce point** (*Yorker, Full, Good Length, Back of Length, Short*) and estimates bowler release pace.

---

## 2. AI Models Inventory, Parameters, Compute & Accuracy

Every model specification below was verified directly from the binary checkpoints in `assets/` and the runtime codebase (`analyse_session.py`, `ball_analytics.py`, `backend/services/llmInsights.js`).

### 2.1 Active Pipeline Models (Executed on Video Upload)

| # | Model File | Architecture & Input Spec | Layers / GFLOPs | Exact Parameters | Training Dataset & Epochs | Verified Checkpoint Accuracy / Runtime Gates |
| :---: | :--- | :--- | :---: | :---: | :--- | :--- |
| **1** | `assets/yolov8n-pose.pt` | **Ultralytics YOLOv8n-Pose** (`yolov8n-pose.yaml`)<br>Detects `person` + **17 COCO body keypoints**<br>Input: `640×640` RGB | **144 layers**<br>**9.3 GFLOPs** | **3,295,470**<br>(**3.30M**) | Standard **COCO-Pose** (`coco-pose.yaml`), 1000-epoch config, batch 128, `lr0=0.01` | Pretrained COCO weights.<br>Runtime gates: `MIN_POSE_CONF = 0.40`, `MIN_KEYPOINT_CONF = 0.30`. |
| **2** | `assets/crickeye_best.pth` | **3D Swin Transformer Tiny (`swin3d_t`)**<br>Spatio-temporal video action classifier<br>Input: `16` RGB frames × `224×224`<br>Classes (5): `cover`, `flick`, `pull`, `straight`, `sweep` | Spatio-temporal 3D Transformer | **29,698,283**<br>(**29.70M**) | External cricket video dataset (16-frame action clips) | Checkpoint Keys: `model_state_dict`, `class_to_idx`, `idx_to_class`, `shot_classes`, `num_frames` (16), `img_size` (224), `model_arch` (`swin3d_t`).<br>Runtime gate: `CONF_THRESHOLD = 0.28`. |
| **3** | `assets/best_ball.pt` | **Fine-tuned YOLO Detector** (base: `CBDbest.pt`)<br>Detects cricket `ball` per frame<br>Input: `640×640` RGB | **130 layers**<br>**28.6 GFLOPs** | **11,135,987**<br>(**11.14M**) | Custom cricket delivery dataset (`yolo_dataset/dataset.yaml`), **25 epochs**, batch 8, `lr0=0.01` | Stored `train_metrics` (Epoch 25):<br>• **Precision (B)**: **92.13%** (`0.92133`)<br>• **Recall (B)**: **75.90%** (`0.75904`)<br>• **mAP@50**: **82.17%** (`0.82169`)<br>• **mAP@50-95**: **37.75%** (`0.37752`) |
| **4** | `backend/services/llmInsights.js` | **Cloud LLM + Rule-Based Fallback**<br>Providers: Google **Gemini** (`gemini-2.0-flash` / `gemini-3.6-flash`) or **DGX (`qwen3:latest`)**, with deterministic `rule_based` fallback | Cloud API | Cloud-hosted (no local weights) | N/A (API inference) | Synthesizes natural-language coaching summaries, technical flaws, and customized training drills from session JSON. |

**Total Active Local Computer Vision Parameters**: `3,295,470 + 29,698,283 + 11,135,987` = **44,129,740 (~44.13M parameters)**.

---

### 2.2 Optional / Standalone Model Checkpoint in `assets/`

| Model File | Architecture & Input | Layers / GFLOPs | Exact Parameters | Training Source & Hyperparameters | Stored Validation Metrics (`train_metrics` & Epoch 50) | Runtime Status |
| :--- | :--- | :---: | :---: | :--- | :--- | :--- |
| `assets/best_bat.pt` | **YOLOv8m** (`yolov8m.pt`)<br>`depth_multiple=0.67`, `width_multiple=0.75`<br>Single class `{0: 'bat'}`, `[B, 3, 640, 640]` RGB, strides `[8, 16, 32]` | **170 layers**<br>**79.1 GFLOPs** | **25,856,899**<br>(**25.86M**, ~52.0 MB) | `/kaggle/input/datasets/sukriti07/bat-detection-data/data.yaml`, **50 epochs**, batch `16`, `amp=True`, trained `2026-04-15` | **Best (`train_metrics`, Epoch 47)**:<br>• **Precision (B)**: **99.57%** (`0.99567`)<br>• **Recall (B)**: **89.45%** (`0.89451`)<br>• **mAP@50**: **94.60%** (`0.94595`)<br>• **mAP@50-95**: **66.50%** (`0.66503`)<br>**Epoch 50**: P `97.87%`, R `89.29%`, mAP@50 `94.95%` | Added as optional future extension weights; **not loaded** by `analyse_session.py` or `ball_analytics.py`. Bat speed is computed from pose wrist velocity (`_compute_bat_speed_kmh()`) to save 79 GFLOPs per frame. |

---

### 2.3 Why Do We Use the YOLO Model?

1. **Ultra-Fast Single-Stage Detection**:
   - Cricket happens in milliseconds (downswing takes 200–300 ms, ball travels at 100–140 km/h).
   - Older two-stage detectors (like Faster R-CNN) run at 5–10 FPS because they propose regions first and classify them second.
   - YOLO processes the entire image in **one single forward pass**, achieving **50–100+ FPS on GPU** and **25–35 FPS on CPU**.
2. **Unified Bounding Box + 17 Keypoints (YOLOv8-Pose)**:
   - Eliminates the need for two separate neural networks (one to locate the person, another like OpenPose to find joints), cutting memory and runtime in half.
3. **Small Object Detection (PAN-FPN)**:
   - A cricket ball is only 7.2 cm wide and heavily blurred in flight.
   - YOLOv8's Path Aggregation Network (PAN-FPN) preserves high-resolution low-level features, achieving **92.1% precision** on tiny, moving cricket balls.
4. **Lightweight Edge Deployment**:
   - `yolov8n-pose` is only **6.5 MB** (3.3M parameters). It runs on standard laptops without requiring expensive cloud GPU servers.
5. **Completely Contactless**:
   - Requires no wearable hardware, cables, or bat stickers.

---

### 2.4 The Critical Distinction: Bat Model vs. Batting Model

It is vital to distinguish between the **physical bat object detector** and the **batting stroke action recognizer**:

```
                  ┌──────────────────────────────────────────────────────────────┐
                  │                 BAT OBJECT vs. BATTING STROKE                │
                  └──────────────────────────────┬───────────────────────────────┘
                                                 │
                 ┌───────────────────────────────┴───────────────────────────────┐
                 ▼                                                               ▼
    ┌─────────────────────────┐                                     ┌─────────────────────────┐
    │     BAT OBJECT MODEL    │                                     │      BATTING MODEL      │
    │   (assets/best_bat.pt)  │                                     │(assets/crickeye_best.pth│
    ├─────────────────────────┤                                     ├─────────────────────────┤
    │ • Architecture: YOLOv8m │                                     │ • Architecture: Swin3D-T│
    │ • Type: 2D Detector     │                                     │ • Type: 3D Video Action │
    │ • Task: Finds the bat   │                                     │ • Task: Classifies the  │
    │   in a static picture   │                                     │   stroke over 16 frames │
    │ • Status: Extension     │                                     │ • Status: Core Pipeline │
    └─────────────────────────┘                                     └─────────────────────────┘
```

- **The Batting Model (`crickeye_best.pth`) is NOT YOLO**:
  A cricket shot is an action that unfolds across time. You cannot identify a Cover Drive from a single still picture. Therefore, the batting classifier is a **3D Video Swin Transformer (`swin3d_t`)** that analyzes spatiotemporal video cubes.
- **Why `best_bat.pt` is YOLOv8m (Medium)**:
  Detecting a wooden bat during violent motion blur and heavy occlusion (behind pads and gloves) required a deeper 170-layer network to achieve **99.57% precision**.
- **Production Optimization**:
  In `analyse_session.py`, bat swing speed and onsets are derived directly from the batsman's **wrist keypoints** (`_compute_bat_speed_kmh()`). This provides accurate bat velocity without loading an extra 52 MB model into memory.

---

## 3. End-to-End Architecture Diagram

```
+-----------------------------------------------------------------------------------+
|                                1. CLIENT LAYER                                    |
|   +---------------------------------------+   +-------------------------------+   |
|   |   Android App (MainActivity.java)     |   |   Web Dashboard (App.js)      |   |
|   |   - Hardware-Accelerated WebView      |   |   - 3-2-1 Timed Delivery Rec  |   |
|   |   - Screen Wake-Lock (Net Mode)       |   |   - Stance Alignment Grid     |   |
|   |   - AndroidBridge Haptic Vibrations   |   |   - Pitch Map & Wagon Wheel   |   |
|   +---------------------------------------+   +-------------------------------+   |
+------------------------------------------+----------------------------------------+
                                           | HTTP / WebSocket / ADB Reverse
+------------------------------------------v----------------------------------------+
|                        2. FASTAPI BACKEND (backend/main.py)                       |
|   - POST /upload -> saves uploads/<session_id>/video.mp4 & runs worker thread     |
|   - WS /ws       -> streams live progress %, ETAs, onset counts, and completion   |
|   - GET /assets  -> HTTP 206 Partial Content byte-range MP4 video streaming       |
|   - GET /download/apk -> Serves CrickEye-Pro.apk for wireless mobile updates     |
|   - GET /api/mobile-health -> LAN IP & capability discovery for mobile clients    |
|   - POST /llm-insights     -> forwards to Node API (:8080) or falls back cleanly |
+------------------------------------------+----------------------------------------+
                                           |
+------------------------------------------v----------------------------------------+
|                    3. AI & VISION PIPELINE (analyse_session.py)                   |
|   Pass 1: YOLOv8n-pose (17 joints) -> Median Shoulder Scale Normalization         |
|           -> Bilateral Wrist Velocity -> Swing Onset Detection (+ gap recovery)   |
|           -> Swin3D-T (crickeye_best.pth) 5-Class Shot Classification + Handedness|
|           -> Ball Analytics (ball_analytics.py + best_ball.pt): Bounce & Pace     |
|           -> Biomechanics Rule Engine: 100-Point Composite Score & Fault Flags    |
|   Pass 2: OpenCV Skeleton/Ball/Lower-Left Badge Overlay + FFmpeg H.264 Encoding   |
+------------------------------------------+----------------------------------------+
                                           |
+------------------------------------------v----------------------------------------+
|                            4. OUTPUTS & PERSISTENCE                               |
|   - assets/analysed_<session_id>.mp4 & assets/analysed_out.mp4                    |
|   - data/session_report.json & data/session_log.csv                               |
|   - Optional Supabase PostgreSQL (RLS player/coach session history)               |
+-----------------------------------------------------------------------------------+
```

---

## 4. Step-by-Step Pipeline Execution Flow

```
 [User Uploads Video] (via Mobile App or Web Browser)
         │
         ▼
 1. SCALE CALIBRATION (Ruler Setup)  ──► Measures batsman's shoulder in pixels
         │
         ▼
 2. SHOT ONSET DETECTION             ──► Tracks wrist speed peaks to pinpoint the swing
         │
         ▼
 3. 3D SWIN TRANSFORMER (Action AI)  ──► Classifies the stroke (Cover, Pull, Sweep, etc.)
         │
         ▼
 4. BALL ANALYTICS (Hawkeye Engine)  ──► Finds ball trajectory, pitch bounce point & pace
         │
         ▼
 5. BIOMECHANICAL SCORING ENGINE     ──► Grades Head, Footwork, Bat Flow & Middling (/10)
         │
         ▼
 6. SLOW-MOTION VIDEO GENERATION     ──► Burns neon skeleton & TV broadcast badge
         │
         ▼
 7. AI LLM COACHING INSIGHTS         ──► Generates personal strengths, flaws & net drills
```

### Step 1: Capture & Ingestion
- **Live Net Mode**: The batsman aligns inside the on-screen Stance Alignment Grid. A 3-2-1 countdown triggers video capture via `MediaRecorder`.
- **Upload**: Video is posted to `POST /upload`, saved to `uploads/<session_id>/video.mp4`, and dispatched to a background thread while live status streams over `/ws`.

### Step 2: Scale Calibration (The Digital Ruler)
- OpenCV reads video dimensions and frame rate.
- `yolov8n-pose.pt` detects the batsman and computes their **median shoulder width in pixels**.
- Since an adult human shoulder width is physically $\approx 0.40\text{ meters}$, the pipeline calculates:
  $$\text{pixel\_scale} = \frac{0.40}{\text{median\_shoulder\_px}}$$
  All velocity thresholds, stride distances, and bounce points scale by `pixel_scale`, making analysis zoom- and distance-invariant.

### Step 3: Wrist Velocity & Shot Onset Detection
- Tracks Euclidean left and right wrist velocities frame-to-frame.
- When a swing occurs, bilateral wrist speed spikes into a distinct peak.
- `find_shot_onsets()` uses peak-detection with a 1.6-second separation window and gap-bridging logic to ensure all shots (including subtle flicks) are captured without double-counting.

### Step 4: 3D Swin Transformer Shot Classification (`crickeye_best.pth`)
- For each detected swing, a **16-frame spatiotemporal clip** ($224 \times 224$ RGB) is extracted.
- `swin3d_t` evaluates the temporal motion cube and outputs probabilities across 5 classes:
  1. `cover` (Cover Drive)
  2. `flick` (Flick / On-Drive)
  3. `pull` (Pull / Hook)
  4. `straight` (Straight Drive / Push)
  5. `sweep` (Sweep shot)
- Relative front vs. rear shoulder orientation determines **Right-Handed (`RHB`)** or **Left-Handed (`LHB`)** stance.

### Step 5: Hawkeye Ball Tracking (`best_ball.pt` + `ball_analytics.py`)
- Scans delivery frames to locate the moving cricket ball (`conf=0.50`, `iou=0.45`).
- Fits a physics-based parabolic trajectory curve.
- Pinpoints the **pitch bounce point** (lowest vertical inflection point) and classifies delivery length:
  - **Yorker**: $< 2\text{ m}$ from batting crease
  - **Full**: $2\text{ m} - 4\text{ m}$
  - **Good Length**: $4\text{ m} - 6\text{ m}$
  - **Back of Length**: $6\text{ m} - 8\text{ m}$
  - **Short**: $> 8\text{ m}$
- Computes bowler release pace (`speed_kmh_est`) using calibrated pitch homography.

### Step 6: Biomechanics Assessment & 100-Point Composite Scoring
The engine evaluates four core pillars of batting mechanics, weighted into an overall **`shot_score` out of 10.0**:

| Sub-Metric | Weight | Exact Parameters Measured & Stored | Key Diagnostic Fault Flags |
| :--- | :---: | :--- | :--- |
| **1. Head Stability** (`head_quality_score`) | **28%** | Lateral and vertical drift of nose/eyes from stance to contact | `HEAD_LATERAL_DRIFT`, `HEAD_VERTICAL_DRIFT`, `HEAD_DUCKING_PULL` |
| **2. Shot Execution vs. Length** (`execution_score`) | **22%** | Appropriateness of shot selection vs. ball's `length_zone` | `FOOTWORK_LINE_MISMATCH` |
| **3. Footwork & Timing** (`footwork_score`) | **20%** | Pre-shot trigger, front-foot plant timing relative to impact | `LATE_PLANT`, `NO_TRIGGER`, `FEET_STATIC` |
| **4. Stance Symmetry** (`symmetry_score`) | **12%** | Shoulder and hip tilt angles relative to horizontal plane | `STANCE_ASYMMETRIC` |
| **5. Front Elbow Shape** (`elbow_score`) | **12%** | High front elbow ratio, extension, and collapse checks | `ELBOW_COLLAPSE`, `ELBOW_BEHIND_PAD`, `ELBOW_REACHING` |
| **6. Swing Path Quality** (`swing_path_score`) | **6%** | Wrist-path linearity and directness into contact | `BAT_DECELERATING` |

- **Bat Swing Speed**: `peak_swing_speed` (km/h) is computed from wrist velocity and displayed in the HUD.

### Step 7: Slow-Motion Video Annotation & Data Export
- OpenCV renders 17-joint neon skeletons, ball flight arcs, and bounce markers.
- In the **lower-left corner**, renders a crisp TV broadcast badge:
  ```text
  SHOT 1 • COVER DRIVE • 8.4/10 • BAT SPEED: 88.2 KM/H
  ```
- FFmpeg encodes the slow-motion MP4 (`assets/analysed_<session_id>.mp4`).
- Exports structured data to `data/session_report.json` and `data/session_log.csv`.

### Step 8: AI Coaching Insights (LLM)
- `backend/services/llmInsights.js` formats the session scores and fault tags into a prompt for Google Gemini or DGX Qwen3.
- Synthesizes coach-level strengths, priority flaws, and customized net practice drills.

---

## 5. User-Facing Results & Dashboards

1. **Annotated Slow-Motion Video Player**: Seekable H.264 stream with skeleton, ball trail, and lower-left shot badge, synced with clickable shot pills (`Shot #1` to `Shot #N`).
2. **PlayCard & Biomechanics Breakdown**: Shows shot quality label (`Top class`, `Good`, `Average`, `Needs work`), score out of 10, bat speed, and fault tags.
3. **2D Hawkeye Pitch Map**: Plots delivery bounce spots across the 5 length zones with bowling pace estimates.
4. **360° Wagon Wheel**: Radial chart projecting shot dispersion into off-side, straight, and leg-side sectors.
5. **Session Summary & Fatigue Analysis**: Tracks 1st Half vs. 2nd Half stamina degradation (`fatigue_detected`), best/worst shots, and active feet percentage.
6. **AI Coach Drills**: Structured natural-language practice recommendations.

---

## 6. Setup & Mobile Connectivity

### 6.1 Starting the Backend
```bash
pip install -r requirements.txt
python run_server.py
```
Uvicorn starts on `http://0.0.0.0:8000`.

### 6.2 Mobile App Connection Modes
1. **Wi-Fi Mode (Wireless)**:
   - Connect phone to the same Wi-Fi network (or laptop Mobile Hotspot).
   - Open app or navigate to `http://<LAPTOP_LAN_IP>:8000` (e.g. `http://10.253.10.100:8000`).
   - Health Check: `GET /api/mobile-health`.
2. **USB Cable Mode (Zero-Lag)**:
   - Connect phone via USB with USB Debugging enabled.
   - Run:
     ```powershell
     adb reverse tcp:8000 tcp:8000
     ```
   - Connect inside app to `http://localhost:8000`.
3. **Wireless APK Update**:
   - Download the compiled APK directly from any mobile browser:
     ```text
     http://<LAPTOP_LAN_IP>:8000/download/apk
     ```
