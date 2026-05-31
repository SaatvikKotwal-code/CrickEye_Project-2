# CrickEye — Analysis pipeline & metrics

**Source of truth in code:**

| Module | Role |
|--------|------|
| `analyse_session.py` (repo root) | Pose pass, shot detection, biomechanics, session summary, JSON/CSV/video output |
| `ball_analytics.py` (repo root) | Optional YOLO ball track — length zones, pace, delivery rows merged into shots |
| `components/ReportModal.js` | Shared report + live **Session Score** (PlayCard) HTML |
| `components/PlayCard.js` | Live dashboard panel beside the video |

**This file’s location:** `docs/ANALYSIS.md`

For clone/setup and how to run locally, see `readme.md` at the repository root.

---

## Repository layout (live-feed dashboard branch)

Core folders in the submission repo (`CrickEye_Project`):

```
analyse_session.py, ball_analytics.py, pipeline_cache_version.py
App.js, index.html, style.css, config.example.js
assets/          # YOLO pose + shot classifier weights (see assets/REQUIRED_FILES.txt)
backend/         # FastAPI (main.py) + Node API (routes/, services/, sql/)
components/      # PlayCard, ReportModal, wagonWheel, PitchMap, ballAnalytics, lengthInsights
data/            # session_report.json and saved session payloads
docs/            # this file
tests/           # Python unit tests
types/           # shared TS types (if present)
uploads/         # runtime uploads (gitignored)
```

**Not in the lean repo:** `project_report/` (LaTeX), generated `*.pdf` / `*.pptx`, local `config.js`.

### Runtime stack

1. **FastAPI** — `uvicorn backend.main:app --port 8000` serves `index.html`, static `components/`, WebSocket analysis (`/ws`), upload/process endpoints.
2. **Node API** — `cd backend && npm start` (default port **8080**) for Supabase session CRUD, LLM insights route, coach dashboard APIs.
3. **Browser app** — `App.js` drives the player dashboard: live video, pitch map, wagon wheel, ball analytics cards, and the **Session Score** PlayCard.

### Player dashboard (live feed)

`index.html` layout (`#playerAnalysisOnly`):

| UI block | Scripts / data |
|----------|----------------|
| **Live feed** (video + timeline + HUD) | `App.js`, WebSocket stages from `run_pipeline_ws_sync()` |
| **Session Score** (right of video) | `PlayCard.js` → `ReportModal.buildLivePlayCardHtml()` after playback ends (~2.5s compile bar) |
| **Pitch map** | `PitchMap.js` + `ball_analytics.deliveries` length zones |
| **Wagon wheel** | `wagonWheel.js` + shot labels / zone counts from session JSON |
| **Ball analytics row** | `ballAnalytics.js`, `lengthInsights.js` |

PlayCard section buttons open `#playCardDetailModal` via `ReportModal.buildPlayCardSectionHtml()`:

| Button | Section key | Content |
|--------|-------------|---------|
| AI Insights | `ai` | LLM + rule-based coaching (`backend/routes/llmInsights.js` when configured) |
| Ball length analysis | `length` | `lengthInsights.js` tables from ball deliveries |
| Deliveries | `deliveries` | Per-shot table (head, stance, feet, swing arc, shot execution, ball info, flags) |
| Scoring zones | `zones` | **Scoring arc trends** only (shot-by-shot line graphs + optional 1st vs 2nd half momentum). Wagon-wheel coverage pills were removed from this modal. |

Full **Net Session Report** modal (coach/history) reuses the same `ReportModal` builders with a larger layout.

---

## Schema summary (quick reference)

### Per-shot

