# 📏 CrickEye – Metrics & Scores Explained

This document explains every number, score, and label you'll see in the CrickEye dashboard. Written in plain English for players and coaches.

---

## 🎯 Shot Score (out of 10)

The **Shot Score** is the overall rating for a single delivery. It combines 5 independent components, each scored 0–100 by the AI, then blended into a final score out of 10.

| Quality | Score Range |
|---|---|
| **Excellent** | 8.5 – 10.0 |
| **Good** | 7.0 – 8.4 |
| **Average** | 5.5 – 6.9 |
| **Poor** | 0 – 5.4 |

---

## 📊 The 5 Metric Components (each 0–100)

### 🧠 Head Quality
**What it measures:** How still and well-positioned your head is throughout the shot.

The AI tracks your head position from setup through contact and follow-through. It penalises:
- **Lateral drift** — head moving sideways (falling over to off-side or leg-side)
- **Vertical instability** — head bobbing up or down unexpectedly (adjusted for shots like pull/sweep where some movement is expected)

| Score | Meaning |
|---|---|
| 85–100 | Head rock-steady, eyes level at contact |
| 65–84 | Minor movement — acceptable |
| 40–64 | Noticeable drift — needs attention |
| 0–39 | Significant head fall — priority fix |

---

### ⚖️ Stance Symmetry
**What it measures:** How level and balanced your setup is *before* you start moving.

Tracks shoulder tilt and hip alignment. Level shoulders and even weight = higher score.

| Score | Meaning |
|---|---|
| 80–100 | Level, balanced setup |
| 60–79 | Slight lean or tilt |
| 0–59 | Noticeable asymmetry — may affect shot execution |

---

### 🦶 Footwork Score
**What it measures:** Whether your front foot moved *early enough* and *in the right direction*.

The AI checks:
- Did you trigger movement before the ball arrived?
- Did your front foot plant firmly before contact?
- Was the foot movement in line with the ball?

| Score | Meaning |
|---|---|
| 85–100 | Early, decisive, in-line foot movement |
| 65–84 | Adequate movement |
| 40–64 | Late or misaligned — timing is affected |
| 0–39 | Flat-footed or no movement detected |

---

### 🏏 Swing Arc (Swing Path Score)
**What it measures:** How smooth and direct the bat path was from backswing through contact to follow-through.

Tracks your wrist trajectory. A good swing arc is a smooth curve that arrives "through the line" of the ball.

| Score | Meaning |
|---|---|
| 80–100 | Clean, smooth swing path |
| 60–79 | Some deviation or jerkiness |
| 0–59 | Bat coming across the line or inconsistent path |

**Related — Swing Intensity:** A separate measure of how hard and committed the swing was (0–100). High intensity + poor path = power with no direction. Tracked for fatigue detection.

---

### 🎯 Execution Score (Shot vs. Length)
**What it measures:** Did you pick the *right shot* for the *ball's length*?

The AI uses ball tracking to know where the ball pitched, then checks if the shot played was appropriate:

| Ball Length | Expected Shots | Poor Choice |
|---|---|---|
| Yorker / Full | Drive (cover, straight) | Pull, sweep |
| Good Length | Drive or defend | Forcing pull |
| Short | Pull, cut | Full drive |
| Bouncer | Duck or pull | Drive off front foot |

A mismatch = lower execution score. This requires ball tracking (`best_ball.pt`) for the full score.

---

### ⚡ Bat Speed (km/h)
**What it measures:** Estimated speed of the bat through the hitting zone.

Calculated from wrist velocity using camera calibration (shoulder pixel scale as a reference distance). This is a **relative measure** — useful for tracking your own trends over time, not an absolute speed reading.

---

## 📈 Session-Level Metrics

| Metric | What It Shows |
|---|---|
| **Avg Shot Score** | Mean score of all confirmed shots this session |
| **Best Shot** | Highest-scoring delivery (shown with shot type and timestamp) |
| **Worst Shot** | Lowest-scoring delivery |
| **Fatigue Detected** | True if swing intensity dropped >25% from first half to second half |
| **Trend** | Side-by-side comparison: first half vs second half for each metric |
| **Feet Active Rate** | % of shots where front foot moved before contact |

---

## ⚠️ Coaching Alerts (Rule-Based)

Alerts fire automatically when patterns are detected across multiple shots in a session. Each alert includes a **player cue** (simple instruction) and a **practice drill**.

| Alert | When It Fires | What It Means |
|---|---|---|
| **Head lateral drift** | Head moves sideways above threshold on 3+ shots | You're falling over or swaying — keep head over middle stump |
| **Head vertical drift** | Unexpected head drop/rise on 3+ shots | Eyes not tracking the ball to the bat |
| **Elbow collapse** | Leading elbow folds in on 3+ shots | Loss of bat face control — common on drives |
| **Elbow reaching** | Over-extension detected on 3+ shots | Reaching for wide balls instead of moving feet |
| **Elbow behind pad** | Bat rolls early on 2+ sweep shots | Miss-hit risk on the sweep |
| **Flat-footed** | No foot movement on 3+ shots | Static before the ball — timing will suffer |
| **Late foot plant** | Front foot still moving at contact on 2+ shots | Plant the foot *then* swing, not both at once |
| **Footwork line mismatch** | Foot moving across the line on 2+ shots | Moving away from the ball instead of to it |
| **Fatigue** | Swing drops >25% in second half | Net is too long — shorten or add a break |

---

## 🤖 AI Coach Analytics (from llama3.1:8b)

This is **not a computed number** — it's coaching text written by the AI based on your full session data.

| Section | What It Contains |
|---|---|
| **Summary** | One sentence about your overall session |
| **Top Strengths** | 2–3 things you did well this session |
| **Focus Areas** | 2–3 specific things to improve |
| **Shot-Wise Notes** | For each shot type played: what was good, what to focus on |
| **Posture & Setup Cues** | Body mechanics coaching (head, stance, footwork) |
| **Assigned Practice Drills** | 2–4 specific exercises to do next session |

The badge on the AI Coach card shows either:
- 🟢 **DGX** — live AI-generated coaching
- 🟡 **Fallback** — rule-based coaching (shown when LLM is unavailable)

---

## 🎾 Ball Analytics (requires `best_ball.pt`)

| Metric | What It Shows |
|---|---|
| **Length Zone** | Where the ball pitched: Yorker / Full / Good Length / Short / Bouncer |
| **Delivery Speed** | Estimated ball speed in km/h |
| **Trajectory** | Hawkeye-style arc from release to bounce to bat contact |
| **Bounce Point** | Coordinates of where the ball landed on the pitch |

Ball analytics appear in:
- The **Pitch Map** (colour-coded dots per length zone)
- The **Deliveries table** (per-shot ball info)
- The **Ball Length Analysis** section of the Session Overview
