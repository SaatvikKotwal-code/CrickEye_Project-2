import asyncio, json, urllib.request, websockets

async def check():
    targets = json.loads(urllib.request.urlopen('http://localhost:9222/json').read())
    page = [t for t in targets if t.get('type') == 'page'][0]
    async with websockets.connect(page['webSocketDebuggerUrl']) as ws:
        msg = {'id': 1, 'method': 'Runtime.evaluate', 'params': {'expression': 'Boolean(document.querySelector(".rp-graph-actions"))'}}
        await ws.send(json.dumps(msg))
        res = await ws.recv()
        print('rp-graph-actions in DOM when opened:', json.loads(res)['result']['result']['value'])

asyncio.run(check())