- **Shot:** `label`, `conf`, `probs`, `timestamp`, `peak_frame`, `start_frame`, `end_frame`, `onset_score`, `display_num`
- **Head:** `head_quality_score`, `head_lateral_ratio`, `head_vertical_ratio`, `head_frames_used`, `head_flag`, `head_confidence`, `head_quality_label`
- **Stance:** `symmetry_score`, `avg_shoulder_tilt`, `avg_hip_tilt`, `stance_flag`, `symmetry_label`
- **Swing path:** `swing_path_score`, `swing_path_note`, `swing_path_label` (wrist-path directness; in composite)
- **Swing / speed (diagnostic):** `swing_raw_p90`, `swing_intensity`, `swing_intensity_label`, `peak_swing_speed`, `speed_is_capped` — **not** in `/10` composite; optional **`BAT_SPEED_SESSION_LOCK`** on `flags` after session alignment
- **Elbows:** `elbow_collapse`, `elbow_delta`, `elbow_score`, `setup_elbow_ratio`, `contact_elbow_ratio`, `elbow_behind_pad`, `elbow_flag`
- **Footwork:** `feet_active`, `pre_shot_movement`, `plant_timing`, `footwork_score`, `footwork_flag`, `footwork_label`, optional `ball_line_score` after ball merge
- **Ball merge (when `ball_analytics` enabled):** `length_zone`, `execution_score`, `execution_label`, `execution_confidence`, `ball_track_matched`, `execution_length_note`, `ball_delivery_snapshot`
- **Overall:** `shot_score`, `shot_quality`, `shot_quality_label`, `flags`, `flags_plain`, `data_quality`, `data_quality_note`

### Session-level (`run_session_analysis`)

- `best_shot`, `worst_shot`, `coaching_alerts`, `shots_with_flags`
- `session_summary`: counts, averages, `feet_active_rate`, `fatigue_detected`, `trend` (includes `swing_path_score`, `execution_score` halves), `flags_summary`, `by_shot_type`
- Top-level JSON may include `ball_analytics` (`deliveries`, `frame_overlays`, `video_trajectories`)

### Shot score weights (composite /10)

Weights are **points out of 100** in `analyse_session.py` (`SCORE_W_*`), shown as **/10**:

| Component | Points | Share |
|-----------|--------|-------|
| Head | 28 | 28% |
| Footwork | 20 | 20% |
| Stance symmetry | 12 | 12% |
| Elbow shape | 12 | 12% |
| Shot execution (length × shot type) | 22 | 22% |
| Swing path quality | 6 | 6% |

**Not in composite:** swing intensity, peak bat speed (km/h). Execution defaults to **50/100** until `apply_ball_aware_shot_scoring()` runs; disable ball pass with `BALL_ANALYTICS_ENABLED=0`.

---

# Analysis pipeline & complete metrics

*(Full pipeline, every metric, coaching relevance in plain language, and how each is calculated — aligned with `analyse_session.py`.)*

## The complete pipeline (big picture)

1. **Video in** — Net clip read frame by frame (`extract_all_keypoints`).
2. **Pose pass** — YOLO pose (`assets/yolov8n-pose.pt`) → shoulders, hips, wrists, ankles, nose, etc.
3. **Camera scale** — Median shoulder width in the session → `pixel_scale` so thresholds work on zoomed-out nets.
4. **Wrist motion** — Left/right wrist speed in the **2D image**, blended to **bilateral** speed per frame.
5. **Find swings** — High-speed windows → shot onsets (padding → `start_frame` / `end_frame`).
6. **Shot type** — Classifier (`assets/crickeye_best.pth`) → `label`, `conf`, `probs`.
7. **Biomechanics per shot** — `extract_biomechanics()`: head, stance, elbows, footwork, **swing path**, preliminary `/10` (execution neutral at 50 until ball merge).
8. **Ball analytics (optional)** — `ball_analytics.run_ball_analytics()` tracks the ball (`assets/best_ball.pt`); `apply_ball_aware_shot_scoring()` sets **execution_score**, `length_zone`, and may adjust footwork vs line of ball.
9. **Session pass** — `run_session_analysis()`: session-normalised **swing intensity** (diagnostic), optional **`SESSION_BAT_SPEED_LOCK`** on outlier km/h, **`finalize_shot_player_copy()`** recomputes `/10` from stored sub-scores (no swing intensity in composite).
10. **Session summary** — Averages, 1st vs 2nd half **trend**, best/worst shot, **coaching alerts**, `flags_summary`, `by_shot_type`.
11. **Outputs** — `data/session_report.json`, annotated `assets/analysed_out.mp4`, CSV, WebSocket progress to the dashboard; Node may persist to Supabase.

