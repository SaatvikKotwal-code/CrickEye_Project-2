import asyncio
import json
import websockets
import urllib.request

async def test_mobile_ws():
    pages = json.loads(urllib.request.urlopen("http://127.0.0.1:9222/json/list").read())
    ws_url = pages[0]["webSocketDebuggerUrl"]

    async with websockets.connect(ws_url) as ws:
        await ws.send(json.dumps({"id": 1, "method": "Runtime.enable"}))

        # Check if ws in mobile webview can ping backend
        eval_script = """
        new Promise((resolve) => {
            if (!window.ws || window.ws.readyState !== WebSocket.OPEN) {
                resolve({ status: 'ws not open', readyState: window.ws ? window.ws.readyState : null });
                return;
            }
            const origOnMessage = window.ws.onmessage;
            let gotPong = false;
            window.ws.addEventListener('message', function handler(e) {
                try {
                    const data = JSON.parse(e.data);
                    if (data.type === 'pong') {
                        gotPong = true;
                        window.ws.removeEventListener('message', handler);
                        resolve({ status: 'pong received!', url: window.ws.url });
                    }
                } catch(err) {}
            });
            window.ws.send(JSON.stringify({ action: 'ping' }));
            setTimeout(() => {
                if (!gotPong) resolve({ status: 'ping timed out', url: window.ws.url });
            }, 3000);
        })
        """
        await ws.send(json.dumps({
            "id": 2,
            "method": "Runtime.evaluate",
            "params": {"expression": eval_script, "awaitPromise": True, "returnByValue": True}
        }))

        while True:
            resp = await asyncio.wait_for(ws.recv(), timeout=5.0)
            data = json.loads(resp)
            if data.get("id") == 2:
                print("PING FROM MOBILE RESULT:")
                print(json.dumps(data.get("result", {}).get("result", {}).get("value"), indent=2))
                break

asyncio.run(test_mobile_ws())
