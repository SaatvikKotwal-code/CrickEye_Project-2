# CrickEye Project (Final Submission)

[![Live Demo](https://img.shields.io/badge/Live_Demo-Cloudflare_Tunnel-orange?style=for-the-badge&logo=cloudflare)](https://suggestion-apartment-plane-yet.trycloudflare.com)

> 🚀 **Live Demo URL:** [https://suggestion-apartment-plane-yet.trycloudflare.com](https://suggestion-apartment-plane-yet.trycloudflare.com)

CrickEye is a cricket batting analytics platform that combines:
- **Live Web Cam capture** with 3-2-1 audio/visual countdown & timed delivery auto-recording
- **Pose-based biomechanics analysis** (17 body keypoints)
- **Shot classification and scoring** (deep neural net classifier)
- **Ball analytics overlays** (Hawkeye trajectory, pitch bounce detection, speed estimation)
- **Interactive web dashboard** for players and coaches
- **Supabase-backed session storage** and role-based access control

## Capture Modes

- 📹 **Live Web Cam**:
  - Direct browser camera access (built-in webcam, external 60/120 FPS USB net camera, or mobile phone).
  - Stance Alignment Guide overlay (Head zone, center axis, batsman crease line).
  - **Timed Delivery Record**: 3-2-1 audio beeps & visual countdown, records 5 seconds (1 ball), auto-stops, and immediately starts AI analysis.
  - **Manual Record**: Start / Stop recording on demand.
- 📁 **Video File Upload**:
  - Drag and drop or browse any MP4, AVI, MOV, or WebM delivery clip.
- 📱 **Android Mobile App (`CrickEye-Pro.apk`)**:
  - Native Android app container for cricket net practice.
  - Features: screen wake-lock (display stays awake during practice), 3-2-1 countdown tactile haptic vibration, camera front/rear picker, and physical back-button modal navigation.
  - Download directly from `/download/apk` or the header button, or compile via `build_apk.bat`.

## Repository Structure

- `analyse_session.py` - Main analysis pipeline
- `ball_analytics.py` - Ball tracking and delivery analytics
- `backend/` - FastAPI app + Node API routes/services
- `components/` - Frontend JS modules
- `assets/` - Required model files and generated analysis videos
- `data/` - Session report JSON outputs
- `docs/` - Technical notes (`docs/ANALYSIS.md`, `docs/MOBILE_OPTIMIZATION_AND_DEPLOYMENT_GUIDE.md`, `docs/PRODUCTION_DEPLOYMENT_GUIDE_AND_CHECKLIST.md`, `docs/MOBILE_AND_NEXTJS_ARCHITECTURE.md`)
- `tests/` - Unit/integration tests
- `project_report/` - LaTeX project report sources

## Prerequisites

- Python 3.10+
- Node.js 18+
- pip
- npm

## Setup After Clone

### 1) Install Python dependencies

```bash
pip install -r requirements.txt
```

### 2) Install Node dependencies

```bash
cd backend
npm install
cd ..
```

### 3) Configure backend environment

Copy `backend/.env.example` to `backend/.env` and set:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PORT=8080` (or custom)

### 4) Place required model files in `assets/`

Required files:
- `assets/yolov8n-pose.pt`
- `assets/crickeye_best.pth`
- `assets/best_ball.pt` (needed for ball analytics; optional only if `BALL_ANALYTICS_ENABLED=0`)

The file `assets/REQUIRED_FILES.txt` also documents this requirement.

## Run the Project

### Terminal 1 - FastAPI app

```bash
py -m uvicorn backend.main:app --reload --port 8000
```

### Terminal 2 - Node API

```bash
cd backend
npm start
```

Open:
- App: `http://localhost:8000`
- WebSocket endpoint: `ws://localhost:8000/ws`
- Node health: `http://localhost:8080/health`

## Tests

Run Python tests:

```bash
py -3 -m unittest discover -s tests -p "test_*.py" -v
```

Optional ball integration test:

```bash
set BALL_INTEGRATION_TEST=1
py -3 -m unittest tests.test_ball_analytics.TestIntegrationBallPipeline -v
```

## What Is Included for Final Submission

- Full runnable source code (frontend + backend + analysis pipeline)
- Model-weight support via `assets/` (you must ensure required weights are present before push)
- Documentation for setup and analysis behavior


## Notes for Evaluators

- If model files are missing, the pipeline will raise a file-not-found error with the expected absolute path.
- For coach dashboard features, run SQL schema/policies from `backend/supabase_schema.sql`.
- Legacy sessions may need re-analysis to populate the latest metrics schema.
