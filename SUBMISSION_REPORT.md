# Final Submission Report

- **Live Demo Link:** [https://suggestion-apartment-plane-yet.trycloudflare.com](https://suggestion-apartment-plane-yet.trycloudflare.com)

This file summarizes what is committed for final project submission and what must be explicitly present for successful execution after cloning.

## Uploaded in Repository

- Source code:
  - `analyse_session.py`
  - `ball_analytics.py`
  - `backend/`
  - `components/`
  - `android/` (Native Android wrapper app with Java bridge, styles, and assets)
  - `build_apk.bat` (Automated asset sync and Gradle builder)
  - `types/`
  - `tests/`
- Frontend entry files:
  - `index.html`
  - `App.js`
  - `style.css`
- Documentation:
  - `readme.md`
  - `docs/ANALYSIS.md`
  - `assets/REQUIRED_FILES.txt`
- Project report source:
  - `project_report/` (LaTeX source and figures used by the report)
- Dependency files:
  - `requirements.txt`
  - `backend/package.json`

## Required Runtime Model Files (must exist in `assets/`)

- `yolov8n-pose.pt`
- `crickeye_best.pth`
- `best_ball.pt` (required unless ball analytics is disabled)

## Mandatory Configuration by Teacher/Reviewer

Create `backend/.env` from `backend/.env.example` and provide:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional LLM settings can remain disabled for standard project execution.

## Excluded from Final Submission

- Local secret/config files (`backend/.env`, `config.js`)

## Notes on Large Files

- Model files can be large and may require Git LFS (especially `crickeye_best.pth` if it exceeds GitHub's normal file-size limit).
- If push rejects large model files, track these with Git LFS before pushing.