---

## Per-shot metrics (what each delivery gets)

| Metric | Coaching relevance (real net) | How it’s calculated (simple words) |
|--------|------------------------------|-------------------------------------|
| **Shot label** (`label`) | Tells you *what* you were working on (drive vs pull vs sweep, etc.). | A small **neural net** watches the RGB frames of that swing and picks a class + **confidence** (`conf`). |
| **Classifier confidence** (`conf`) | Low confidence = “we’re not sure what shot this was” — take the rest of the numbers with caution. | The model’s **probability** for its top guess (0–1). |
| **Timestamp** (`timestamp`) | Lets you find the moment on the video or timeline. | Time from **frame number ÷ fps**. |
| **Peak / onset frame** | Where the swing was timed for cutting the clip and analysis. | Frame where **bilateral wrist speed** peaks in that swing window (`onset_score` = how strong/clear that onset was). |
| **Clip bounds** (`start_frame`, `end_frame`) | Defines which part of the video was analysed for that ball. | Fixed **before/after** padding around the onset. |
| **Class probabilities** (`probs`) | Coach/developer use: see if the model was torn between two shot types. | Full probability vector over all shot classes. |
| **Session handedness** (`_session_hand`, `stance_conf`) | RHB vs LHB drives which foot is “front” for footwork rules. | **Votes** from ankle/foot movement patterns before each shot, accumulated over the session; confidence is how strong the vote is. |

### Head / ball-watching

| Metric | Coaching relevance | Simple calculation |
|--------|---------------------|-------------------|
| **Head quality score** (0–100) | Core skill: **still head**, eyes with the ball, appropriate movement for the shot type. | Tracks **nose** (or ear midpoint) through a short window around contact. **Sideways** wobble and **up/down** wobble are measured vs **shoulder width** in the image, with **different rules per shot type** (e.g. pull allows more vertical). Turned into a 0–100 score; can flag lateral drift, vertical drift on drives, or “ducking” on pulls. |
| **Head lateral / vertical ratios** | Explains *why* the head score moved (coaching detail). | Basically **how much the head moved** sideways vs up/down, **normalised by shoulder width**. |
| **Head frames used** | Few frames = noisier read. | Count of frames where nose/ears were usable. |
| **Head confidence** (`measured` / `estimated` / `low`) | “Is this head number solid or a fallback?” | Based on how many nose points and how the score was derived. |
| **Head flag** | One-line issue: e.g. head sliding off line. | Rules on those ratios vs **thresholds per shot type**. |

### Stance / balance (setup)

| Metric | Coaching relevance | Simple calculation |
|--------|-------------------|-------------------|
| **Symmetry score** (0–100) | **Level shoulders and hips** before the swing — balance and repeatability. | Scans the clip for **quiet** frames (bat not moving fast). On those frames, measures how **tilted** the shoulder line and hip line are vs horizontal. Combines tilts into a score (more tilt → lower score). |
| **Avg shoulder / hip tilt** (degrees) | Detail for the coach — “how crooked” the setup was. | **Median** tilt angle from those stable frames. |
| **Stance flag** (`STANCE_ASYMMETRIC`) | Clear cue: setup keeps leaning one way. | Fires if tilt is **high enough** and there are **enough** stable readings. |

### Arms / “bat control” shape

| Metric | Coaching relevance | Simple calculation |
|--------|-------------------|-------------------|
| **Elbow collapse category** (`consistent` / `marginal` / `cramped` / `reaching` / `unknown`) | **Cramped** vs **reaching** is classic coaching: too tight to the body vs chasing the ball. | Compares **how far apart the elbows are** (in the image), **before** the swing vs **around contact**, as a ratio of **shoulder width**. **Shrink** too much → cramped; **grow** too much → reaching. |
| **Elbow delta** | Raw change number for debugging or deep review. | Normalised change between setup and contact elbow spread. |
| **Setup / contact elbow ratios** | Shows the geometry at two moments. | Median horizontal elbow spread ÷ shoulder width in each phase. |
| **Elbow flag** | Pulls out the worst cases (incl. pull-specific, flick-specific). | From the same elbow logic + **sweep** check below. |
| **Elbow behind pad** (sweep) | Sweep-specific: elbow drops **behind** the front leg — face can close early. | On sweeps only: compares **elbow vs knee** positions in the image at contact (front-on proxy). |

