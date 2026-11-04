import asyncio, json, urllib.request, websockets

async def check():
    targets = json.loads(urllib.request.urlopen('http://localhost:9222/json').read())
    page = [t for t in targets if t.get('type') == 'page'][0]
    async with websockets.connect(page['webSocketDebuggerUrl']) as ws:
        msg = {'id': 1, 'method': 'Runtime.evaluate', 'params': {'expression': 'fetch("file:///android_asset/components/ReportModal.js").then(r => r.text()).then(t => t.includes("toggleGraphZoom"))', 'awaitPromise': True}}
        await ws.send(json.dumps(msg))
        res = await ws.recv()
        print('Fetch result:', json.loads(res)['result']['result']['value'])

asyncio.run(check())
