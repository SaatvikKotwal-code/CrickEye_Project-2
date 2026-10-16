import asyncio
import json
import websockets

async def inspect():
    uri = "ws://127.0.0.1:9222/devtools/page/E8E40D525E27969732F4218BF9761BCF"
    async with websockets.connect(uri) as ws:
        # Enable console and runtime
        await ws.send(json.dumps({"id": 1, "method": "Runtime.enable"}))
        await ws.send(json.dumps({"id": 2, "method": "Log.enable"}))

        # Evaluate state
        expr = """
        ({
            wsExists: typeof ws !== 'undefined' && ws !== null,
            wsReadyState: typeof ws !== 'undefined' && ws ? ws.readyState : null,
            wsUrl: typeof ws !== 'undefined' && ws ? ws.url : null,
            apiBaseUrl: typeof getApiBaseUrl === 'function' ? getApiBaseUrl() : null,
            wsUrlConfig: typeof getWsUrl === 'function' ? getWsUrl() : null,
            procOverlay: !!document.getElementById('procOverlay'),
            procStage: document.getElementById('procStage')?.textContent,
            procSubtext: document.getElementById('procSubtext')?.textContent,
            procProgressText: document.getElementById('procProgressText')?.textContent,
            currentVideoPath: typeof currentVideoPath !== 'undefined' ? currentVideoPath : null
        })
        """
        await ws.send(json.dumps({
            "id": 3,
            "method": "Runtime.evaluate",
            "params": {"expression": expr, "returnByValue": True}
        }))

        while True:
            msg = await ws.recv()
            data = json.loads(msg)
            if data.get("id") == 3:
                print("JS STATE:", json.dumps(data.get("result", {}).get("result", {}).get("value"), indent=2))
                break

asyncio.run(inspect())