### Feet / footwork

| Metric | Coaching relevance | Simple calculation |
|--------|-------------------|-------------------|
| **Pre-shot movement** | **Trigger**: small foot activity before the ball — not standing like a statue. | Total **ankle movement** in the image over the **pre-delivery** window (pixels summed along the path). |
| **Plant timing** | **Front foot down on time** vs **late** — huge for drives and front-foot shots. | Tracks the **front ankle** (depends on RHB/LHB and shot type). Finds when the foot **plants** (vertical speed drops) vs **contact frame** (from peak wrist speed). Expressed in **frames** (negative often means foot down before contact = good). |
| **Footwork score** (0–100) | One number for “feet alive + well timed.” | **Two parts**: points for **how much** the feet moved (scaled by shoulder width), plus points for **plant timing** (with different rules for front-foot vs back-foot shots). |
| **Feet active** (true/false) | Quick badge: did the feet do *anything* useful before the swing? | True if normalised pre-shot movement passes a **threshold**. |
| **Footwork flag** (`FLAT_FOOTED`, `LATE_PLANT`) | Plain coaching hooks: quiet feet or foot landing too late. | **FLAT_FOOTED**: little movement and no good plant story. **LATE_PLANT**: plant clearly **after** the allowed window vs contact. |

### Swing path (in composite)

| Metric | Coaching relevance | Simple calculation |
|--------|-------------------|-------------------|
| **Swing path score** (0–100) | **Swing arc** in the UI — smooth, direct wrist path into contact. | `compute_swing_path_quality()`: wrist mid-path from backlift to contact; **directness** (net displacement ÷ path length), **smoothness** (low jitter), modest **downswing** check; normalised by shoulder width. **6%** of `/10`. |

### Swing effort and “bat speed” (diagnostic — not in /10)

| Metric | Coaching relevance | Simple calculation |
|--------|-------------------|-------------------|
| **Swing raw P90** (`swing_raw_p90`) | Internal: wrist motion spike size in **pixels**. | Smoothed bilateral speed in clip → ~90th percentile. |
| **Peak swing speed** (km/h) | **Trend only** — same camera setup; not a radar gun. | px/frame → km/h via shoulder ruler, fps, wrist→tip multiplier; may cap. |
| **Speed capped** | Exact km/h may be clipped. | Near sanity cap. |
| **Swing intensity** (0–100) | Session-relative effort; charts and alerts (`LOW_BAT_SPEED`, `FATIGUE`). | After all shots: max raw swing in session = 100; others scaled. **Does not** change `/10` after `recompute_composite_shot_score()`. |

### Ball-aware execution (in composite when ball track runs)

| Metric | Coaching relevance | Simple calculation |
|--------|-------------------|-------------------|
| **Length zone** | Yorker / full / good / short / etc. from ball YOLO. | `ball_analytics` delivery `length.label` matched to shot order by `peak_frame`. |
| **Execution score** (0–100) | **Shot execution** in UI — stroke vs length. | `_execution_pair_score(length_zone, shot_label)` with down-weighting if track uncertain (`bounce_uncertain`, low confidence). **22%** of `/10`. |
| **Ball line score** | Optional footwork blend when track + striker line known. | Compares foot drift direction vs ball position at peak frame. |

### Overall shot quality

| Metric | Coaching relevance | Simple calculation |
|--------|-------------------|-------------------|
| **Shot score** (/10) | Single **execution grade** for that ball. | **28 + 20 + 12 + 12 + 22 + 6** point mix (see table above). Pull + cramped elbow costs extra elbow points. Recomputed in `finalize_shot_player_copy()` after ball merge and session bat-speed lock. |
| **Shot quality** / **labels** | Good, Average, Poor, Top class, etc. | Bands on `/10` and per-metric 0–100 labels. |

