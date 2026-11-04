import sys
import os

os.chdir(r"c:\Users\HP\Downloads\CrickEye_Project-3\CrickEye_Project-2")
import uvicorn

if __name__ == "__main__":
    print("[Server] Starting uvicorn on 0.0.0.0:8000...", flush=True)
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, log_level="info")
