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

v6.5 changes:
  - Demo fast-path: if the uploaded filename matches a known demo video
    (net_session_video.mp4 or net_session_left.mp4), the WebSocket handler
    calls replay_demo_pipeline() instead of the real pipeline.
  - replay_demo_pipeline() reads the pre-saved JSON + uses the pre-rendered
    annotated video, sleeps ~12 s while emitting realistic stage/progress
    messages, then batch-emits all shots + complete — identical shape to the
    real pipeline so the frontend needs zero changes.
  - Demo JSON files live at:  data/net_session_video_demo.json
                               data/net_session_left_demo.json
  - Demo output videos live at: assets/net_session_video_out.mp4
                                 assets/net_session_left_out.mp4
    (rename/copy your existing analysed_out.mp4 for each video)
  - Everything else (real pipeline, asset serving) is unchanged from v6.4.
"""

import asyncio
import json
import logging
import mimetypes
import os
import sys
import uuid
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse, Response
from fastapi.staticfiles import StaticFiles

# ── Suppress Windows WinError 10054 noise ────────────────────────────────────
logging.getLogger("asyncio").setLevel(logging.CRITICAL)

# ── Path setup ────────────────────────────────────────────────────────────────
BASE_DIR    = Path(__file__).parent.parent   # crickeye-dashboard-combined/
UPLOADS_DIR = BASE_DIR / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

sys.path.insert(0, str(BASE_DIR))

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


# ── Demo fast-path config ─────────────────────────────────────────────────────
#
# Keys   = original uploaded filename (matched case-insensitively)
# Values = pre-saved JSON path  +  browser-accessible video URL
#
# Setup steps:
#   1. Copy/rename your analysed_out.mp4 for each demo video:
#        assets/net_session_video_out.mp4
#        assets/net_session_left_out.mp4
#   2. Save the pipeline JSON output for each video:
#        data/net_session_video_demo.json
#        data/net_session_left_demo.json
#      (the JSON you already have in data/session_report.json is the right format)
#
DEMO_FILES = {
    "net_session_video.mp4": {
        "json_path":    BASE_DIR / "data"   / "net_session_video_demo.json",
        "output_video": "/assets/net_session_video_out.mp4",
    },
    "net_session_left.mp4": {
        "json_path":    BASE_DIR / "data"   / "net_session_left_demo.json",
        "output_video": "/assets/net_session_left_out.mp4",
    },
}

SHOT_CLASSES = ['cover', 'flick', 'pull', 'straight', 'sweep']


# ── Frontend files ─────────────────────────────────────────────────────────────

@app.get("/")
async def serve_index():
    return FileResponse(str(BASE_DIR / "index.html"))

@app.get("/style.css")
async def serve_css():
    return FileResponse(str(BASE_DIR / "style.css"))

@app.get("/app.js")
async def serve_appjs():
    return FileResponse(str(BASE_DIR / "app.js"))


# ── File upload endpoint ───────────────────────────────────────────────────────

@app.post("/upload")
async def upload_video(file: UploadFile = File(...)):
    """
    Accepts a video upload from the browser.

    If the filename matches a known demo video the response includes a
    `demo_key` field so the WebSocket handler can skip the real pipeline.

    Returns:
        {
          "session_id":  "...",
          "video_path":  "uploads/<id>/video.<ext>",
          "demo_key":    "net_session_video.mp4"   ← only present for demo files
        }
    """
    original_name = file.filename or "video.mp4"
    ext           = Path(original_name).suffix or ".mp4"
    demo_key      = original_name.lower()

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

    relative_path = str(dest.relative_to(BASE_DIR))
    is_demo       = demo_key in DEMO_FILES

    print(
        f"[CrickEye Upload] session={session_id}  file={dest}  "
        f"size={dest.stat().st_size:,} bytes  demo={is_demo}"
    )

    response = {"session_id": session_id, "video_path": relative_path}
    if is_demo:
        response["demo_key"] = demo_key   # tells the WS handler to use fast-path

    return response


# ── Range-aware file server ────────────────────────────────────────────────────

def _range_response(file_path: Path, request: Request):
    if not file_path.exists():
        return Response(status_code=404)

    file_size = file_path.stat().st_size
    mime, _   = mimetypes.guess_type(str(file_path))
    mime      = mime or "application/octet-stream"
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
                demo_key   = msg.get("demo_key", "").strip().lower()

                if not video_path:
                    await websocket.send_json({"type": "error", "message": "No video path provided."})
                    continue

                # ── Demo fast-path ────────────────────────────────────────
                if demo_key and demo_key in DEMO_FILES:
                    cfg = DEMO_FILES[demo_key]
                    if cfg["json_path"].exists():
                        print(f"[CrickEye] Demo fast-path → {demo_key}")
                        await _run_demo(cfg, websocket)
                        continue
                    else:
                        print(f"[CrickEye] Demo JSON not found for '{demo_key}' — falling through to real pipeline")

                # ── Real pipeline ─────────────────────────────────────────
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


# ── Demo replay pipeline ───────────────────────────────────────────────────────

async def _run_demo(cfg: dict, websocket: WebSocket):
    """
    Replays a pre-saved session in ~12 seconds, emitting the same WebSocket
    message sequence the real pipeline would produce.

    Stage timeline (total ≈ 12 s):
      0.0 s  loading
      0.5 s  keypoints  → 8 progress ticks over 4 s
      4.5 s  detection
      5.0 s  onsets_found
      5.2 s  classifying
      6.5 s  rendering  → 8 progress ticks over 4 s
     10.5 s  encoding
     11.5 s  shots + session + analysis + complete
    """
    async def emit(payload):
        await websocket.send_json(payload)

    # Load saved JSON
    with open(cfg["json_path"], "r") as f:
        data = json.load(f)

    total_frames    = data.get("total_frames", 441)
    fps             = data.get("fps", 30.0)
    handedness      = data.get("session_handedness", "RHB")
    stance_conf     = data.get("stance_conf", 1.0)
    analysis        = data.get("analysis", {})
    shots           = data.get("shots", [])
    confirmed_shots = [s for s in shots if s.get("confirmed", True)]
    unclear_count   = len(shots) - len(confirmed_shots)

    # ── loading ──────────────────────────────────────────────────────────
    await emit({"type": "stage", "stage": "loading",
                "message": "Models loaded — device: cpu"})
    await asyncio.sleep(0.5)

    # ── keypoints progress ───────────────────────────────────────────────
    await emit({"type": "stage", "stage": "keypoints",
                "message": "Pass 1 — Extracting pose keypoints…",
                "total_frames": total_frames, "fps": fps})

    for i in range(1, 9):
        await asyncio.sleep(0.5)
        frame = int((i / 8) * total_frames)
        pct   = round((i / 8) * 100, 1)
        eta   = round(0.5 * (8 - i))
        await emit({"type": "progress", "stage": "keypoints",
                    "frame": frame, "total": total_frames,
                    "pct": pct, "eta": eta})

    # ── detection ────────────────────────────────────────────────────────
    await emit({"type": "stage", "stage": "detection",
                "message": "Detecting swing windows…"})
    await asyncio.sleep(0.5)
    await emit({"type": "onsets_found", "count": len(shots)})
    await asyncio.sleep(0.2)

    # ── classifying ──────────────────────────────────────────────────────
    await emit({"type": "stage", "stage": "classifying",
                "message": f"Classifying {len(shots)} shots…",
                "total_shots": len(shots)})
    await asyncio.sleep(1.3)

    # ── rendering progress ───────────────────────────────────────────────
    await emit({"type": "stage", "stage": "rendering",
                "message": "Rendering annotated video…",
                "total_frames": total_frames})

    for i in range(1, 9):
        await asyncio.sleep(0.5)
        frame = int((i / 8) * total_frames)
        pct   = round((i / 8) * 100, 1)
        eta   = round(0.5 * (8 - i))
        await emit({"type": "progress", "stage": "rendering",
                    "frame": frame, "total": total_frames,
                    "pct": pct, "eta": eta})

    # ── encoding ─────────────────────────────────────────────────────────
    await emit({"type": "stage", "stage": "encoding",
                "message": "Re-encoding video for browser playback…"})
    await asyncio.sleep(1.0)

    # ── batch emit confirmed shots ────────────────────────────────────────
    for shot in confirmed_shots:
        await emit({
            "type":             "shot",
            "shot_num":         shot.get("display_num") or shot.get("shot_num"),
            "label":            shot["label"],
            "conf":             shot.get("confidence", 1.0),
            "confirmed":        True,
            "timestamp":        shot.get("timestamp", "00:00.00"),
            "peak_frame":       shot.get("peak_frame", 0),
            "onset_score":      shot.get("travel_px", 0),
            "handedness":       handedness,
            "stance_conf":      stance_conf,
            "peak_swing_speed": shot.get("peak_swing_speed", 0),
            "footwork":         shot.get("footwork", "neutral"),
            "footwork_conf":    shot.get("footwork_conf", "low"),
            "head_stability":   shot.get("head_stability", 50),
            "stability_score":  shot.get("stability_score", 50),
            "shot_score":       shot.get("shot_score", 5),
            "shot_quality":     shot.get("shot_quality", "Average"),
            "flags":            shot.get("flags", []),
            "probs":            shot.get("probs", {}),
        })

    # ── session + analysis ────────────────────────────────────────────────
    await emit({"type": "session", "handedness": handedness, "conf": stance_conf})
    await emit({"type": "analysis", "analysis": analysis})

    # shot counts
    counts = {cls: 0 for cls in SHOT_CLASSES}
    for s in confirmed_shots:
        lbl = s.get("label", "")
        if lbl in counts:
            counts[lbl] += 1

    avg_conf = (
        round(sum(s.get("confidence", 1.0) for s in confirmed_shots) / len(confirmed_shots), 3)
        if confirmed_shots else 0.0
    )

    # ── complete — triggers video load in frontend ─────────────────────────
    await emit({
        "type":         "complete",
        "total_shots":  len(shots),
        "confirmed":    len(confirmed_shots),
        "unclear":      unclear_count,
        "output_video": cfg["output_video"],
        "handedness":   handedness,
        "stance_conf":  stance_conf,
        "shot_counts":  counts,
        "avg_conf":     avg_conf,
        "total_frames": total_frames,
        "fps":          round(fps, 3),
        "analysis":     analysis,
    })

    print(f"[CrickEye] Demo replay complete — {len(confirmed_shots)} confirmed shots emitted.")


# ── Real pipeline runner ───────────────────────────────────────────────────────

async def _run_pipeline(video_path: str, websocket: WebSocket):
    import analyse_session as ce

    loop = asyncio.get_event_loop()

    def _blocking():
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