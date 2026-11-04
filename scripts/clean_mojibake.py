import re

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        text = f.read()

    original = text
    # Replace common Mojibake artifacts
    replacements = [
        ('â€”', '—'),
        ('â€"', '—'),
        ('â€“', '–'),
        ('â€¦', '...'),
        ('â€˜', "'"),
        ('â€™', "'"),
        ('â€œ', '"'),
        ('â€\x9d', '"'),
        ('â€\x9c', '"'),
        ('â€\x94', '—'),
        ('â€¢', '•'),
        ('â†’', '→'),
        ('âœ”', '✔'),
        ('âœ–', '✖'),
        ('âš ', '⚠'),
        ('â•', '─'),
        ('â”€', '─'),
        ('â”', '─'),
    ]
    for bad, good in replacements:
        text = text.replace(bad, good)

    # Catch any remaining â€...
    text = re.sub(r'â€[^\w\s]', '—', text)

    if text != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(text)
        print(f"Fixed {filepath}")
    else:
        print(f"No changes for {filepath}")

for path in ['App.js', 'index.html', 'android/app/src/main/assets/App.js', 'android/app/src/main/assets/app.js', 'android/app/src/main/assets/index.html']:
    try:
        fix_file(path)
    except Exception as e:
        print(f"Error {path}: {e}")
