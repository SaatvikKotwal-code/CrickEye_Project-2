import asyncio
import json
import urllib.request
import websockets

async def inspect():
    targets = json.loads(urllib.request.urlopen("http://localhost:9222/json").read())
    page = [t for t in targets if t.get("type") == "page"][0]
    ws_url = page["webSocketDebuggerUrl"]
    async with websockets.connect(ws_url) as ws:
        msg = {
            "id": 1,
            "method": "Runtime.evaluate",
            "params": {
                "expression": "document.querySelector('.pc-zones-trends') ? document.querySelector('.pc-zones-trends').innerHTML.slice(0, 1000) : 'NO TRENDS IN DOM'",
                "returnByValue": True
            }
        }
        await ws.send(json.dumps(msg))
        res = await ws.recv()
        val = json.loads(res)["result"]["result"]["value"]
        print(val)

asyncio.run(inspect())
