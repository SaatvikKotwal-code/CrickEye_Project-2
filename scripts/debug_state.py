import asyncio
import json
import urllib.request
import websockets

async def check():
    targets = json.loads(urllib.request.urlopen("http://127.0.0.1:9222/json").read().decode())
    page = next(t for t in targets if t.get("type") == "page")
    async with websockets.connect(page["webSocketDebuggerUrl"]) as ws:
        expr = """
        ({
            loc: window.location.href,
            keys: Object.keys(localStorage),
            serverUrl: localStorage.getItem('crickeye_server_url'),
            authGateClasses: document.getElementById('authGate')?.className,
            wsDot: document.getElementById('wsDot')?.className,
            wsText: document.getElementById('wsText')?.textContent,
            currentUser: typeof state !== 'undefined' ? state?.currentUser : 'state undefined',
            wsVal: typeof ws !== 'undefined' ? (ws ? { url: ws.url, state: ws.readyState } : 'null') : 'undefined'
        })
        """
        await ws.send(json.dumps({
            "id": 1,
            "method": "Runtime.evaluate",
            "params": {"expression": expr, "returnByValue": True}
        }))
        res = json.loads(await ws.recv())
        print("RESULT:", json.dumps(res.get("result", {}).get("result", {}).get("value"), indent=2))

asyncio.run(check())
