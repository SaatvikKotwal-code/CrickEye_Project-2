import os

p = r'C:\Users\HP\Downloads\CrickEye_Project-3\CrickEye_Project-2\analyse_session.py'
with open(p, 'r', encoding='utf-8') as f:
    text = f.read()

is_crlf = '\r\n' in text
norm = text.replace('\r\n', '\n')

old_code = """        if is_peak:
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

new_code = """        if is_peak:
            e  = frame_to_shot.get(frame_idx)
            if e:
                ovl = out.copy()
                cv2.rectangle(ovl, (0,0), (orig_w, orig_h), (0,60,200), -1)
                cv2.addWeighted(ovl, 0.18, out, 0.82, 0, out)
                spd = e.get('peak_swing_speed', 0)
                label_disp = {'straight': 'STRAIGHT DRIVE', 'cover': 'COVER DRIVE', 'pull': 'PULL SHOT', 'flick': 'FLICK', 'sweep': 'SWEEP'}.get(e['label'], e['label'].upper())
                pt = f"{label_disp}  {spd:.0f}km/h" if spd > 0 else f"{label_disp}"
                
                # Single prediction badge in lower left corner with white background and black text (increased font size, confidence removed)
                font_scale = max(1.0, round(orig_w / 800.0, 2))
                font_thick = 2 if font_scale < 1.15 else 3
                (tw, th), _ = cv2.getTextSize(pt, FONT, font_scale, font_thick)
                pad_x = int(20 * font_scale)
                pad_y = int(13 * font_scale)
                bx1 = int(22 * font_scale)
                by2 = orig_h - int(32 * font_scale)
                by1 = by2 - (th + 2 * pad_y)
                bx2 = bx1 + (tw + 2 * pad_x)
                cv2.rectangle(out, (bx1, by1), (bx2, by2), (255, 255, 255), -1, cv2.LINE_AA)
                cv2.rectangle(out, (bx1, by1), (bx2, by2), (40, 40, 40), 2, cv2.LINE_AA)
                cv2.putText(out, pt, (bx1 + pad_x, by1 + pad_y + th), FONT, font_scale, (0, 0, 0), font_thick, cv2.LINE_AA)

        elif in_clip:
            e  = frame_to_shot[frame_idx]
            if e['conf'] >= CONF_THRESHOLD:
                spd = e.get('peak_swing_speed', 0)
                label_disp = {'straight': 'STRAIGHT DRIVE', 'cover': 'COVER DRIVE', 'pull': 'PULL SHOT', 'flick': 'FLICK', 'sweep': 'SWEEP'}.get(e['label'], e['label'].upper())
                pt = f"{label_disp}  {spd:.0f}km/h" if spd > 0 else f"{label_disp}"
                
                # Single prediction badge in lower left corner with white background and black text (increased font size, confidence removed)
                font_scale = max(1.0, round(orig_w / 800.0, 2))
                font_thick = 2 if font_scale < 1.15 else 3
                (tw, th), _ = cv2.getTextSize(pt, FONT, font_scale, font_thick)
                pad_x = int(20 * font_scale)
                pad_y = int(13 * font_scale)
                bx1 = int(22 * font_scale)
                by2 = orig_h - int(32 * font_scale)
                by1 = by2 - (th + 2 * pad_y)
                bx2 = bx1 + (tw + 2 * pad_x)
                cv2.rectangle(out, (bx1, by1), (bx2, by2), (255, 255, 255), -1, cv2.LINE_AA)
                cv2.rectangle(out, (bx1, by1), (bx2, by2), (40, 40, 40), 2, cv2.LINE_AA)
                cv2.putText(out, pt, (bx1 + pad_x, by1 + pad_y + th), FONT, font_scale, (0, 0, 0), font_thick, cv2.LINE_AA)"""

assert old_code in norm, 'old_code not found in analyse_session.py'
norm = norm.replace(old_code, new_code, 1)

with open(p, 'w', encoding='utf-8') as f:
    f.write(norm.replace('\n', '\r\n') if is_crlf else norm)

print('Updated analyse_session.py successfully!')

