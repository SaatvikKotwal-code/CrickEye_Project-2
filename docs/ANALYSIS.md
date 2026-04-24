# CrickEye — Analysis pipeline & metrics

**Source of truth in code:** `analyse_session.py` (repo root).

**This file’s location:** `docs/ANALYSIS.md`

For project setup and repo overview, see `readme.md` at the repository root.

---

## Schema summary (quick reference)

### Per-shot

- **Shot:** `label`, `conf`, `probs`, `timestamp`, `peak_frame`, `start_frame`, `end_frame`, `onset_score`
- **Head:** `head_quality_score`, `head_lateral_ratio`, `head_vertical_ratio`, `head_frames_used`, `head_flag`, `head_confidence`, `head_quality_label`
- **Stance:** `symmetry_score`, `avg_shoulder_tilt`, `avg_hip_tilt`, `stance_flag`, `symmetry_label`
- **Swing / speed:** `swing_raw_p90`, `swing_intensity`, `swing_intensity_label`, `peak_swing_speed`, `speed_is_capped` (optional **`BAT_SPEED_SESSION_LOCK`** on `flags` if peak was capped to match the session)
- **Elbows:** `elbow_collapse`, `elbow_delta`, `setup_elbow_ratio`, `contact_elbow_ratio`, `elbow_behind_pad`, `elbow_flag`
- **Footwork:** `feet_active`, `pre_shot_movement`, `plant_timing`, `footwork_score`, `footwork_flag`, `footwork_label`
- **Overall:** `shot_score`, `shot_quality`, `shot_quality_label`, `flags`, `flags_plain`, `data_quality`, `data_quality_note`

### Session-level (`run_session_analysis`)

- `best_shot`, `worst_shot`, `coaching_alerts`, `shots_with_flags`
- `session_summary`: counts, averages, `feet_active_rate`, `fatigue_detected`, `trend`, `flags_summary`, `by_shot_type`

### Shot score weights (composite /10)

**Head 35%**, **footwork 25%**, **stance symmetry 15%**, **elbow 15%**, **swing intensity 10%**. Bat speed (km/h) is **not** in the composite; swing intensity is session-normalized.

---

# Analysis pipeline & complete metrics

*(Full pipeline, every metric, coaching relevance in plain language, and how each is calculated — aligned with `analyse_session.py`.)*

## The complete pipeline (big picture)

1. **Video in** — Your net clip is read frame by frame.
2. **Pose pass** — A pose model finds body “dots” each frame (shoulders, hips, wrists, ankles, nose, etc.).
3. **Wrist motion** — From those dots, the computer measures how fast the **left and right wrists** move in the **2D video image** (sideways and up/down only), then blends them into one **“bilateral”** speed per frame.
4. **Find swings** — It looks for stretches where that speed stays high long enough to count as a real swing (not a random twitch).
5. **Split into shots** — Each swing becomes its own short **clip** of frames around the moment the hands really go.
6. **Shot type** — A separate **video classifier** looks at those frames and guesses the stroke (cover, pull, flick, etc.) and how sure it is (**confidence**).
7. **Biomechanics per shot** — For each shot it measures head, stance, elbows, feet, swing effort, and builds a **0–10 shot score** plus **flags** (things to fix).
8. **Session pass** — After all shots, it **rescales swing effort** so “how hard you swung” is compared **within that session only**, then (unless disabled via env) **optionally aligns** any lone **peak bat speed** outlier to that session + swing intensity, then **recalculates** the final 0–10 using the final swing intensity.
9. **Session summary** — Averages, trends (first half vs second half), best/worst shot, **coaching alerts**, and counts of each flag type (including **BAT_SPEED_SESSION_LOCK** when that step adjusted a delivery).
10. **Outputs** — JSON report, optional annotated video, CSV, and (in the app) WebSocket updates.

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

### Swing effort and “bat speed”

