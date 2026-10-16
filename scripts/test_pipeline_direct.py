import asyncio
import json
import websockets

async def test_start():
    uri = "ws://localhost:8000/ws"
    async with websockets.connect(uri) as ws:
        print("Connected.")
        msg = {"action": "start", "video_path": "uploads/a883b2c7b75642a78f523b7661dd00b8/video.mp4"}
        await ws.send(json.dumps(msg))
        print("Sent start message. Waiting for responses...")
        for _ in range(10):
            try:
                resp = await asyncio.wait_for(ws.recv(), timeout=10.0)
                print("WS MESSAGE:", resp)
                data = json.loads(resp)
                if data.get("type") in ("error", "complete"):
                    break
            except asyncio.TimeoutError:
                print("Timeout waiting for message")
                break

asyncio.run(test_start())
