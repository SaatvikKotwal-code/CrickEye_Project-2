import os

# 1. Update analyse_session.py
p_py = r'c:\Users\HP\Downloads\CrickEye_Project-3\CrickEye_Project-2\analyse_session.py'
with open(p_py, 'r', encoding='utf-8') as f:
    code = f.read()

is_crlf = '\r\n' in code
code_norm = code.replace('\r\n', '\n')

old_code = """        if is_peak:
            e  = frame_to_shot.get(frame_idx)
            if e:
                lc  = (CLASS_COLS.get(e['label'], COL_GREEN)
                       if e['conf'] >= CONF_THRESHOLD else COL_RED)
                ovl = out.copy()
                cv2.rectangle(ovl, (0,0), (orig_w, orig_h), (0,60,200), -1)
                cv2.addWeighted(ovl, 0.18, out, 0.82, 0, out)
                # CALIBRATION: overlay shows km/h
                spd = e.get('peak_swing_speed', 0)
                pt  = f"  {e['label'].upper()}  {e['conf']*100:.0f}%  {spd:.0f}km/h  "
                pw  = len(pt)*11 + 10
                cv2.rectangle(out, (8, 8), (8+pw, 46), lc, -1, cv2.LINE_AA)
                cv2.putText(out, pt, (12, 36), FONT, 0.75, (0,0,0), 2, cv2.LINE_AA)
                display_label = e['_display_num'] if e['_display_num'] else f"~{e['shot_num']}"
                draw_label(out, f"#{display_label}", (10, 68),
                           (0,80,255), scale=0.52, thickness=1)

        elif in_clip:
            e  = frame_to_shot[frame_idx]
            if e['conf'] >= CONF_THRESHOLD:
                lc  = CLASS_COLS.get(e['label'], COL_GREEN)
                ovl = out.copy()
                cv2.rectangle(ovl, (0,0), (orig_w, 44), (0,0,0), -1)
                cv2.addWeighted(ovl, 0.5, out, 0.5, 0, out)
                pt  = f"  {e['label'].upper()}  {e['conf']*100:.0f}%  "
                pw  = len(pt)*10 + 10
                cv2.rectangle(out, (8,5), (8+pw, 38), lc, -1, cv2.LINE_AA)
                cv2.putText(out, pt, (12, 28), FONT, 0.60, (0,0,0), 2, cv2.LINE_AA)"""

new_code = """        if is_peak:
            e  = frame_to_shot.get(frame_idx)
            if e:
                ovl = out.copy()
                cv2.rectangle(ovl, (0,0), (orig_w, orig_h), (0,60,200), -1)
                cv2.addWeighted(ovl, 0.18, out, 0.82, 0, out)
                spd = e.get('peak_swing_speed', 0)
                label_disp = {'straight': 'STRAIGHT DRIVE', 'cover': 'COVER DRIVE', 'pull': 'PULL SHOT', 'flick': 'FLICK', 'sweep': 'SWEEP'}.get(e['label'], e['label'].upper())
                pt = f"{label_disp}  {e['conf']*100:.0f}%  {spd:.0f}km/h" if spd > 0 else f"{label_disp}  {e['conf']*100:.0f}%"
                
                # Single prediction badge in lower left corner with white background and black text
                (tw, th), _ = cv2.getTextSize(pt, FONT, 0.75, 2)
                pad_x, pad_y = 16, 10
                bx1 = 20
                by2 = orig_h - 35
                by1 = by2 - (th + 2 * pad_y)
                bx2 = bx1 + (tw + 2 * pad_x)
                cv2.rectangle(out, (bx1, by1), (bx2, by2), (255, 255, 255), -1, cv2.LINE_AA)
                cv2.rectangle(out, (bx1, by1), (bx2, by2), (40, 40, 40), 1, cv2.LINE_AA)
                cv2.putText(out, pt, (bx1 + pad_x, by1 + pad_y + th), FONT, 0.75, (0, 0, 0), 2, cv2.LINE_AA)

        elif in_clip:
            e  = frame_to_shot[frame_idx]
            if e['conf'] >= CONF_THRESHOLD:
                spd = e.get('peak_swing_speed', 0)
                label_disp = {'straight': 'STRAIGHT DRIVE', 'cover': 'COVER DRIVE', 'pull': 'PULL SHOT', 'flick': 'FLICK', 'sweep': 'SWEEP'}.get(e['label'], e['label'].upper())
                pt = f"{label_disp}  {e['conf']*100:.0f}%  {spd:.0f}km/h" if spd > 0 else f"{label_disp}  {e['conf']*100:.0f}%"
                
                # Single prediction badge in lower left corner with white background and black text
                (tw, th), _ = cv2.getTextSize(pt, FONT, 0.75, 2)
                pad_x, pad_y = 16, 10
                bx1 = 20
                by2 = orig_h - 35
                by1 = by2 - (th + 2 * pad_y)
                bx2 = bx1 + (tw + 2 * pad_x)
                cv2.rectangle(out, (bx1, by1), (bx2, by2), (255, 255, 255), -1, cv2.LINE_AA)
                cv2.rectangle(out, (bx1, by1), (bx2, by2), (40, 40, 40), 1, cv2.LINE_AA)
                cv2.putText(out, pt, (bx1 + pad_x, by1 + pad_y + th), FONT, 0.75, (0, 0, 0), 2, cv2.LINE_AA)"""

assert old_code in code_norm, "old_code block not found in analyse_session.py"
code_norm = code_norm.replace(old_code, new_code, 1)

with open(p_py, 'w', encoding='utf-8') as f:
    f.write(code_norm.replace('\n', '\r\n') if is_crlf else code_norm)

print("Updated analyse_session.py successfully.")

# 2. Update style.css
p_css = r'c:\Users\HP\Downloads\CrickEye_Project-3\CrickEye_Project-2\style.css'
with open(p_css, 'r', encoding='utf-8') as f:
    css = f.read()

old_hud_bl = ".hud-bl { bottom:0; left:0; border-top-right-radius: var(--radius-sm); color: var(--green); }"
new_hud_bl = ".hud-bl { bottom:0; left:0; border-top-right-radius: var(--radius-sm); color: var(--green); display: none !important; }"

assert old_hud_bl in css, "old_hud_bl not found in style.css"
css = css.replace(old_hud_bl, new_hud_bl, 1)

with open(p_css, 'w', encoding='utf-8') as f:
    f.write(css)

print("Updated style.css successfully.")

# 3. Update index.html
p_html = r'c:\Users\HP\Downloads\CrickEye_Project-3\CrickEye_Project-2\index.html'
with open(p_html, 'r', encoding='utf-8') as f:
    html = f.read()

old_html_bl = '<div class="hud-corner hud-bl">SHOT: <span id="hudShot">'
new_html_bl = '<div class="hud-corner hud-bl" style="display: none !important;">SHOT: <span id="hudShot">'

assert old_html_bl in html, "old_html_bl not found in index.html"
html = html.replace(old_html_bl, new_html_bl, 1)

with open(p_html, 'w', encoding='utf-8') as f:
    f.write(html)

print("Updated index.html successfully.")
