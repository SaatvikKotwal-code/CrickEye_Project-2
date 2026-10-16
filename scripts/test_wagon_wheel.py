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

async def test_wheel():
    pid = get_pid()
    subprocess.run([ADB_PATH, "-s", "RZCY21LV4YM", "forward", "tcp:9222", f"localabstract:webview_devtools_remote_{pid}"], check=True)
    subprocess.run([ADB_PATH, "-s", "RZCY21LV4YM", "reverse", "tcp:8000", "tcp:8000"], check=True)
    subprocess.run([ADB_PATH, "-s", "RZCY21LV4YM", "reverse", "tcp:8080", "tcp:8080"], check=True)

    targets = json.loads(urllib.request.urlopen("http://127.0.0.1:9222/json").read().decode())
    page = next(t for t in targets if t.get("type") == "page")
    async with websockets.connect(page["webSocketDebuggerUrl"]) as ws:
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

        # Simulate 5 confirmed shots
        expr = """
        (() => {
            clearWheelAndReset();
            if (typeof Skeleton !== 'undefined') Skeleton.setAll(Skeleton.ANALYSIS, 'ready');
            
            const testShots = [
                { shot_num: 1, label: 'cover', shot_score: 8.5, head_quality_score: 90, swing_intensity: 75, timestamp: '00:02.10', confirmed: true, conf: 0.88 },
                { shot_num: 2, label: 'straight', shot_score: 7.8, head_quality_score: 88, swing_intensity: 80, timestamp: '00:05.40', confirmed: true, conf: 0.92 },
                { shot_num: 3, label: 'pull', shot_score: 9.0, head_quality_score: 95, swing_intensity: 90, timestamp: '00:08.20', confirmed: true, conf: 0.85 },
                { shot_num: 4, label: 'flick', shot_score: 8.1, head_quality_score: 84, swing_intensity: 78, timestamp: '00:11.60', confirmed: true, conf: 0.79 },
                { shot_num: 5, label: 'sweep', shot_score: 7.4, head_quality_score: 80, swing_intensity: 70, timestamp: '00:14.90', confirmed: true, conf: 0.82 }
            ];
            
            rebuildDerivedShotStateFromShots(testShots);
            
            // Draw all 5 spokes
            state.pendingSpokes.forEach(sp => drawSpokeNow(sp));
            
            return {
                initialSpokeCount: WagonWheel.getSpokeCount(),
                shotCountBadge: document.getElementById('shotCount')?.textContent,
                pendingCount: state.pendingSpokes.length
            };
        })()
        """
        res = await call("Runtime.evaluate", {"expression": expr, "returnByValue": True})
        val1 = res.get("result", {}).get("value")
        print("After drawing 5 shots:", val1)

        # Wait 500ms for animation
        await asyncio.sleep(0.5)

        # Now simulate video looping back or timeline clicks on shot 1, 2, 3
        expr2 = """
        (() => {
            // Re-trigger shot 1, 2, 3 (simulating loop or scrubbing)
            drawSpokeNow(state.pendingSpokes[0]);
            drawSpokeNow(state.pendingSpokes[1]);
            drawSpokeNow(state.pendingSpokes[2]);
            
            return {
                spokeCountAfterReplay: WagonWheel.getSpokeCount(),
                shotCountBadge: document.getElementById('shotCount')?.textContent,
                straightCount: state.displayedShotStats['straight']?.count
            };
        })()
        """
        res2 = await call("Runtime.evaluate", {"expression": expr2, "returnByValue": True})
        val2 = res2.get("result", {}).get("value")
        print("After looping / replaying shots 1, 2, 3:", val2)

        # Switch to Pitch / Wagon Wheel screen on mobile
        await call("Runtime.evaluate", {
            "expression": "applyMobileScreen('pitch');",
            "returnByValue": True
        })
        await asyncio.sleep(1.0)

    # Take screenshot of wagon wheel on device
    shot_path = os.path.join(ARTIFACT_DIR, "screen_wagon_wheel_fixed.png")
    with open(shot_path, "wb") as f:
        subprocess.run([ADB_PATH, "-s", "RZCY21LV4YM", "exec-out", "screencap", "-p"], stdout=f, check=True)
    print("Screenshot saved to:", shot_path)

asyncio.run(test_wheel())
