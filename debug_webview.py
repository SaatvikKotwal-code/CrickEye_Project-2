import asyncio
import json
import urllib.request
import websockets

async def inspect():
    targets = json.loads(urllib.request.urlopen("http://localhost:9222/json").read())
    page = [t for t in targets if t.get("type") == "page"][0]
    ws_url = page["webSocketDebuggerUrl"]
    async with websockets.connect(ws_url) as ws:
        # Check what index.html loaded
        script = """
        (function() {
            var scripts = Array.from(document.querySelectorAll('script')).map(s => s.src || s.innerHTML.slice(0, 50));
            var rmText = typeof ReportModal !== 'undefined' ? ReportModal.buildPlayCardSectionHtml.toString() : 'NO_RM';
            var hasZoom = typeof window.toggleGraphZoom === 'function';
            var cardScoreBox = document.querySelector('.rp-length-dcard-score-row');
            return {
                scripts: scripts,
                hasZoomFn: hasZoom,
                scoreBoxHtml: cardScoreBox ? cardScoreBox.outerHTML : 'NONE'
            };
        })()
        """
        msg = {
            "id": 1,
            "method": "Runtime.evaluate",
            "params": {
                "expression": script,
                "returnByValue": True
            }
        }
        await ws.send(json.dumps(msg))
        res = await ws.recv()
        val = json.loads(res)["result"]["result"]["value"]
        print(json.dumps(val, indent=2))

asyncio.run(inspect())
