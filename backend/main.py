"""
CrickEye Dashboard — FastAPI Backend  (main.py)
Compatible with analyse_session.py v6.1

Run from the crickeye-dashboard-combined/ folder:
    uvicorn backend.main:app --reload --port 8000
Then open: http://localhost:8000

v6.4 changes:
  - POST /upload  — accepts a video file, saves it to
    uploads/session_<uuid>/video.<ext>, returns the server-side path.
  - GET /uploads/{...} — serves files from the uploads/ folder with Range
    support so the annotated output video streams correctly in the browser.

All uploads run the real pipeline; playback uses the generated annotated video
under /assets/analysed_out.mp4 (see analyse_session.py).
"""

import asyncio
import json
import logging
import mimetypes
import os
import subprocess
import sys
import uuid
from pathlib import Path

from dotenv import load_dotenv
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse, Response, JSONResponse
from fastapi.staticfiles import StaticFiles

# ── Suppress Windows WinError 10054 noise ────────────────────────────────────
logging.getLogger("asyncio").setLevel(logging.CRITICAL)

# ── Path setup ────────────────────────────────────────────────────────────────
BASE_DIR    = Path(__file__).parent.parent   # crickeye-dashboard-combined/
UPLOADS_DIR = BASE_DIR / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

# Load backend/.env so SUPABASE_* (and other vars) are available to FastAPI.
load_dotenv(BASE_DIR / "backend" / ".env")
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "expandable_segments:True,garbage_collection_threshold:0.8")

sys.path.insert(0, str(BASE_DIR))

from pipeline_cache_version import ANALYSIS_CACHE_VERSION

# ── Dedicated thread pool ─────────────────────────────────────────────────────
_executor = ThreadPoolExecutor(max_workers=1)

app = FastAPI(title="CrickEye Pro")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*", "Range"],
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"],
)

# Static mounts
app.mount("/components", StaticFiles(directory=str(BASE_DIR / "components")), name="components")
app.mount("/data",       StaticFiles(directory=str(BASE_DIR / "data")),       name="data")


# ── Frontend files ─────────────────────────────────────────────────────────────

@app.get("/")
async def serve_index():
    return FileResponse(str(BASE_DIR / "index.html"))

@app.get("/style.css")
async def serve_css():
    return FileResponse(str(BASE_DIR / "style.css"))

@app.get("/app.js")
async def serve_appjs():
    # Repo uses App.js on disk; keep /app.js URL for index.html
    for name in ("App.js", "app.js"):
        p = BASE_DIR / name
        if p.is_file():
            return FileResponse(str(p), media_type="application/javascript")
    return FileResponse(str(BASE_DIR / "App.js"), media_type="application/javascript")


@app.get("/config.js")
async def serve_config_js():
    """Frontend Supabase config; use config.js (gitignored) or fall back to example."""
    custom = BASE_DIR / "config.js"
    if custom.exists():
        return FileResponse(str(custom), media_type="application/javascript")
    return FileResponse(str(BASE_DIR / "config.example.js"), media_type="application/javascript")


@app.get("/download/apk")
async def download_apk():
    """Serve the compiled CrickEye Pro Android APK for mobile devices."""
    candidates = [
        BASE_DIR / "CrickEye-Pro.apk",
        BASE_DIR / "android" / "app" / "build" / "outputs" / "apk" / "debug" / "app-debug.apk",
    ]
    for apk_path in candidates:
        if apk_path.exists():
            return FileResponse(
                path=str(apk_path),
                filename="CrickEye-Pro.apk",
                media_type="application/vnd.android.package-archive"
            )
    return JSONResponse(
        status_code=404,
        content={"error": "APK not found yet. Please compile the APK or check the project root."}
    )


@app.get("/api/public-config")
async def public_config():
    """
    Public Supabase settings for the browser (anon key only — never expose service role).
    Values come from backend/.env: SUPABASE_URL, SUPABASE_ANON_KEY.
    """
    return {
        "supabaseUrl": os.getenv("SUPABASE_URL", "").strip(),
        "supabaseAnonKey": os.getenv("SUPABASE_ANON_KEY", "").strip(),
        # Single source of truth: pipeline_cache_version.py (bump when analyser changes).
        "analysisCacheVersion": ANALYSIS_CACHE_VERSION,
    }


