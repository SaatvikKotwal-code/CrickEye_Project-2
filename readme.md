# 🏏 CrickEye Dashboard

An AI-powered cricket analytics system for **shot classification, pose-based analysis, and session tracking**.

---

## 📌 Overview

CrickEye is designed to analyze cricket batting sessions using computer vision and deep learning.  
It processes videos, detects player poses, classifies shots, and generates meaningful analytics via an interactive dashboard.

---

## ⚙️ Features

- 🎯 Shot Classification (Cover, Straight, Pull, Sweep, Flick)
- 🧍 Pose Detection using YOLOv8
- 📊 Session Analytics Dashboard
- 🌀 Wagon Wheel Visualization
- 📁 Session Logging (CSV/JSON)
- 🎥 Video-based Analysis Pipeline

---

## 🧠 Tech Stack

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Python (Flask/FastAPI style)
- **AI Models:** YOLOv8 Pose, Custom `.pth` Model
- **Visualization:** Custom JS Components

---

## 📂 Project Structure
crickeye-dashboard/
│
├── backend/
├── components/
├── assets/ # (models + videos - not included)
├── data/
├── uploads/
├── App.js
├── index.html
├── style.css
├── analyse_session.py
└── README.md


---

## 📦 Model & Dataset Setup

⚠️ Due to size constraints, models and videos are not included in this repository.

👉 Download required files from:  
**https://drive.google.com/drive/folders/1A40FmCcU3x0_6iB9l3eiY5iB-bm335HZ?usp=sharing**

After downloading, place them inside:
assets/

Required files:
- `yolov8n-pose.pt` — must live in `assets/`; the pipeline loads this path only (no Ultralytics auto-download).
- `crickeye_best.pth`
- Sample input videos

---


This drive link contains all the assets video and trained model as well.

## ▶️ How to Run

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

From the **project root** (`crickeye-dashboard/`, not inside `backend/`):

```bash
py -m uvicorn backend.main:app --reload --port 8000
```

If your shell is already in `backend/`, use the module name `main` instead:

```bash
py -m uvicorn main:app --reload --port 8000
```

Open frontend at `http://localhost:8000`.

The dashboard uses a **WebSocket** at `/ws`. `requirements.txt` includes **`uvicorn[standard]`** (pulls in `websockets`). If you see `No supported WebSocket library` or `GET /ws` **404**, run `pip install "uvicorn[standard]"` and restart uvicorn.

## Supabase Phase-1 (multi-user)

1. Create a Supabase project and run **`backend/supabase_schema.sql`** in the SQL Editor (includes **RLS policies**). If you already created the table earlier, run **only the RLS block** from that file (from `alter table public.sessions enable row level security` through the storage policies). Without policies, you get **`new row violates row-level security policy`** on insert/update.
2. **Storage bucket (required):** In Supabase go to **Storage → New bucket**. Set the name to **`videos`** exactly (lowercase). Enable **Public bucket** so `getPublicUrl` works for playback links. If you see **“Bucket not found”** in the app, this bucket was never created or the name does not match. Under **Policies**, allow authenticated users to **insert** and **read** objects in `videos` (or use the dashboard policy templates for “authenticated upload”).
3. Put **`SUPABASE_URL`** and **`SUPABASE_ANON_KEY`** in **`backend/.env`** (see `backend/.env.example`). FastAPI loads that file and exposes them to the browser via **`GET /api/public-config`** (anon key only; service role stays server-side).
4. Optional: for local overrides without `.env`, set `window.SUPABASE_URL` / `window.SUPABASE_ANON_KEY` before `app.js` (advanced).
5. Optional Node server (only if you use `POST /process-session`):

```bash
cd backend
npm start
```

### Sign Up / Login does nothing (no network, console errors)

The Supabase UMD script defines a global named `supabase`. The app stores the **logged-in client** in `supabaseClient` so the script is not blocked by a duplicate `let supabase` declaration. Hard-refresh after updating (`Ctrl+Shift+R`).

