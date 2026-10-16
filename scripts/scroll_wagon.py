import asyncio
import json
import os
import subprocess
import urllib.request
import websockets

ADB_PATH = os.path.expandvars(r"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe")
ARTIFACT_DIR = r"C:\Users\HP\.gemini\antigravity-ide\brain\0c7a7ed2-0a44-413b-a5f3-710ef86e96c5"

async def scroll_wagon():
    out = subprocess.check_output([ADB_PATH, "-s", "RZCY21LV4YM", "shell", "pidof", "com.crickeye.pro"]).decode().strip()
    pid = out.split()[0]
    subprocess.run([ADB_PATH, "-s", "RZCY21LV4YM", "forward", "tcp:9222", f"localabstract:webview_devtools_remote_{pid}"], check=True)
    targets = json.loads(urllib.request.urlopen("http://127.0.0.1:9222/json").read().decode())
    page = next(t for t in targets if t.get("type") == "page")
    async with websockets.connect(page["webSocketDebuggerUrl"]) as ws:
        await ws.send(json.dumps({
            "id": 1,
            "method": "Runtime.evaluate",
            "params": {
                "expression": "document.querySelector('.wagon-wheel-container')?.scrollIntoView({behavior: 'instant', block: 'center'});",
                "returnByValue": True
            }
        }))
        await ws.recv()
        await asyncio.sleep(0.5)

    shot_path = os.path.join(ARTIFACT_DIR, "screen_wagon_wheel_view.png")
    with open(shot_path, "wb") as f:
        subprocess.run([ADB_PATH, "-s", "RZCY21LV4YM", "exec-out", "screencap", "-p"], stdout=f, check=True)
    print("Saved:", shot_path)

asyncio.run(scroll_wagon())
