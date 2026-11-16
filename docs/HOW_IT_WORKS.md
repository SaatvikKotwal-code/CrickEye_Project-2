# 🧠 CrickEye – How the AI Pipeline Works

This document explains what happens from the moment you press record to the moment coaching feedback appears on screen. It's written for everyone — no coding knowledge needed for the first half, technical detail follows for developers.

---

## 🎬 The Journey of One Delivery

### Step 1 — Record the Delivery
You press the record button (or use the 3-2-1 countdown). The app captures ~5 seconds of video — one delivery. This video is either recorded live from your webcam or uploaded as a file.

### Step 2 — Pose Detection (YOLOv8n-pose)
The AI reads every frame of the video and finds **17 body keypoints** — specific points on your body:

```
Nose · Left Eye · Right Eye · Left Ear · Right Ear
Left Shoulder · Right Shoulder · Left Elbow · Right Elbow
Left Wrist · Right Wrist · Left Hip · Right Hip
Left Knee · Right Knee · Left Ankle · Right Ankle
```

It knows exactly where each body part is in every frame, tracking them through the entire shot.

### Step 3 — Shot Classification (CrickEye CNN)
A custom trained neural network looks at the pose sequence during the swing and classifies which shot was played:

| Shot | Description |
|---|---|
| **Cover Drive** | Driving through the covers, off-side |
| **Flick** | Wrist-based leg-side flick shot |
| **Pull** | Horizontal bat pull against short-pitched ball |
| **Straight Drive** | Driving straight back down the ground |
| **Sweep** | Sweeping across the line on knee |

Each shot comes with a confidence score (0–100%). If confidence is below 28%, the shot is marked "unclear" and excluded from scoring.

### Step 4 — Biomechanics Scoring
For each detected shot, the Python engine calculates 5 independent scores (all 0–100):

| Score | What It Measures |
|---|---|
| **Head Quality** | Head stability and eye position through contact |
| **Stance Symmetry** | Shoulder and hip alignment before the ball arrives |
| **Footwork** | Front foot timing and line to the ball |
| **Swing Arc** | Smoothness and direction of the bat path |
| **Execution** | Was the right shot played for the ball's length? |

These 5 scores combine into the **Shot Score (out of 10)**.

### Step 5 — Ball Tracking (Optional)
If ball tracking is enabled (`best_ball.pt`), a second YOLO model follows the ball:
- Estimates delivery speed (km/h)
- Identifies where the ball pitched (length zone)
- Draws a Hawkeye-style trajectory arc

The ball's length zone also improves the **Execution Score** — it checks if your shot choice matched the ball.

### Step 6 — AI Coach Generation
After all shots in a session are processed, the system sends a summary to the **DGX llama3.1:8b** language model. The AI reads your session data and writes:

- A one-sentence **session summary**
- **Top strengths** (what you did well)
- **Focus areas** (what to improve)
- **Shot-wise notes** (specific tip per shot type)
- **Posture & setup cues** (body mechanics coaching)
- **Assigned practice drills** (exercises to do next session)

---

## 🤖 AI Models Used

| Model | File | Technology | Role |
|---|---|---|---|
| **YOLOv8n-pose** | `assets/yolov8n-pose.pt` | Ultralytics YOLO | Real-time body pose detection |
| **CrickEye Classifier** | `assets/crickeye_best.pth` | Custom PyTorch CNN (ResNet base) | Shot type classification |
| **YOLO Ball Tracker** | `assets/best_ball.pt` | Ultralytics YOLO | Ball detection and trajectory |
| **llama3.1:8b** | DGX Cloud API | Meta LLaMA 3.1 | Coaching text generation |

---

## 🔄 Data Flow (Technical)

```
Browser / Android App
       │  (HTTP upload or WebSocket)
       ▼
FastAPI Server (port 8000) — backend/main.py
       │  (runs in thread pool)
       ▼
analyse_session.py  ←── YOLOv8n-pose.pt + crickeye_best.pth
  + ball_analytics.py ←── best_ball.pt
       │
       ▼
data/session_report.json  (saved to disk)
       │
       ├──► WebSocket "complete" message → Browser renders dashboard
       │
       └──► POST /llm-insights
              │
              ▼
         Node Server (port 8080) — backend/server.js
              │
              ▼
         backend/services/llmInsights.js
              │  (summarizes metrics → builds prompt)
              ▼
         DGX API  (llama3.1:8b)
              │
              ▼
         llm_insights saved → WebSocket sync → AI Coach card renders
```

---

## ⚙️ Two Types of Coaching Output

### 1. Rule-Based Coaching Alerts (Always Available)
These fire automatically based on fixed thresholds in the Python code. They are **deterministic** — same session always produces same alerts.

Examples:
- If your elbow collapsed inward on 3 or more shots → "Elbow collapse" alert with player cue and drill
- If your front foot was still moving at contact on 2+ shots → "Late foot plant" alert
- If swing intensity dropped >25% in second half → "Fatigue" alert

### 2. AI Coach Text (DGX LLM)
This is **generated fresh** every time. The LLM receives a compact JSON summary of your session metrics and coaching alerts, and writes natural-language coaching in plain English.

If the DGX API is unavailable, the system **gracefully falls back** to a rule-based summary using the same coaching alerts.

---

## 📺 What Appears on Screen

After analysis completes, the dashboard shows:

| Section | Source |
|---|---|
| **Shot Timeline** | Per-delivery scores from Python pipeline |
| **Metric Cards** (avg head, speed, etc.) | Averaged from all confirmed shots |
| **Wagon Wheel** | Shot directions computed from keypoints |
| **Pitch Map** | Ball landing zones from ball tracker |
| **AI Coach Analytics** | LLM-generated coaching (or rule-based fallback) |
| **Deliveries Table** | All per-shot scores, flags, ball info |
| **Session Overview** | Collapsible card combining all of the above |
