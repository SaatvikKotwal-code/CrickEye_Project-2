import asyncio
import json
import websockets
import urllib.request

async def get_logs():
    pages = json.loads(urllib.request.urlopen("http://127.0.0.1:9222/json/list").read())
    ws_url = pages[0]["webSocketDebuggerUrl"]

    async with websockets.connect(ws_url) as ws:
        await ws.send(json.dumps({"id": 1, "method": "Runtime.enable"}))
        check_script = """
        ({
            wsState: typeof ws !== 'undefined' && ws ? {
                readyState: ws.readyState,
                url: ws.url,
                bufferedAmount: ws.bufferedAmount
            } : 'no ws',
            fileInput: document.getElementById('videoInput')?.files?.length,
            fileName: document.getElementById('videoInput')?.files?.[0]?.name,
            fileSize: document.getElementById('videoInput')?.files?.[0]?.size,
            processingOverlay: !!document.getElementById('processingOverlay'),
            startPanel: !!document.getElementById('startPanel'),
            activeSessionId: typeof activeSessionId !== 'undefined' ? activeSessionId : null
        })
        """
        await ws.send(json.dumps({
            "id": 2,
            "method": "Runtime.evaluate",
            "params": {"expression": check_script, "returnByValue": True}
        }))

        while True:
            resp = await asyncio.wait_for(ws.recv(), timeout=5.0)
            data = json.loads(resp)
            if data.get("id") == 2:
                print("EVAL RESULT:")
                print(json.dumps(data.get("result", {}).get("result", {}).get("value"), indent=2))
                break

asyncio.run(get_logs())
