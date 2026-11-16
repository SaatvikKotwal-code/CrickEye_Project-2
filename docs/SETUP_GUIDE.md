# 🛠️ CrickEye – Setup & Run Guide

This guide walks you through installing and running CrickEye on a Windows PC from scratch. Each step explains *why* it matters, not just *what* to do.

---

## ✅ What You Need Before Starting

| Requirement | Why |
|---|---|
| **Windows 10 or 11** | The project is tested on Windows; paths and scripts assume Windows |
| **Python 3.10+** | Runs the AI analysis pipeline (pose detection, shot scoring) |
| **Node.js 18+** | Runs the API server for session storage and AI coaching |
| **8 GB RAM minimum** | The YOLO pose model and shot classifier need memory to run |
| **Webcam or video file** | Something to analyse |
| **Model files in `assets/`** | The 3 pre-trained AI model weight files (see Step 5) |

---

## 📦 Installation Steps

### Step 1 — Get the Project

Clone the repository or download and extract the ZIP:
```bash
git clone <repository-url>
cd CrickEye_Project-2
```

### Step 2 — Install Python Packages

This installs all the AI libraries (PyTorch, YOLOv8, OpenCV, FastAPI, etc.):
```bash
pip install -r requirements.txt
```

> ⏱️ This may take 5–15 minutes depending on your internet speed. PyTorch is a large download.

### Step 3 — Install Node Packages

The Node server handles session storage and AI coaching requests:
```bash
cd backend
npm install
cd ..
```

### Step 4 — Configure Environment Variables

Environment variables are secret settings (API keys, database URLs) stored in a `.env` file — never shared publicly.

```bash
# Copy the example file
copy backend\.env.example backend\.env
```

Then open `backend\.env` in a text editor and fill in your values. See the [Environment Variables](#environment-variables-reference) section below.

### Step 5 — Check Model Files

The AI requires 3 pre-trained model files in the `assets/` folder:

| File | Purpose |
|---|---|
| `assets/yolov8n-pose.pt` | Body pose detection (17 keypoints) |
| `assets/crickeye_best.pth` | Shot type classifier (Cover/Flick/Pull/etc.) |
| `assets/best_ball.pt` | Ball trajectory tracker |

> ⚠️ If any of these files are missing, the analysis pipeline will fail with a `FileNotFoundError`. Check `assets/REQUIRED_FILES.txt` for details.

---

## ▶️ Running the App

You need **two terminal windows** running at the same time:

**Why two terminals?**
- Terminal 1 (FastAPI) handles video analysis, pose detection, and serves the web app
- Terminal 2 (Node) handles user sessions, session history, and AI coaching requests

### Terminal 1 — FastAPI Backend (Analysis Engine)
```bash
python -m uvicorn backend.main:app --port 8000 --host 0.0.0.0
```

### Terminal 2 — Node API Server (Sessions & AI)
```bash
node backend/server.js
```

### Open the App
Navigate to: **[http://localhost:8000](http://localhost:8000)**

---

## 📱 Using the Android App

1. Find `CrickEye-Pro.apk` in the project root
2. Transfer it to your Android phone and install it (enable "Install from unknown sources" if prompted)
3. Enable **USB Debugging** on the phone (Settings → Developer Options)
4. Connect phone to your PC via USB
5. Open the CrickEye app → tap the **settings/server icon** → enter your computer's local IP address (e.g. `192.168.1.5`) and port `8000`
6. Tap **Connect** — the phone will now mirror the web dashboard

> 💡 Your phone and PC must be on the same Wi-Fi network for wireless mode, or connected via USB cable.

---

## 🔧 Environment Variables Reference

Open `backend/.env` and set these:

| Variable | Required | What It Does | Example |
|---|---|---|---|
| `SUPABASE_URL` | Yes (for sessions) | Your Supabase project URL | `https://abc.supabase.co` |
| `SUPABASE_ANON_KEY` | Yes (for sessions) | Public Supabase key | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (for admin) | Secret Supabase key | `eyJ...` |
| `DGX_API_KEY` | Yes (for AI coach) | DGX LLM service API key | `dgx_abc123...` |
| `DGX_LLM_URL` | Yes (for AI coach) | DGX LLM endpoint URL | `https://ai-services.mietjmu.in/gateway/llm/chat` |
| `DGX_LLM_MODEL` | Yes (for AI coach) | Which LLM model to use | `llama3.1:8b` |
| `LLM_INSIGHTS_ENABLED` | No | Turn AI coaching on/off | `true` or `false` |
| `LLM_PROVIDER` | No | Which LLM to use | `dgx` |
| `LLM_TIMEOUT_MS` | No | How long to wait for LLM response | `60000` |
| `PORT` | No | Node server port (default 8080) | `8080` |
| `BALL_ANALYTICS_ENABLED` | No | Enable/disable ball tracking | `1` or `0` |

> 🔒 Never commit your `.env` file to Git. It contains secret keys.

---

## 🩺 Common Problems & Solutions

| Problem | Likely Cause | Solution |
|---|---|---|
| `FileNotFoundError: yolov8n-pose.pt` | Model file missing | Add the file to `assets/` folder |
| `Address already in use` on port 8000 or 8080 | Old server still running | Close other terminal or run `netstat -ano \| findstr :8000` and kill the process |
| AI Coach shows **"Fallback"** | LLM not configured | Set `LLM_INSIGHTS_ENABLED=true` and add `DGX_API_KEY` in `backend/.env` |
| Phone app can't connect | IP address wrong or different network | Check your PC's IP with `ipconfig`, ensure both devices on same Wi-Fi |
| `Cannot find module 'dotenv'` | Node packages not installed | Run `cd backend && npm install` |
| Analysis gets stuck at 0% | Python dependencies missing | Run `pip install -r requirements.txt` again |
| `paging file too small` Windows error | Low virtual memory | Run `enable_virtual_memory.bat` as Administrator and restart |