@app.post("/llm-insights")
async def llm_insights_proxy(request: Request):
    """
    Forwards LLM insight requests to the Node backend on port 8080 if running,
    or falls back gracefully so the client UI remains functional.
    """
    try:
        body = await request.json()
    except Exception:
        body = {}

    def _call_node():
        import urllib.request
        node_port = int(os.getenv("PORT", "8080"))
        url = f"http://127.0.0.1:{node_port}/llm-insights"
        req = urllib.request.Request(
            url,
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode("utf-8"))

    loop = asyncio.get_event_loop()
    try:
        data = await loop.run_in_executor(None, _call_node)
        return data
    except Exception as err:
        return {"ok": True, "llm_insights": None, "fallback_used": True, "error": str(err)}


# ── WebM → MP4 conversion helper ──────────────────────────────────────────────

def _get_ffmpeg_exe() -> str:
    """Return path to a usable ffmpeg binary (bundled via imageio-ffmpeg or system PATH)."""
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        pass
    # Fallback: system ffmpeg
    import shutil
    path = shutil.which("ffmpeg")
    if path:
        return path
    raise FileNotFoundError(
        "ffmpeg not found. Install imageio-ffmpeg (`pip install imageio-ffmpeg`) "
        "or add ffmpeg to your system PATH."
    )