### Flags and data quality

| Metric | Coaching relevance | Simple calculation |
|--------|-------------------|-------------------|
| **Flags** (list) | **Work-on tags** tied to reliable front-on cues (head, stance, elbow, feet). | Collects whichever of **head_flag**, **stance_flag**, **elbow_flag**, **footwork_flag** fired. |
| **Flags plain** | Same ideas in **everyday English** for UI. | Maps flag codes to short phrases (`PLAIN_ENGLISH` in code). |
| **Data quality** (`good` / `partial` / `limited`) | Honesty: “how much can we trust this shot’s pack of numbers?” | Counts how many of **head / symmetry / elbow / footwork** came back **solid** vs estimated or missing. |

**Note:** Older ideas like **weight transfer, base width, spine, knee flex** are **not** in the current scoring pipeline (they were called out as **unreliable from a front-on camera** in the file header). They are **not** part of the main metrics list above.

---

## Session-level outputs (whole net)

| Output | Coaching relevance | Simple idea |
|--------|-------------------|-------------|
| **Shots total vs confirmed** | Separates “we saw a swing” from “we’re **sure enough** to coach from it.” | Confirmed = classifier confidence above a **threshold**. |
| **Session handedness + stance confidence** | Sets context for the whole session (and footwork logic). | Aggregated from per-shot votes. |
| **Best / worst shot** | Highlights **signature** and **work-on** moments. | By **shot score** among confirmed shots. |
| **Averages** (head, stance, footwork, swing intensity, bat speed km/h, shot score) | **Session themes**: “today everything was a bit cramped” or “head stable but feet quiet.” | **Mean** over confirmed shots where the value exists. |
| **Feet active rate** | “Were you generally moving your feet before the ball?” | Fraction of confirmed shots with **feet_active**. |
| **Trend (1st vs 2nd half)** | **Fatigue, focus, or warmup** — numbers drifting through the net. | Split confirmed shots in half by order; average **swing intensity, head, stance, footwork, swing_path, execution** in each half (used in PlayCard “Scoring zones” trends). |
| **Fatigue detected** | Flag when **swing effort** drops a lot in the second half (same trend idea). | Second-half average swing intensity **< 75%** of first-half. |
| **Flags summary** | “How often did each problem show up?” — prioritise themes. | **Counts** each flag type across the session. |
| **By shot type** | “On drives vs pulls, what breaks?” | Per label: counts, mean confidence, means/std for **swing, head, stance, footwork, score**, plus **elbow** and **head** breakdowns. |
| **Coaching alerts** | Ready-made **coach messages**: severity, cue, drill — tied to **repeated** patterns. | Rules like “same head flag on **≥2** shots”, “**≥3** asymmetric stances”, “**≥3** flat-footed”, low **average** swing intensity, second-half drop, etc. |
| **Shots with flags** | Quick list for UI: which deliveries had issues. | Confirmed shots with **plain-language flag** lists. |

---

## One sentence to remember

**The pipeline turns your video into body points, finds each swing, names the shot type, optionally tracks the ball for length-aware execution, then scores head, feet, stance, elbows, swing path, and shot-vs-length execution into a /10 grade — with swing intensity and km/h kept as session diagnostics — and surfaces repeated issues as coaching alerts on the live dashboard and in saved reports.**

---

# Coaching relevance, flags & layman guide

*(Coaching importance, what each metric “measures,” simple calculation, and every flag — aligned with `analyse_session.py`.)*

**Importance scale:** **Very high** = fundamentals most coaches fix first · **High** = big levers for consistency · **Medium** = important but often follows the basics · **Supporting** = useful context, not always the first conversation.

---

## 1. Head quality (score 0–100 + labels)

**What it calculates (one line):**  
How **stable and appropriate** your **head** was while the ball was arriving — mainly **side-to-side** and **up/down** movement of the nose (or between the ears), judged **for that type of shot**.

**Coaching importance:** **Very high.** Still head and eyes with the ball are among the first things taught; head errors show up as edges, misses, and “playing too early.”

