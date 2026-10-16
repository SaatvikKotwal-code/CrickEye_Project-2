import asyncio
import json
import websockets

async def test_ws():
    try:
        async with websockets.connect("ws://localhost:8000/ws") as ws:
            print("Connected to ws://localhost:8000/ws")
            await ws.send(json.dumps({"action": "ping"}))
            resp = await asyncio.wait_for(ws.recv(), timeout=3.0)
            print("Received:", resp)
    except Exception as e:
        print("Error:", e)

asyncio.run(test_ws())
