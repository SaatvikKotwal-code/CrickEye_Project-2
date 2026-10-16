import asyncio
import json
import os
import subprocess
import urllib.request
import websockets

ADB_PATH = os.path.expandvars(r"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe")
ARTIFACT_DIR = r"C:\Users\HP\.gemini\antigravity-ide\brain\0c7a7ed2-0a44-413b-a5f3-710ef86e96c5"

def get_pid():
    out = subprocess.check_output([ADB_PATH, "-s", "RZCY21LV4YM", "shell", "pidof", "com.crickeye.pro"]).decode().strip()
    return out.split()[0] if out else None

async def run_flow():
    pid = get_pid()
    print("App PID:", pid)
    if not pid:
        raise RuntimeError("CrickEye app is not running on device!")

    # Forward devtools and reverse server ports
    subprocess.run([ADB_PATH, "-s", "RZCY21LV4YM", "forward", "tcp:9222", f"localabstract:webview_devtools_remote_{pid}"], check=True)
    subprocess.run([ADB_PATH, "-s", "RZCY21LV4YM", "reverse", "tcp:8000", "tcp:8000"], check=True)
    subprocess.run([ADB_PATH, "-s", "RZCY21LV4YM", "reverse", "tcp:8080", "tcp:8080"], check=True)

    # 1. Get devtools target
    targets = json.loads(urllib.request.urlopen("http://127.0.0.1:9222/json").read().decode())
    page = next(t for t in targets if t.get("type") == "page")
    ws_url = page["webSocketDebuggerUrl"]
    print("Connecting to DevTools:", ws_url)

    async with websockets.connect(ws_url) as ws:
        msg_id = 0
        async def call(method, params=None):
            nonlocal msg_id
            msg_id += 1
            payload = {"id": msg_id, "method": method}
            if params:
                payload["params"] = params
            await ws.send(json.dumps(payload))
            while True:
                resp = json.loads(await ws.recv())
                if resp.get("id") == msg_id:
                    return resp.get("result", {})

        await call("Runtime.enable")

        # Check current screen
        res = await call("Runtime.evaluate", {
            "expression": "({ hasBtnLive: !!document.getElementById('btnChooseLiveRecord'), hasNewCapture: !!document.getElementById('btnNewCapture'), wsReady: ws?.readyState })",
            "returnByValue": True
        })
        val = res.get("result", {}).get("value")
        print("Initial state:", val)

        if not val.get("hasBtnLive"):
            print("Tapping New Capture button...")
            await call("Runtime.evaluate", {
                "expression": "document.getElementById('btnNewCapture')?.click();",
                "returnByValue": True
            })
            await asyncio.sleep(1.0)

        # Click Live Recording
        print("Tapping Live Recording button...")
        await call("Runtime.evaluate", {
            "expression": "document.getElementById('btnChooseLiveRecord')?.click();",
            "returnByValue": True
        })
        await asyncio.sleep(1.5)

        # Check if fullscreen camera is open
        res = await call("Runtime.evaluate", {
            "expression": "({ hasPortal: !!document.getElementById('fullscreenCameraPortal'), hasShutter: !!document.getElementById('webcamAutoRecordBtn') })",
            "returnByValue": True
        })
        print("Camera portal open:", res.get("result", {}).get("value"))

        # Click Start Recording
        print("Tapping START RECORDING...")
        await call("Runtime.evaluate", {
            "expression": "document.getElementById('webcamAutoRecordBtn')?.click();",
            "returnByValue": True
        })

        # Wait for countdown (3s) + 2s of recording
        print("Waiting 5s for recording...")
        await asyncio.sleep(5)

        # Check recording state
        res = await call("Runtime.evaluate", {
            "expression": "({ isRecording: isWebcamRecording, stopBtnVisible: document.getElementById('webcamStopRecordBtn')?.style.display !== 'none' })",
            "returnByValue": True
        })
        print("Recording state:", res.get("result", {}).get("value"))

        # Click STOP & ANALYZE
        print("Tapping STOP & ANALYZE...")
        await call("Runtime.evaluate", {
            "expression": "document.getElementById('webcamStopRecordBtn')?.click();",
            "returnByValue": True
        })

        screenshot_taken = False
        # Monitor processing overlay
        print("Monitoring processing overlay...")
        for i in range(25):
            await asyncio.sleep(0.5)
            res = await call("Runtime.evaluate", {
                "expression": """
                ({
                    hasOverlay: !!document.getElementById('processingOverlay'),
                    title: document.querySelector('#processingOverlay .proc-title')?.textContent,
                    stage: document.getElementById('procStage')?.textContent,
                    pct: document.getElementById('procPct')?.textContent,
                    frame: document.getElementById('procFrame')?.textContent,
                    eta: document.getElementById('procEta')?.textContent,
                    shots: document.getElementById('procShots')?.textContent
                })
                """,
                "returnByValue": True
            })
            val = res.get("result", {}).get("value")
            print(f"[{i*0.5:.1f}s] Processing state:", val)

            if val.get("hasOverlay") and not screenshot_taken and i >= 2:
                screenshot_taken = True
                screenshot_path = os.path.join(ARTIFACT_DIR, "screen_live_processing.png")
                with open(screenshot_path, "wb") as f:
                    subprocess.run([ADB_PATH, "-s", "RZCY21LV4YM", "exec-out", "screencap", "-p"], stdout=f, check=True)
                print(f"Captured live processing screenshot to: {screenshot_path}")

        # Final screenshot after pipeline
        final_path = os.path.join(ARTIFACT_DIR, "screen_live_completed.png")
        with open(final_path, "wb") as f:
            subprocess.run([ADB_PATH, "-s", "RZCY21LV4YM", "exec-out", "screencap", "-p"], stdout=f, check=True)
        print(f"Captured final screenshot to: {final_path}")

asyncio.run(run_flow())
