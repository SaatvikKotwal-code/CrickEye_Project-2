import json
import os
import sys
from pathlib import Path

os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "max_split_size_mb:128,garbage_collection_threshold:0.8")

# Ensure project root is importable.
BASE_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(BASE_DIR))

import analyse_session as ce  # noqa: E402


def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: python yolo_runner.py <video_path> <output_video_path>"}))
        sys.exit(1)

    video_path = sys.argv[1]
    output_path = sys.argv[2]

    # Keep pipeline untouched: call existing entrypoint directly.
    ce.run_pipeline(video_path=video_path, output_path=output_path)

    json_path = BASE_DIR / "data" / "session_report.json"
    if not json_path.exists():
        print(json.dumps({"error": f"Missing result JSON at {json_path}"}))
        sys.exit(1)

    with open(json_path, "r", encoding="utf-8") as f:
        results = json.load(f)

    # Stable marker so Node can parse JSON even when pipeline logs are noisy.
    print("__RESULT__" + json.dumps(results))


if __name__ == "__main__":
    main()
