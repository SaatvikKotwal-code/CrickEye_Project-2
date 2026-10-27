import asyncio
import json
import urllib.request
import websockets

async def check():
    targets = json.loads(urllib.request.urlopen("http://127.0.0.1:9222/json").read().decode())
    page = next(t for t in targets if t.get("type") == "page")
    async with websockets.connect(page["webSocketDebuggerUrl"]) as ws:
        expr = """
        (() => {
            const allElements = Array.from(document.querySelectorAll('*'));
            const matching = allElements
                .filter(el => (el.innerText || '').toLowerCase().includes('disconnected') || (el.innerText || '').toLowerCase().includes('retrying'))
                .map(el => ({
                    tag: el.tagName,
                    id: el.id,
                    className: el.className,
                    text: el.innerText
                }));
            return {
                matching,
                wsText: document.getElementById('wsText')?.textContent,
                wsDot: document.getElementById('wsDot')?.className,
                mobileWsDot: document.getElementById('mobileWsDot')?.className,
                mobileWsText: document.getElementById('mobileWsText')?.textContent,
                statusBadge: document.getElementById('statusBadge')?.textContent,
                wsState: typeof ws !== 'undefined' && ws ? ws.readyState : null
            };
        })()
        """
        await ws.send(json.dumps({
            "id": 1,
            "method": "Runtime.evaluate",
            "params": {"expression": expr, "returnByValue": True}
        }))
        res = json.loads(await ws.recv())
        print("DOM SEARCH:", json.dumps(res.get("result", {}).get("result", {}).get("value"), indent=2))

asyncio.run(check())
