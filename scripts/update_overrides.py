import re

path = r'c:\Users\HP\Downloads\CrickEye_Project-3\CrickEye_Project-2\analyse_session.py'

with open(path, 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add SHOT_OVERRIDES definition if not present
if 'SHOT_OVERRIDES = {' not in code:
    code = code.replace(
        "CONF_THRESHOLD           = 0.28\n",
        "CONF_THRESHOLD           = 0.28\n\n# User-specified shot hardcodes / overrides (1-indexed shot number -> {'label': ..., 'conf': ...})\nSHOT_OVERRIDES = {\n    1: {'label': 'cover', 'conf': 0.88},\n    5: {'label': 'flick', 'conf': 0.86},\n    6: {'label': 'sweep', 'conf': 0.85},\n}\n"
    )

# 2. Add override logic in classify_all_shots if not present
override_block = """        label, conf, probs = classify_shot(shot_classifier, clip, device)
        del clip
        ts = f"{int(onset_frame/fps//60):02d}:{onset_frame/fps%60:05.2f}"

        shot_num = i + 1
        if shot_num in SHOT_OVERRIDES:
            ov = SHOT_OVERRIDES[shot_num]
            label = ov.get('label', label)
            conf = float(ov.get('conf', 0.85))
            if label in SHOT_CLASSES:
                c_idx = SHOT_CLASSES.index(label)
                p_arr = [0.03] * len(SHOT_CLASSES)
                p_arr[c_idx] = conf
                probs = p_arr"""

old_block = """        label, conf, probs = classify_shot(shot_classifier, clip, device)
        del clip
        ts = f"{int(onset_frame/fps//60):02d}:{onset_frame/fps%60:05.2f}\""""

if 'if shot_num in SHOT_OVERRIDES:' not in code:
    assert old_block in code, "old_block not found in analyse_session.py"
    code = code.replace(old_block, override_block, 1)

# 3. Ensure ws_emit uses _to_jsonable
ws_emit_old = """def ws_emit(ws, loop, payload: dict):
    if ws is None or loop is None:
        return
    future = asyncio.run_coroutine_threadsafe(ws.send_json(payload), loop)"""

ws_emit_new = """def ws_emit(ws, loop, payload: dict):
    if ws is None or loop is None:
        return
    safe_payload = _to_jsonable(payload) if isinstance(payload, dict) else payload
    future = asyncio.run_coroutine_threadsafe(ws.send_json(safe_payload), loop)"""

if ws_emit_old in code:
    code = code.replace(ws_emit_old, ws_emit_new, 1)

with open(path, 'w', encoding='utf-8') as f:
    f.write(code)

print("analyse_session.py updated successfully.")

