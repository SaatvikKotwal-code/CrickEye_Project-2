# CrickEye Project (Final Submission)

CrickEye is a cricket batting analytics platform that combines:
- Pose-based biomechanics analysis
- Shot classification and scoring
- Ball analytics overlays
- Web dashboard for players/coaches
- Supabase-backed session storage and role-based access

This repository is prepared for final major-project submission so a reviewer can clone and run it locally.

## Repository Structure

- `analyse_session.py` - Main analysis pipeline
- `ball_analytics.py` - Ball tracking and delivery analytics
- `backend/` - FastAPI app + Node API routes/services
- `components/` - Frontend JS modules
- `assets/` - Required model files and generated analysis videos
- `data/` - Session report JSON outputs
- `docs/` - Technical notes (`docs/ANALYSIS.md`)
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
- Project report LaTeX source in `project_report/`
- Documentation for setup and analysis behavior

## What Is Intentionally Excluded

- PPT/PDF deliverables and helper scripts used only for presentation generation
- Runtime-generated output videos and temporary upload files
- Local environment secrets (`.env`, `config.js`)
- LaTeX build artifacts (`.aux`, `.bbl`, `.log`, etc.)

## Notes for Evaluators

- If model files are missing, the pipeline will raise a file-not-found error with the expected absolute path.
- For coach dashboard features, run SQL schema/policies from `backend/supabase_schema.sql`.
- Legacy sessions may need re-analysis to populate the latest metrics schema.
