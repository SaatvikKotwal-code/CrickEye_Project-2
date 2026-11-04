# CrickEye Mobile — Pure React Native Application

A high-performance cross-platform React Native client for CrickEye Pro, delivering native 60–120 FPS cricket delivery capture, real-time computer vision telemetry, and interactive biomechanical dashboards without WebView overhead.

> 📖 **Full Architectural & Feature Specification:**  
> See [REACT_NATIVE_APPLICATION_SPECIFICATION.md](file:///c:/Users/HP/OneDrive/Desktop/CRIE/docs/REACT_NATIVE_APPLICATION_SPECIFICATION.md) for the end-to-end technical blueprint, API contracts, and feature parity matrix.

---

## Key Features & Capabilities

- **Dual-Transport Backend Switcher**:
  - Connect to **Cloudflare Tunnel** (`https://*.trycloudflare.com`) for remote/cellular net sessions.
  - Connect to **Localhost**, **Android Emulator (`10.0.2.2:8000`)**, or local **Wi-Fi LAN (`192.168.x.x:8000`)** for zero-latency local net testing.
  - Built-in latency ping tester and connection health monitoring.
- **High-Speed Sensor Access**:
  - Direct native camera access with `react-native-vision-camera` (v4).
  - High-frame-rate capture (60 FPS / 120 FPS on supported hardware) with locked shutter and exposure.
  - On-screen batsman stance alignment guide (head zone circle and popping crease alignment).
  - 3-2-1 visual & audio countdown with haptic vibration feedback.
- **Wireless Ingestion & Telemetry**:
  - Streams chunked MP4 deliveries directly to the FastAPI `/upload` endpoint.
  - Bidirectional WebSocket (`/ws`) telemetry streaming live frame progress, processing FPS, and results.
- **Analytics Dashboards (100% Feature Parity)**:
  - **Interactive Pitch Map**: Length zones (Yorker, Full, Good Length, Short, Bouncer) & bounce markers rendered via Skia/SVG.
  - **360° Wagon Wheel**: Radial field shot distribution with Leg/Off/Straight coverage bars.
  - **Session Score & PlayCard**: Animated circular metric rings (Timing, Middling, Impact, Bat Speed) and 1–5 star ratings.
  - **Slow-Motion Video Player**: Range-aware HTTP 206 video playback with 0.25×, 0.5×, 1×, 2× playback rates and loop toggles.
  - **Gemini AI Coaching Card**: Automated technique diagnosis, flaws (e.g., collapsed elbow), and personalized drills.
  - **Role-Based Auth & Management**: Supabase Auth integration supporting Player Dashboards and Coach Control Panels.

---

## Setup & Running

### Prerequisites
- Node.js 18+
- Android Studio (SDK 34+, JDK 17) or Xcode (macOS for iOS)

### Running Locally
```bash
cd mobile
npm install
npm run android   # For Android physical device or emulator
npm run ios       # For iOS test device or simulator
```

---

## Connecting to Backend

The mobile app communicates with two backend services:

| Service       | Port | Protocol    | Purpose                                      |
|---------------|------|-------------|----------------------------------------------|
| **FastAPI**   | 8000 | HTTP + WS   | Video upload, WebSocket pipeline, config API  |
| **Node.js**   | 8080 | HTTP        | LLM insights (Gemini), session processing     |

### Connection Methods

#### 1. USB (ADB Reverse Port Forwarding) — Recommended for development
```bash
adb reverse tcp:8000 tcp:8000
adb reverse tcp:8080 tcp:8080
```
The app connects to `http://localhost:8000` → forwarded to your PC.

#### 2. Wi-Fi LAN — Recommended for physical device testing
1. Ensure PC and phone are on the **same Wi-Fi network**
2. Start backend: `start_backend.bat` (auto-detects your LAN IP)
3. In the app's **Server Settings** modal, select **"Current PC Wi-Fi LAN"** preset
4. Or use **"🔍 Auto-Detect Network"** to scan and connect automatically

#### 3. Android Emulator Loopback
Select **"Android Studio Emulator"** preset → auto-connects via `10.0.2.2:8000`

#### 4. Cloudflare Tunnel (Remote/Cellular)
For testing over cellular or remote networks, use a Cloudflare Quick Tunnel.

### Quick Start (One Command)
From the project root:
```bash
start_backend.bat
```
This launches both FastAPI (port 8000) and Node API (port 8080), configures ADB reverse forwarding, and updates the mobile app's LAN IP preset automatically.

### Health Check
Visit `http://<YOUR_IP>:8000/api/mobile-health` to verify the backend is ready for mobile connections.

### API Endpoints Used by Mobile

| Endpoint                | Method | Description                              |
|-------------------------|--------|------------------------------------------|
| `/api/public-config`    | GET    | Supabase URL + anon key                  |
| `/api/mobile-health`    | GET    | Server capabilities + LAN IP discovery   |
| `/api/last-session`     | GET    | Most recent analysis results             |
| `/upload`               | POST   | Video file upload (multipart)            |
| `/ws`                   | WS     | Real-time pipeline telemetry             |
| `/llm-insights`         | POST   | AI coaching insights (proxied to Node)   |
| `/uploads/{path}`       | GET    | Annotated video streaming (HTTP 206)     |
