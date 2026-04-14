# CrickEye Dashboard

CrickEye is a cricket batting analytics system that combines:
- YOLOv8 pose estimation
- Swin3D shot classification
- real-time WebSocket feedback
- coaching-first frontend visualizations

This repo includes the dashboard frontend, FastAPI runtime, and Node API helpers.

**Full analysis reference (pipeline, every metric, coaching relevance, flags):** **`docs/ANALYSIS.md`** — same content as previously inlined here, kept in one place for sharing and updates.

**This file’s location:** repository root — `readme.md` (same folder as `analyse_session.py`, `App.js`, and `backend/`).

---

## What changed (current pipeline — `analyse_session.py` v7-style)

- **Shot score** composite (100 internal points → /10): **head 35%**, **footwork 25%**, **stance symmetry 15%**, **elbow shape 15%**, **swing intensity 10%**. Bat speed (km/h) is **not** a direct ingredient of the composite; **swing intensity** (session-normalized) is.
- **Footwork** is active: `footwork_score`, `feet_active`, `pre_shot_movement`, `plant_timing`, `footwork_flag` (`FLAT_FOOTED`, `LATE_PLANT`).
- **Swing intensity** (0–100) is computed **after** all shots using session-relative scaling of raw wrist-motion (`swing_raw_p90`); `finalize_shot_player_copy` refreshes `shot_score` / `shot_quality`.
- **Removed from scoring** (unreliable front-on): weight transfer, base width, spine, knee flex — may still appear only in legacy data or dev text, not in current per-shot `flags`.
- **Session summary** includes `avg_footwork_score`, `avg_swing_intensity`, trend halves for footwork and swing intensity, `feet_active_rate`, `flags_summary` counts for **FLAT_FOOTED** and **LATE_PLANT**, and `fatigue_detected` from second-half **swing intensity** drop.
- **Player-facing UI** uses cricket labels (e.g. Head position, Batting stance, Foot movement, Swing intensity) while JSON keys remain `head_quality_score`, `symmetry_score`, etc.

### Bat speed calibration (estimate, not radar)

- `BAT_TIP_MULTIPLIER`, `SPEED_SANITY_CAP_KMH`, `SHOULDER_WIDTH_M`, `SHOULDER_FALLBACK_PX` — see `analyse_session.py` CONFIG. `peak_swing_speed` is a **pose-derived estimate**; use for **trends** in a fixed setup, not absolute pro benchmarks.

### Player-facing UI

- Confidence percentages stay hidden from player-facing shot cards/report where intended.
- Report modal: per-delivery cues and flags in **All Deliveries**; core metrics align with the five scores + execution + bat speed.

### Wagon wheel

- `drawSpoke(shotType, shotScore, headQualityScore, batSpeed, onDone)` — head argument is **`head_quality_score`** (0–100) for spoke opacity; tooltip shows head score, shot score, and speed.

### Coach dashboard + role-based auth

- Signup/login modes and `profiles` role routing (`player` vs `coach`) as before; coach aggregates use `sessions.results.analysis.session_summary`.

---

## Captured metrics (schema summary)

### Per-shot (WebSocket `shot`, `replay.shots`, exports)

- **Shot detection / class:** `label`, `conf`, `probs`, `timestamp`, `peak_frame`, `start_frame`, `end_frame`, `onset_score`
- **Head:** `head_quality_score`, `head_lateral_ratio`, `head_vertical_ratio`, `head_frames_used`, `head_flag`, `head_confidence`, `head_quality_label`
- **Stance:** `symmetry_score`, `avg_shoulder_tilt`, `avg_hip_tilt`, `stance_flag`, `symmetry_label`
- **Swing / speed:** `swing_raw_p90`, `swing_intensity`, `swing_intensity_label`, `peak_swing_speed`, `speed_is_capped`
- **Elbows:** `elbow_collapse`, `elbow_delta`, `setup_elbow_ratio`, `contact_elbow_ratio`, `elbow_behind_pad`, `elbow_flag`
- **Footwork:** `feet_active`, `pre_shot_movement`, `plant_timing`, `footwork_score`, `footwork_flag`, `footwork_label`
- **Overall:** `shot_score`, `shot_quality`, `shot_quality_label`, `flags`, `flags_plain`, `data_quality`, `data_quality_note`

### Session-level (`run_session_analysis`)

- `best_shot`, `worst_shot`, `coaching_alerts`, `shots_with_flags`
- `session_summary`: counts, averages (head, symmetry, footwork, swing intensity, bat speed, shot score), `feet_active_rate`, `fatigue_detected`, `trend`, `flags_summary`, `by_shot_type`

### Legacy sessions

- Older rows may omit footwork/swing fields or use old weights; **re-run analysis** to refresh `results`.

---

## Analysis documentation (full narrative)

The **complete pipeline walkthrough**, **per-metric tables**, **session outputs**, **coaching importance**, and **flag reference** are maintained in:

**`docs/ANALYSIS.md`**

Use that file when sharing or printing the analysis spec; update it when `analyse_session.py` behaviour changes.

---

## Run after clone (seamless setup)

### 1) Prerequisites
- Python 3.10+
- Node.js 18+
- pip
- npm

### 2) Install dependencies

**Python**
```bash
pip install -r requirements.txt
```

**Node**
```bash
cd backend
npm install
cd ..
```

### 3) Add required assets
Place these files in `assets/`:
- `yolov8n-pose.pt`
- `crickeye_best.pth`
- test video(s)

### 4) Environment variables
Create `backend/.env` (copy from `backend/.env.example`) and set:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SERVICE_KEY` as legacy alias)
- `PORT=8080`

### 5) Start services

**FastAPI (required)** — from repo root:
```bash
py -m uvicorn backend.main:app --reload --port 8000
```

**Node API (recommended)** — second terminal:
```bash
cd backend
npm start
```

### 6) Open app
- Use `http://localhost:8000`
- WebSocket endpoint: `ws://localhost:8000/ws`

### 7) Quick health checks
- `http://localhost:8080/health` returns `{ ok: true }` (if Node is running)
- Upload starts pipeline and streams stage/progress updates
- Session saves include `results.analysis.session_summary`

### 8) Coach account setup (single coach)
After running `backend/supabase_schema.sql`, create/login your coach user once, then mark that user as coach:

```sql
update public.profiles
set role = 'coach'
where email = 'coach@example.com';
```

This enables coach-global read access (all player profiles and sessions) through RLS.

### 9) Policy hotfix (important)
If coach dashboard shows this error:
`infinite recursion detected in policy for relation "profiles"`

Run the policy helper fix from `backend/supabase_schema.sql` (function `public.is_coach(uuid)` and updated SELECT policies).

### 10) Legacy data backfill (if coach sees no players)
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

## Repository notes
- Frontend: `App.js`, `components/ReportModal.js`, `components/wagonWheel.js`, `style.css`
- Backend pipeline: `analyse_session.py`
- Analysis reference: `docs/ANALYSIS.md`
- FastAPI app: `backend/main.py`
- Node server: `backend/server.js`
- Project guidance: `cursorrules`
