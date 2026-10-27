import asyncio
import json
import urllib.request
import websockets

async def inspect():
    targets = json.loads(urllib.request.urlopen("http://127.0.0.1:9222/json").read().decode())
    page = next(t for t in targets if t.get("type") == "page")
    uri = page["webSocketDebuggerUrl"]
    
    async with websockets.connect(uri) as ws:
        await ws.send(json.dumps({"id": 1, "method": "Runtime.enable"}))
        await ws.send(json.dumps({"id": 2, "method": "Log.enable"}))

        expr = """
        ({
            wsExists: typeof ws !== 'undefined' && ws !== null,
            wsReadyState: typeof ws !== 'undefined' && ws ? ws.readyState : null,
            wsUrl: typeof ws !== 'undefined' && ws ? ws.url : null,
            wsDot: document.getElementById('wsDot')?.className,
            wsText: document.getElementById('wsText')?.textContent,
            apiBaseUrl: typeof getApiBaseUrl === 'function' ? getApiBaseUrl() : null,
            candidates: typeof getCandidateServerUrls === 'function' ? getCandidateServerUrls() : null,
            title: document.title,
            bodyPreview: document.body.innerText.substring(0, 150)
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