| Metric | Coaching relevance | Simple calculation |
|--------|-------------------|-------------------|
| **Swing raw P90** (`swing_raw_p90`) | Internal: how “big” the wrist motion spike was in **pixels**, before rescaling. | In the swing clip, take **bilateral wrist speed** each frame, smooth with a **short rolling average**, then take about the **90th percentile** of that smooth signal (ignores one-frame glitches). |
| **Peak swing speed** (km/h) | **Trend and motivation** — not a radar gun, but “are we generating more hand speed in this setup?” | That same motion size is turned into **km/h** using **shoulder width in the image** as a ruler, **fps**, and a fixed **wrist→bat-tip multiplier**, with a **max cap**. |
| **Speed capped** | Tells you the number hit the **ceiling** (so don’t over-read the exact km/h). | True if result is near the **sanity cap**. |
| **Swing intensity** (0–100) | **Fair comparison within this net**: who swung harder *relative to their own session*. | After **all** shots are done, the **biggest** raw swing in the session = 100; every other shot is scaled to that. **This** feeds the **final** shot score for the swing slice (after `finalize_shot_player_copy`). |
| **Swing intensity (preliminary)** | Used only **before** the session-wide rescale; superseded for the final score. | Temporary scale using a **fixed** guess of what a “big” raw motion is (~50 px/frame). |

### Overall shot quality

| Metric | Coaching relevance | Simple calculation |
|--------|-------------------|-------------------|
| **Shot score** (/10) | Single **execution grade** for that ball — good for ranking deliveries in a session. | Weighted mix (out of 100 internal points, shown as /10): **head 35%**, **footwork 25%**, **stance symmetry 15%**, **elbow shape 15%**, **swing intensity 10%**. **Special case**: cramped elbow on a **pull** costs extra elbow points. After all shots, **swing intensity is recomputed** session-normalised and the **/10 is updated**. |
| **Shot quality** / **labels** | Words players understand: Good, Average, Poor, etc. | **Bands** on the /10 score and on each 0–100 sub-score (separate label scales in code). |

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
| **Trend (1st vs 2nd half)** | **Fatigue, focus, or warmup** — numbers drifting through the net. | Split confirmed shots in half by order; average **swing intensity, head, stance, footwork** in each half. |
| **Fatigue detected** | Flag when **swing effort** drops a lot in the second half (same trend idea). | Second-half average swing intensity **< 75%** of first-half. |
| **Flags summary** | “How often did each problem show up?” — prioritise themes. | **Counts** each flag type across the session. |
| **By shot type** | “On drives vs pulls, what breaks?” | Per label: counts, mean confidence, means/std for **swing, head, stance, footwork, score**, plus **elbow** and **head** breakdowns. |
| **Coaching alerts** | Ready-made **coach messages**: severity, cue, drill — tied to **repeated** patterns. | Rules like “same head flag on **≥2** shots”, “**≥3** asymmetric stances”, “**≥3** flat-footed”, low **average** swing intensity, second-half drop, etc. |
| **Shots with flags** | Quick list for UI: which deliveries had issues. | Confirmed shots with **plain-language flag** lists. |

---

## One sentence to remember

**The pipeline turns your video into body points, finds each swing, names the shot type, then scores how still the head was, how level the setup was, how the arms and feet behaved, and how hard you swung compared with the rest of *that* session — and wraps repeated problems into coaching alerts.**

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

**Coaching importance:** **High** for **contact quality** and **direction**; coaches often pair this with head and feet. It’s **15%** of the total shot score in your pipeline — important but not weighted above head/footwork.

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

**Coaching importance:** **Medium** as a teaching topic (“commit / tempo / don’t guide”); in your model it’s **10%** of the shot score. **Session fatigue** and **intent** show up here.

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
One **overall grade** for that delivery from **head (35%) + footwork (25%) + stance (15%) + elbows (15%) + swing intensity (10%)**, then **recalculated** after session swing scaling.

**Coaching importance:** **High** for **ranking balls** and **progress**; **medium** for **technical diagnosis** (you still read the **pieces** above to know *what* to coach).

**How it’s calculated (layman):**  
Each area contributes points out of 100 internally; total ÷ 10 → **/10**. Words like **Good**, **Average**, **Poor** are **bands** on that total.

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