def _convert_webm_to_mp4(src: Path) -> Path:
    """
    Convert a .webm file to .mp4 (H.264) so OpenCV can reliably read it.
    Returns the path to the new .mp4 file.  Raises on failure.
    """
    dst = src.with_suffix(".mp4")
    ffmpeg = _get_ffmpeg_exe()
    cmd = [
        ffmpeg,
        "-y",                   # overwrite output
        "-i", str(src),         # input
        "-c:v", "libx264",      # H.264 video codec
        "-preset", "ultrafast", # fast encoding (quality is fine for analysis)
        "-pix_fmt", "yuv420p",  # broad compatibility
        "-an",                  # drop audio (not needed for cricket analysis)
        str(dst),
    ]
    print(f"[CrickEye] Converting WebM -> MP4: {src.name} -> {dst.name}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0 or not dst.exists() or dst.stat().st_size == 0:
        stderr_tail = (result.stderr or "")[-500:]
        raise RuntimeError(
            f"WebM -> MP4 conversion failed (exit {result.returncode}): {stderr_tail}"
        )
    print(f"[CrickEye] Conversion done: {dst.stat().st_size:,} bytes")
    # Remove the original .webm to save disk space
    try:
        src.unlink()
    except OSError:
        pass
    return dst


# ── File upload endpoint ───────────────────────────────────────────────────────

@app.post("/upload")
async def upload_video(file: UploadFile = File(...)):
    """Accepts a video upload. Returns session_id and video_path for the WebSocket pipeline."""
    original_name = file.filename or "video.mp4"
    ext           = Path(original_name).suffix or ".mp4"

    session_id  = uuid.uuid4().hex
    session_dir = UPLOADS_DIR / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    dest = session_dir / f"video{ext}"

    # Stream-write to avoid loading the whole file into RAM
    with open(dest, "wb") as out:
        while True:
            chunk = await file.read(1 << 20)   # 1 MB chunks
            if not chunk:
                break
            out.write(chunk)

    file_size = dest.stat().st_size

    # ── Guard: reject empty (0-byte) uploads ──────────────────────────────
    if file_size == 0:
        # Clean up the empty file and directory
        try:
            dest.unlink()
            session_dir.rmdir()
        except OSError:
            pass
        print(f"[CrickEye Upload] REJECTED empty file: session={session_id}")
        return JSONResponse(
            status_code=400,
            content={"error": "The uploaded video file is empty (0 bytes). "
                     "If using the webcam, please ensure the recording completes before submitting."},
        )

    print(
        f"[CrickEye Upload] session={session_id}  file={dest}  "
        f"size={file_size:,} bytes"
    )

    # ── Convert .webm → .mp4 for reliable OpenCV processing ───────────────
    if ext.lower() == ".webm":
        try:
            dest = _convert_webm_to_mp4(dest)
        except Exception as conv_err:
            print(f"[CrickEye Upload] WebM conversion failed: {conv_err}")
            return JSONResponse(
                status_code=422,
                content={"error": f"Could not convert WebM video to MP4: {conv_err}. "
                         "Try uploading an MP4 file instead."},
            )

    relative_path = str(dest.relative_to(BASE_DIR))

    return {"session_id": session_id, "video_path": relative_path}


# ── Range-aware file server ────────────────────────────────────────────────────

def _range_response(file_path: Path, request: Request):
    if not file_path.exists():
        return Response(status_code=404)

    file_size = file_path.stat().st_size
    mime, _   = mimetypes.guess_type(str(file_path))
    mime      = mime or "application/octet-stream"
    if file_path.suffix.lower() == ".mp4":
        mime = "video/mp4"
    range_header = request.headers.get("Range")

    if not range_header:
        return FileResponse(
            str(file_path), media_type=mime,
            headers={"Accept-Ranges": "bytes"}
        )

    try:
        range_val          = range_header.strip().replace("bytes=", "")
        start_str, end_str = range_val.split("-")
        start = int(start_str) if start_str else 0
        end   = int(end_str)   if end_str   else file_size - 1
    except Exception:
        return Response(status_code=416)

    start = max(0, min(start, file_size - 1))
    end   = max(start, min(end, file_size - 1))
    chunk = end - start + 1

    def iter_file(path: str, s: int, length: int, buf: int = 1 << 16):
        with open(path, "rb") as f:
            f.seek(s)
            remaining = length
            while remaining > 0:
                data = f.read(min(buf, remaining))
                if not data:
                    break
                remaining -= len(data)
                yield data

    headers = {
        "Content-Range":  f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges":  "bytes",
        "Content-Length": str(chunk),
        "Content-Type":   mime,
    }
    return StreamingResponse(
        iter_file(str(file_path), start, chunk),
        status_code=206, headers=headers, media_type=mime,
    )


@app.get("/assets/{filename:path}")
async def serve_asset(filename: str, request: Request):
    return _range_response(BASE_DIR / "assets" / filename, request)


@app.get("/uploads/{filepath:path}")
async def serve_upload(filepath: str, request: Request):
    return _range_response(UPLOADS_DIR / filepath, request)


# ── WebSocket pipeline endpoint ────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("[CrickEye Server] Client connected")

    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)

            if msg.get("action") == "start":
                video_path = msg.get("video_path", "").strip()

                if not video_path:
                    await websocket.send_json({"type": "error", "message": "No video path provided."})
                    continue

                if not os.path.isabs(video_path):
                    video_path = str(BASE_DIR / video_path)

                if not os.path.exists(video_path):
                    await websocket.send_json({"type": "error", "message": f"Video not found: {video_path}"})
                    continue

                await _run_pipeline(video_path, websocket)

            elif msg.get("action") == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        print("[CrickEye Server] Client disconnected")
    except Exception as e:
        print(f"[CrickEye Server] Error: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass


# ── Real pipeline runner ───────────────────────────────────────────────────────

async def _run_pipeline(video_path: str, websocket: WebSocket):
    try:
        import analyse_session as ce
    except Exception as e:
        err_msg = str(e)
        if "paging file is too small" in err_msg.lower() or "1455" in err_msg:
            err_msg = (
                "Windows paging file / virtual memory is exhausted or disabled. "
                "Please run enable_virtual_memory.bat as Administrator (or enable 'Automatically manage paging file' in Windows Settings) and restart your machine."
            )
        print(f"[CrickEye Server] Pipeline import error: {err_msg}")
        try:
            await websocket.send_json({"type": "error", "message": err_msg})
        except Exception:
            pass
        return

    loop = asyncio.get_event_loop()

    def _blocking():
        # Quieter server console: progress still sent over the WebSocket.
        os.environ.setdefault("CRICKEYE_QUIET", "1")
        os.environ.setdefault("YOLO_VERBOSE", "false")
        ce.run_pipeline_ws_sync(video_path, websocket, loop)

    try:
        await loop.run_in_executor(_executor, _blocking)
    except Exception as e:
        import traceback
        traceback.print_exc()
        try:
            await websocket.send_json({"type": "error", "message": f"Pipeline error: {str(e)}"})
        except Exception:
            pass