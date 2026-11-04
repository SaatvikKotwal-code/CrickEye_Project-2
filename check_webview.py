import asyncio
import json
import urllib.request
import websockets

async def check():
    targets = json.loads(urllib.request.urlopen("http://localhost:9222/json").read())
    page = [t for t in targets if t.get("type") == "page"][0]
    ws_url = page["webSocketDebuggerUrl"]
    async with websockets.connect(ws_url) as ws:
        msg = {
            "id": 1,
            "method": "Runtime.evaluate",
            "params": {
                "expression": 'document.querySelector(".apk-download-box") ? document.querySelector(".apk-download-box").outerHTML : "NOT FOUND"'
            }
        }
        await ws.send(json.dumps(msg))
        res = await ws.recv()
        print("HTML:", json.loads(res)["result"]["result"]["value"])

asyncio.run(check())