**How it’s calculated (layman):**  
The computer watches the **nose dot** (or ear midpoint) over a short window around the swing. It checks how much that dot **wanders left/right** and **up/down**, compared to **how wide your shoulders look** in the video (so zoom doesn’t fool it as badly). **Different shot types get different rules** (e.g. pull allows more vertical “tracking” than a straight drive). That becomes a **0–100 score**. Sometimes there aren’t enough nose frames — then the score is **estimated** and marked as such.

**Word labels on the score (not flags):** e.g. “Ball watched well” down to “Lost sight of the ball” — these are **bands** on the same head score.

### Flags tied to **head** (only one of these can fire per shot)

| Flag code | Plain English (what we tell the player) | What it really means (simple) |
|-----------|----------------------------------------|-------------------------------|
| **HEAD_LATERAL_DRIFT** | “Eyes off the ball” | Head **slid sideways** too much vs the threshold for that shot — classic **losing line / playing around the body**. |
| **HEAD_VERTICAL_DRIFT** | “Head moving too early” | On **drive-type** shots, head **bounced up or dipped** too much — often **looking up early** or **bobbing** through contact. |
| **HEAD_DUCKING_PULL** | “Head too low on the pull” | On **pulls**, the head **dropped** through the shot — coach language: **ducking into** the short ball, miscue risk. |

---

## 2. Batting stance / symmetry (score 0–100 + labels)

**What it calculates:**  
How **level and balanced** your **shoulders and hips** were in **quiet** moments before the bat really swings — i.e. **setup**, not the swing itself.

**Coaching importance:** **High.** A crooked or preset stance biases where you hit the ball and makes repeatability hard.

**How it’s calculated (layman):**  
It finds frames where the wrists aren’t moving fast (so you’re not mid-swing). On those frames it measures **how tilted** the line from **left shoulder to right shoulder** is vs flat, and the same for **hips**. More tilt → lower score. It uses **medians** so one bad frame doesn’t wreck the read.

**Word labels:** e.g. “Balanced stance” → “Off balance” — bands on the symmetry score.

### Flag tied to **stance**

| Flag | Plain English | What it means (simple) |
|------|---------------|-------------------------|
| **STANCE_ASYMMETRIC** | “Stance uneven” | Shoulders and/or hips were **clearly tilted** on enough stable frames — **one side low**, **open or closed shape** before you moved. |

---

## 3. Footwork (score 0–100 + labels)

**What it calculates:**  
(1) Did your **feet actually do something** before the ball? (2) On relevant shots, did your **front foot get down in time** relative to when the “hit” moment is detected?

**Coaching importance:** **Very high** for front-foot play; **high** overall for **trigger** and **balance**. Bad footwork is a root cause of late contact, lunging, and “all hands.”

**How it’s calculated (layman):**  
**Before** the swing: it adds up how much the **front ankle** (for that hand and shot type) **moved** in the picture — like tracing a path on paper. That’s scaled by **shoulder width** so distance from the camera doesn’t dominate. **Plant timing**: it watches the **front ankle** going down and when vertical movement **settles** (“foot down”) vs the frame where **hand speed peaks** (used as “contact”). Early plant = good; **late** plant = flag. Points are merged into one **0–100** footwork score.

**Word labels:** e.g. “Good foot timing” → “Almost no step.”

### Flags tied to **footwork**

| Flag | Plain English | What it means (simple) |
|------|---------------|-------------------------|
| **FLAT_FOOTED** | “Little movement with the feet” | **Not enough** pre-ball foot movement **and** no helpful plant story — feet look **dead** before the swing. |
| **LATE_PLANT** | “Front foot down late” | Front foot is judged to land **too many frames after** the ideal window vs “contact” — **hitting while still moving** on front-foot shots. |

*(If both conditions could apply, **late plant wins** in code — so you see **LATE_PLANT** rather than **FLAT_FOOTED** when late plant is detected.)*

**Related boolean (not always shown as a “flag”):** **feet_active** — true/false that feet moved “enough” before the ball (quick coaching badge).

---

## 4. Elbow / “bat control” (category + optional flag)

