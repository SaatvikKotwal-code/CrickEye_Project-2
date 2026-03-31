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
- `yolov8n-pose.pt`
- `crickeye_best.pth`
- Sample input videos

---


This drive link contains all the assets video and trained model as well.

## ▶️ How to Run

### 1. Install dependencies

```bash
pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8000
```

Open frontend at `http://localhost:8000`.

## Supabase Phase-1 (multi-user)

1. Create a Supabase project and run `backend/supabase_schema.sql`.
2. Create a public bucket named `videos`.
3. In browser console set frontend env values:
   - `localStorage.setItem('SUPABASE_URL', 'https://<project>.supabase.co')`
   - `localStorage.setItem('SUPABASE_ANON_KEY', '<anon-key>')`
4. Copy `backend/.env.example` to `backend/.env` and fill all values.
5. Start the Node process endpoint server:

```bash
cd backend
npm start
```

