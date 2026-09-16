@echo off
title CrickEye Live Demo Launcher
echo ===================================================
echo           Starting CrickEye Pro Services
echo ===================================================

cd /d "%~dp0"

echo [1/4] Checking for connected Android devices via USB ADB...
set "ADB_PATH=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
if exist "%ADB_PATH%" (
    "%ADB_PATH%" reverse tcp:8000 tcp:8000 >nul 2>&1
    "%ADB_PATH%" reverse tcp:8080 tcp:8080 >nul 2>&1
    echo ADB reverse proxy configured (phone can connect via http://localhost:8000).
)

echo [2/4] Starting FastAPI Server on 0.0.0.0:8000 (accessible across Wi-Fi and USB)...
start "CrickEye FastAPI (Port 8000)" py -m uvicorn backend.main:app --host 0.0.0.0 --port 8000

timeout /t 2 /nobreak >nul

echo [3/4] Starting Node.js API Server on port 8080...
start "CrickEye Node API (Port 8080)" node backend/server.js

timeout /t 2 /nobreak >nul

echo [4/4] Starting Cloudflare Tunnel...
echo ===================================================
echo Tunnel will output the public Live Demo URL below:
echo ===================================================
.\cloudflared.exe tunnel --url http://127.0.0.1:8000
pause
