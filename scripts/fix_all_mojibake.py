import os
import re

def clean_text(text: str) -> str:
    # Fix corrupted middle dot
    text = text.replace('Â·', '·')
    text = text.replace('&middot;', '·')

    # Fix corrupted copyright symbol
    text = text.replace('Â©', '©')

    # Fix ellipsis (â€¦ or similar) -> ...
    text = text.replace('â€¦', '...')
    text = text.replace('…', '...')

    # Fix em dash and en dash (â€” or â€“ or â€") -> - or —
    # The user specifically said: "in connecting you can see a and something e is written here remove it from everyehere and also seen in loading page as well fix it."
    # In loading page / stats: "FRAMES —", "ETA —" -> let's use a clean ASCII "-" or "—"
    text = text.replace('â€”', '—')
    text = text.replace('â€“', '–')
    text = text.replace('â€"', '—')
    text = text.replace('â€œ', '"')
    text = text.replace('â€\x9d', '"')
    text = text.replace('â€\x9c', '"')
    text = text.replace('â€\x94', '—')
    text = text.replace('â€˜', "'")
    text = text.replace('â€™', "'")
    text = text.replace('â€¢', '•')
    text = text.replace('â†’', '→')
    text = text.replace('âœ”', '✔')
    text = text.replace('âœ–', '✖')
    text = text.replace('âš ', '⚠')
    text = text.replace('â•', '─')
    text = text.replace('â”€', '─')
    text = text.replace('â”', '─')
    text = text.replace('Â', '')

    # Any remaining â€ with following punctuation or symbol
    text = re.sub(r'â€[^\w\s]', '—', text)
    # Any stray â
    text = text.replace('â€', '—')

    return text

def process_file(filepath):
    if not os.path.exists(filepath):
        return
    with open(filepath, 'rb') as f:
        raw_bytes = f.read()

    try:
        content = raw_bytes.decode('utf-8')
    except Exception:
        content = raw_bytes.decode('latin-1')

    cleaned = clean_text(content)

    if cleaned != content:
        with open(filepath, 'w', encoding='utf-8', newline='\n') as f:
            f.write(cleaned)
        print(f"Cleaned: {filepath}")
    else:
        print(f"Already clean: {filepath}")

def main():
    base_dir = r"c:\Users\HP\Downloads\CrickEye_Project-3\CrickEye_Project-2"
    os.chdir(base_dir)

    target_files = [
        "App.js",
        "index.html",
        "style.css",
        "config.js",
        "config.example.js",
    ]

    for root_dir in ["components", "android/app/src/main/assets"]:
        if os.path.exists(root_dir):
            for r, dirs, files in os.walk(root_dir):
                for f in files:
                    if f.endswith(('.js', '.html', '.css', '.json')):
                        target_files.append(os.path.join(r, f))

    for tf in target_files:
        process_file(tf)

if __name__ == "__main__":
    main()

