# 🏏 CrickEye – Project Overview

**CrickEye** is an AI-powered cricket batting analytics platform built for net practice sessions. You record a delivery, and the system automatically analyses your biomechanics, identifies which shot you played, and generates personalised coaching feedback — all within seconds.

---

## 🎯 What Does CrickEye Do?

```
You record a delivery
       ↓
AI detects 17 body keypoints per frame
       ↓
Shot classifier identifies: Cover / Flick / Pull / Straight / Sweep
       ↓
Biomechanics engine scores: Head · Stance · Footwork · Swing · Execution
       ↓
Ball tracker follows trajectory (speed, length zone, bounce)
       ↓
AI Coach writes personalised tips, strengths, and practice drills
       ↓
Interactive dashboard shows everything
```

---

## ✨ Key Features

- 📹 **Live Webcam Recording** — 3-2-1 audio countdown, auto-records 5 seconds (one delivery), instantly starts AI analysis
- 📁 **Video Upload** — Drag and drop any MP4, MOV, AVI, or WebM clip
- 📱 **Android App** (`CrickEye-Pro.apk`) — Native mobile wrapper with haptic feedback, screen wake-lock, and front/rear camera picker
- 🦴 **17-Point Pose Detection** — Maps your head, shoulders, elbows, wrists, hips, knees, and feet every frame
- 🏏 **Shot Classification** — Identifies: Cover Drive, Flick, Pull, Straight Drive, Sweep
- ⚡ **Ball Analytics** — Hawkeye-style trajectory, length zone detection (Yorker / Full / Good Length / Short / Bouncer), delivery speed estimation
- 📊 **Interactive Dashboard** — Wagon Wheel, Pitch Map, Shot Timeline, metric cards
- 🤖 **AI Coach Analytics** — Powered by `llama3.1:8b` via DGX; writes coaching summaries, focus areas, shot notes, and practice drills
- ☁️ **Session History** — Cloud storage via Supabase; review past sessions, compare performance over time
- 👥 **Coach View** — Coaches can review sessions for multiple players

---

## 👤 Who Is It For?

| User | How They Use CrickEye |
|---|---|
| **Batsman** | Records net sessions, reviews shot scores, reads AI coaching tips |
| **Coach** | Reviews session reports per player, tracks improvement over time |
| **Developer / Evaluator** | Runs the backend pipeline, integrates LLM services, extends analytics |

---

## 📂 Documentation Map

| File | What It Covers |
|---|---|
| [SETUP_GUIDE.md](./SETUP_GUIDE.md) | How to install Python/Node dependencies and run the app |
| [HOW_IT_WORKS.md](./HOW_IT_WORKS.md) | The full AI pipeline from recording to coaching feedback |
| [METRICS.md](./METRICS.md) | Every score and metric explained in plain English |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Technical system diagram, file map, API protocol |

---

## 🚀 Quick Start

1. Install dependencies: `pip install -r requirements.txt` and `cd backend && npm install`
2. Configure `backend/.env` with Supabase keys and DGX API key
3. Terminal 1: `python -m uvicorn backend.main:app --port 8000 --host 0.0.0.0`
4. Terminal 2: `node backend/server.js`
5. Open browser: [http://localhost:8000](http://localhost:8000)

→ See [SETUP_GUIDE.md](./SETUP_GUIDE.md) for the full step-by-step guide.

---

> **Live Demo:** The project can be exposed publicly via Cloudflare Tunnel (`backend/tunnel.js`).