**What it calculates:**  
Whether your **arms stayed a similar width** from setup to contact, or **pulled in** (cramped) vs **stretched out** (reaching) — using **elbow spread in the image** vs **shoulder width**. Sweep gets an extra check: **elbow behind the pad**.

**Coaching importance:** **High** for **contact quality** and **direction**; **12%** of the `/10` composite (below head, footwork, and execution).

**How it’s calculated (layman):**  
It measures **how far apart your elbows are** in the video (horizontally), **before** the swing and **around** the hit, compared to **shoulder width**. **Shrinking** a lot → **cramped**; **growing** a lot → **reaching**; **roughly stable** → **consistent**; in between → **marginal**. On **pull**, cramped is flagged more harshly in scoring. On **sweep**, it checks if the **lead elbow** sits **behind** the **front knee** in the image (front-on cue for **bat rolling closed**).

### Flags tied to **elbows / bat path**

| Flag | Plain English | What it means (simple) |
|------|---------------|-------------------------|
| **ELBOW_COLLAPSE** | “Bat too tight to the body” | Elbows **pulled in** through contact — **no room**, jammed, **closed face** risk. |
| **ELBOW_COLLAPSE_PULL** | “Bat rolling across on the pull” | Same cramped idea but **flagged on a pull** — coach read: **rolling across the line** / not **extending** through the ball. |
| **ELBOW_REACHING** | “Reaching for the ball” | Elbows **spread wider** at contact than at setup — **chasing** the ball, **weak base** for control. |
| **ELBOW_REACHING_FLICK** | “Flick: trying too hard” | Reaching pattern on a **flick** — **timing shot** being **forced** with stiff/long arms. |
| **ELBOW_BEHIND_PAD** | “Sweep: bat turning in early” | On **sweep**, lead elbow **behind** the front leg in the image — **bat face closing early**, **miss-hit** pattern. |

**Note:** There is still an internal **elbow_collapse** text state: `consistent`, `marginal`, `cramped`, `reaching`, `unknown` — that’s the **metric**; the **flag** is the stronger “coach this now” signal when rules fire.

---

## 5. Swing intensity (0–100 + labels)

**What it calculates:**  
**How big the hand motion was on this swing compared to the hardest swing in the same session** — a **relative effort** score, not “true mph.”

**Coaching importance:** **Medium** for intent and fatigue; **not part of the /10 composite** in v7+. **Session fatigue** and **intent** show up in trends and alerts (`LOW_BAT_SPEED`, `FATIGUE`).

**How it’s calculated (layman):**  
From **wrist speed** in the clip (blended left/right), it takes a **smoothed** trace and a **high-but-stable** value (90th percentile style). After **all** shots in the net are done, the **biggest** of those becomes **100**; every other shot is scaled to that. So it answers: **“Did you swing this one as hard as your best one today?”**

**Word labels:** e.g. “Strong, committed swing” → “Very little swing.”

### Flags (not usually stored **on the shot** the same way)

**LOW_BAT_SPEED** and **FATIGUE** appear in **session coaching alerts** (from averages and second-half drop), with plain English like **“Soft swing — add intent”** and **“Swing dropping off late.”** They describe **session patterns**, not one delivery’s biomech flag list.

---

## 6. Peak swing speed (km/h) + capped warning

**What it calculates:**  
An **estimated bat-speed-style number** from the **same wrist motion** used for swing intensity, converted using **shoulder width**, **fps**, and a **fixed wrist→tip multiplier**, then **capped** at a max.

**Coaching importance:** **Supporting / motivational** if explained honestly: good for **trends** in the same camera setup; **not** a radar gun. Use for **“more intent”** or **“session drift”**, not absolute pro benchmarks.

**How it’s calculated (layman):**  
“How fast did the wrists move in the picture?” → turn pixels-per-frame into **metres per second** using “shoulders ≈ 45 cm wide in real life” as a ruler → convert to **km/h** → multiply by a fudge factor for **bat tip** → if above max, **cap** and set **speed_is_capped**. After the whole session’s **swing intensity** is known, an optional pass (**`SESSION_BAT_SPEED_LOCK`**, default on) can **lower** a lone peak that is wildly higher than the session median and than swing intensity suggests; that delivery gets **`BAT_SPEED_SESSION_LOCK`** on **`flags`** / **`flags_plain`** (and **`BAT_SPEED_SESSION_LOCK_count`** in **`session_summary.flags_summary`**).

