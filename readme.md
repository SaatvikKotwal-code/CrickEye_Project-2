# CrickEye Dashboard

CrickEye is a cricket batting analytics system that combines:
- YOLOv8 pose estimation
- Swin3D shot classification
- real-time WebSocket feedback
- coaching-first frontend visualizations

This repo includes the dashboard frontend, FastAPI runtime, and Node API helpers.

## What Changed (Current Feature Set)

### Metrics and scoring overhaul
- Bat speed calibration updated:
  - `BAT_TIP_MULTIPLIER = 1.35`
  - `SPEED_SANITY_CAP_KMH = 140.0`
  - `SHOULDER_FALLBACK_PX = 60.0`
- Shot score formula updated to avoid hidden double counting:
  - `shot_score = (0.55 * speed_norm + 0.45 * stability_norm) * 10`
- Output schema now exposes a coaching summary block:
  - `analysis.session_summary`
  - includes `shots_confirmed`, `shots_total_detected`, averages, fatigue, trend, and flags summary

### Player-facing UI redesign
- Confidence percentages are hidden from player-facing shot cards/report cards.
- Coaching priority order in UI:
  1. Head control (`head_stability`)
  2. Body balance (`stability_score`)
  3. Shot score
  4. Flags
  5. Trend/fatigue
  6. Bat-speed trend (secondary)
- Report modal updated:
  - coaching focus block
  - trends ordered by reliability
  - all-shots coaching table (head, balance, speed, flags)
  - usage transparency (`X of Y shots used`)

### Wagon wheel enhancements
- `drawSpoke` signature now supports metric metadata:
  - `drawSpoke(shotType, shotScore, headStability, batSpeed, onDone)`
- Spoke thickness encodes shot score.
- Spoke opacity encodes head stability.
- Hover tooltip shows type, score, head control, and speed.

### Coach dashboard + role-based auth
- Signup and login are now mode-based:
  - Login mode uses `email + password` only.
  - Signup mode captures `full_name + age + gender + email + password`.
- Added `profiles` table support for role-aware routing:
  - `role='player'` -> player dashboard
  - `role='coach'` -> coach dashboard (global player/session tracking)
- Coach dashboard aggregates player performance from `sessions.results.analysis.session_summary`.

## Captured Metrics (Current System)

## Per-shot metrics
- `label` (shot class)
- `conf` (classifier confidence; kept internally, not player-facing)
- `probs` (class probabilities)
- `timestamp`, `peak_frame`
- `peak_swing_speed` (km/h)
- `footwork`, `footwork_conf`
- `head_stability` (0-100)
- `stability_score` (0-100)
- `shot_score` (0-10)
- `shot_quality` (Excellent/Good/Average/Poor)
- `flags` (`HEAD_MOVING`, `UNSTABLE`, `FOOTWORK_UNCLEAR`)

## Session-level metrics
- `best_shot`, `worst_shot`
- `footwork_summary`
- `coaching_alerts`
- `session_summary`:
  - `shots_confirmed`
  - `shots_total_detected`
  - `avg_bat_speed_kmh`
  - `avg_head_stability`
  - `avg_stability_score`
  - `avg_shot_score`
  - `fatigue_detected`
  - `trend` (first-half vs second-half for speed/head/balance)
  - `flags_summary` (flag counts)
  - `by_shot_type` (per-shot-type aggregates)

## Run After Clone (Seamless Setup)

## 1) Prerequisites
- Python 3.10+
- Node.js 18+
- pip
- npm

## 2) Install dependencies

### Python
```bash
pip install -r requirements.txt
```

### Node
```bash
cd backend
npm install
cd ..
```

## 3) Add required assets
Place these files in `assets/`:
- `yolov8n-pose.pt`
- `crickeye_best.pth`
- test video(s)

## 4) Environment variables
Create `backend/.env` (copy from `backend/.env.example`) and set:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SERVICE_KEY` as legacy alias)
- `PORT=8080`

## 5) Start services

### FastAPI (required)
From repo root:
```bash
py -m uvicorn backend.main:app --reload --port 8000
```

### Node API (recommended)
In a second terminal:
```bash
cd backend
npm start
```

## 6) Open app
- Use `http://localhost:8000`
- WebSocket endpoint: `ws://localhost:8000/ws`

## 7) Quick health checks
- `http://localhost:8080/health` returns `{ ok: true }` (if Node is running)
- Upload starts pipeline and streams stage/progress updates
- Session saves include `results.analysis.session_summary`

## 8) Coach account setup (single coach)
After running `backend/supabase_schema.sql`, create/login your coach user once, then mark that user as coach:

```sql
update public.profiles
set role = 'coach'
where email = 'coach@example.com';
```

This enables coach-global read access (all player profiles and sessions) through RLS.

## 9) Policy hotfix (important)
If coach dashboard shows this error:
`infinite recursion detected in policy for relation "profiles"`

Run the policy helper fix from `backend/supabase_schema.sql` (function `public.is_coach(uuid)` and updated SELECT policies).

## 10) Legacy data backfill (if coach sees no players)
If older users have sessions but no profile rows, backfill player profiles:

```sql
insert into public.profiles (id, email, full_name, age, gender, role)
select
  u.id,
  u.email,
  coalesce(nullif(split_part(u.email, '@', 1), ''), 'Player'),
  null,
  'prefer_not_to_say',
  'player'
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;
```

## Repository Notes
- Frontend: `App.js`, `components/ReportModal.js`, `components/wagonWheel.js`, `style.css`
- Backend pipeline: `analyse_session.py`
- FastAPI app: `backend/main.py`
- Node server: `backend/server.js`
- Project guidance: `cursorrules`

