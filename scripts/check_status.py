import asyncio
import json
import os
import subprocess
import urllib.request
import websockets

ADB_PATH = os.path.expandvars(r"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe")
ARTIFACT_DIR = r"C:\Users\HP\.gemini\antigravity-ide\brain\0c7a7ed2-0a44-413b-a5f3-710ef86e96c5"

async def check():
    out = subprocess.check_output([ADB_PATH, "-s", "RZCY21LV4YM", "shell", "pidof", "com.crickeye.pro"]).decode().strip()
    pid = out.split()[0]
    subprocess.run([ADB_PATH, "-s", "RZCY21LV4YM", "forward", "tcp:9222", f"localabstract:webview_devtools_remote_{pid}"], check=True)
    subprocess.run([ADB_PATH, "-s", "RZCY21LV4YM", "reverse", "tcp:8000", "tcp:8000"], check=True)
    subprocess.run([ADB_PATH, "-s", "RZCY21LV4YM", "reverse", "tcp:8080", "tcp:8080"], check=True)

    targets = json.loads(urllib.request.urlopen("http://127.0.0.1:9222/json").read().decode())
    page = next(t for t in targets if t.get("type") == "page")
    async with websockets.connect(page["webSocketDebuggerUrl"]) as ws:
        await ws.send(json.dumps({
            "id": 1,
            "method": "Runtime.evaluate",
            "params": {
                "expression": """
                ({
                    hasOverlay: !!document.getElementById('processingOverlay'),
                    stage: document.getElementById('procStage')?.textContent,
                    pct: document.getElementById('procPct')?.textContent,
                    frame: document.getElementById('procFrame')?.textContent,
                    shots: document.getElementById('procShots')?.textContent,
                    videoSrc: document.getElementById('mainVideo')?.src,
                    videoPaused: document.getElementById('mainVideo')?.paused,
                    videoTime: document.getElementById('mainVideo')?.currentTime,
                    activeSection: document.querySelector('.mobile-screen-active')?.dataset.section
                })
                """,
                "returnByValue": True
            }
        }))
        while True:
            r = json.loads(await ws.recv())
            if r.get("id") == 1:
                val = r.get("result", {}).get("result", {}).get("value")
                print("App Status:", val)
                break

    # Take screenshot
    shot_path = os.path.join(ARTIFACT_DIR, "screen_live_result_dashboard.png")
    with open(shot_path, "wb") as f:
        subprocess.run([ADB_PATH, "-s", "RZCY21LV4YM", "exec-out", "screencap", "-p"], stdout=f, check=True)
    print("Screenshot saved to:", shot_path)

asyncio.run(check())
