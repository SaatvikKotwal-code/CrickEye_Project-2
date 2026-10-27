import asyncio
import json
import urllib.request
import websockets

async def check():
    targets = json.loads(urllib.request.urlopen("http://127.0.0.1:9222/json").read().decode())
    page = next(t for t in targets if t.get("type") == "page")
    async with websockets.connect(page["webSocketDebuggerUrl"]) as devtools_ws:
        eval_payload = {
            "id": 1,
            "method": "Runtime.evaluate",
            "params": {
                "expression": """
                (function() {
                    if (typeof connectWebSocket === 'function') {
                        connectWebSocket();
                    }
                    return {
                        wsDot: document.getElementById('wsText')?.textContent,
                        wsState: typeof ws !== 'undefined' && ws ? ws.readyState : 'no ws',
                        wsUrl: typeof ws !== 'undefined' && ws ? ws.url : null,
                        currentSection: document.querySelector('.mobile-screen-active')?.dataset.section || 'default',
                        apiBase: typeof getApiBaseUrl === 'function' ? getApiBaseUrl() : null
                    };
                })()
                """,
                "returnByValue": True
            }
        }
        await devtools_ws.send(json.dumps(eval_payload))
        while True:
            resp = json.loads(await devtools_ws.recv())
            if resp.get("id") == 1:
                print("PHONE APP STATUS:", json.dumps(resp.get("result", {}).get("result", {}).get("value"), indent=2))
                break

if __name__ == "__main__":
    asyncio.run(check())
