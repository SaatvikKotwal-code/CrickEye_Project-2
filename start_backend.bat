@echo off
title CrickEye Pro - Backend Services Launcher
echo ===================================================
echo       Starting CrickEye Pro Backend Services
echo ===================================================

cd /d "%~dp0"

set "ADB_PATH=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
if exist "%ADB_PATH%" (
    echo [ADB] Configuring USB reverse port forwarding...
    "%ADB_PATH%" reverse tcp:8000 tcp:8000 >nul 2>&1
    "%ADB_PATH%" reverse tcp:8080 tcp:8080 >nul 2>&1
    echo [ADB] Success! Connected phones can access http://localhost:8000 directly.
)

echo [FastAPI] Starting FastAPI on 0.0.0.0:8000 (accessible via Wi-Fi and USB)...
start "CrickEye FastAPI (Port 8000)" py -m uvicorn backend.main:app --host 0.0.0.0 --port 8000

timeout /t 2 /nobreak >nul

echo [Node] Starting Node API on port 8080...
start "CrickEye Node API (Port 8080)" node backend/server.js

for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -like '*Wi-Fi*' -or $_.InterfaceAlias -like '*Wireless*' -or $_.InterfaceAlias -like '*Ethernet*' } | Where-Object { $_.IPAddress -notlike '169.254*' -and $_.IPAddress -notlike '127.*' } | Select-Object -ExpandProperty IPAddress -First 1)"`) do set "LAN_IP=%%i"
if "%LAN_IP%"=="" set "LAN_IP=10.236.212.209"

REM Update mobile client.ts LAN preset with current IP (non-destructive sed-like operation)
set "MOBILE_CLIENT=mobile\src\api\client.ts"
if exist "%MOBILE_CLIENT%" (
    echo [Mobile] Updating LAN preset IP to %LAN_IP% in %MOBILE_CLIENT%...
    powershell -NoProfile -Command "(Get-Content '%MOBILE_CLIENT%') -replace 'http://[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+:8000', 'http://%LAN_IP%:8000' | Set-Content '%MOBILE_CLIENT%' -Encoding UTF8"
)

REM Update config.js with current IP
set "CONFIG_JS=config.js"
if exist "%CONFIG_JS%" (
    powershell -NoProfile -Command "(Get-Content '%CONFIG_JS%') -replace 'http://[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+:8000', 'http://%LAN_IP%:8000' | Set-Content '%CONFIG_JS%' -Encoding UTF8"
)

echo.
echo ===================================================
echo  SERVICES ARE RUNNING:
echo   - Localhost / USB: http://localhost:8000
echo   - Wi-Fi LAN:       http://%LAN_IP%:8000
echo   - Node API:        http://localhost:8080
echo   - Mobile Health:   http://%LAN_IP%:8000/api/mobile-health
echo ===================================================
echo.
echo  MOBILE APP CONNECTION OPTIONS:
echo   1. USB (ADB):   http://localhost:8000  (auto-forwarded)
echo   2. Wi-Fi LAN:   http://%LAN_IP%:8000
echo   3. Emulator:    http://10.0.2.2:8000
echo ===================================================
echo.
pause
