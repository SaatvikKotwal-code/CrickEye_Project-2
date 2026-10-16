import os
import sys
import asyncio
from pathlib import Path

BASE_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BASE_DIR))

import analyse_session as ce

class MockWS:
    async def send_json(self, data):
        print("MOCK WS MSG:", data.get("type"), data.get("stage"), data.get("pct"), data.get("message", "")[:60])

async def test():
    ws = MockWS()
    loop = asyncio.get_running_loop()
    video_path = str(BASE_DIR / "uploads" / "a883b2c7b75642a78f523b7661dd00b8" / "video.mp4")
    print("Testing with video:", video_path)
    print("Exists?", os.path.exists(video_path))
    
    # Run synchronously like main.py does in executor
    ce.run_pipeline_ws_sync(video_path, ws, loop)

if __name__ == "__main__":
    asyncio.run(test())
