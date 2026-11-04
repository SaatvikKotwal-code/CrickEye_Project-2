import asyncio
import json
import urllib.request
import websockets

async def check():
    targets = json.loads(urllib.request.urlopen("http://localhost:9222/json").read())
    page = [t for t in targets if t.get("type") == "page"][0]
    ws_url = page["webSocketDebuggerUrl"]
    async with websockets.connect(ws_url) as ws:
        # Check parent of .apk-download-box and its full path
        script = """
        (function() {
            var el = document.querySelector('.apk-download-box');
            if (!el) return 'NOT FOUND IN CURRENT DOM';
            var path = [];
            var cur = el;
            while (cur) {
                path.unshift(cur.tagName + (cur.id ? '#' + cur.id : '') + (cur.className ? '.' + cur.className.split(' ').join('.') : ''));
                cur = cur.parentElement;
            }
            return path.join(' > ');
        })()
        """
        msg = {
            "id": 1,
            "method": "Runtime.evaluate",
            "params": {
                "expression": script
            }
        }
        await ws.send(json.dumps(msg))
        res = await ws.recv()
        print("Path:", json.loads(res)["result"]["result"]["value"])

asyncio.run(check())