**No separate flag** on the shot for “slow speed”; **low swing** is surfaced via **session alerts** (swing intensity), not a `HEAD_*`-style code on each ball.

---

## 7. Overall shot score (/10) + quality words

**What it calculates:**  
One **overall grade** from **head 28% + footwork 20% + stance 12% + elbows 12% + execution (length×shot) 22% + swing path 6%**, recomputed in `finalize_shot_player_copy()` after ball merge.

**Coaching importance:** **High** for **ranking balls** and **progress**; **medium** for **technical diagnosis** (read sub-metrics and flags to know *what* to coach).

**How it’s calculated (layman):**  
Each area contributes points out of 100 internally; total ÷ 10 → **/10**. Words like **Good**, **Average**, **Poor**, **Top class** are **bands** on that total.

---

## 7b. Swing path quality (0–100) — in composite

**What it calculates:**  
Whether the **wrist path** from backlift toward contact is **direct and smooth** (front-on proxy; no bat-segment model).

**Coaching importance:** **Medium–high** for repeatable shape; **6%** of `/10`.

**How it’s calculated (layman):**  
Track wrist midpoint through the downswing; reward a path that goes **mostly straight** to contact with **steady** motion and a sensible **downward** finish. Shown as **Swing arc** in the deliveries table and PlayCard donut.

---

## 7c. Shot execution vs length (0–100) — in composite when ball analytics on

**What it calculates:**  
Whether the **named shot type** was a sensible choice for the **detected length** (e.g. drive on a full ball).

**Coaching importance:** **High** when ball track is reliable; neutral **50** when ball analytics is off or unmatched.

**How it’s calculated (layman):**  
Lookup table `_execution_pair_score(length_zone, shot_label)`; blended toward 50 when bounce/track confidence is low. **22%** of `/10`. Dashboard label: **Shot execution**.

**No flag** specific to “shot score” — flags still come from **head / stance / elbow / footwork** as above.

---

## 8. Flags in `PLAIN_ENGLISH` that are **not** raised on each shot today

These strings exist so **old data or future code** can still show friendly text:

| Code | Plain English | Note |
|------|---------------|------|
| **NARROW_BASE** | Feet a bit narrow | Not attached by current `extract_biomechanics` flags list. |
| **WIDE_BASE** | Feet a bit wide | Same. |
| **LOW_WEIGHT_TRANSFER** | Mostly arms, less body | Same (Z-axis / depth unreliable front-on per pipeline notes). |
| **OVER_COMMITTED** | Lunging at the ball | Same. |
| **SPINE_COLLAPSE** | Too low in the body | Same. |
| **STIFF_LEGGED** | Legs very straight | Same. |

For **live CrickEye v7-style** output, treat the **active** per-shot flags as: **three head**, **one stance**, **five elbow variants** (two collapse, two reach, one sweep pad), **two footwork**, plus **BAT_SPEED_SESSION_LOCK** when the session bat-speed alignment step ran on that row.

---

## Quick “which flag goes with which metric?”

- **Head quality** → `HEAD_LATERAL_DRIFT`, `HEAD_VERTICAL_DRIFT`, `HEAD_DUCKING_PULL`  
- **Stance / symmetry** → `STANCE_ASYMMETRIC`  
- **Footwork** → `FLAT_FOOTED`, `LATE_PLANT`  
- **Elbows / bat control** → `ELBOW_COLLAPSE`, `ELBOW_COLLAPSE_PULL`, `ELBOW_REACHING`, `ELBOW_REACHING_FLICK`, `ELBOW_BEHIND_PAD`  
- **Swing / session** → **alerts**: `LOW_BAT_SPEED`, `FATIGUE` (session-level coaching, not the same as the per-shot `flags` array); **post-pass** on a delivery → **`BAT_SPEED_SESSION_LOCK`** (bat peak aligned to session + swing intensity — informational, not a coaching drill flag)
