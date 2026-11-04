import re

files = [
    r'c:\Users\HP\Downloads\CrickEye_Project-3\CrickEye_Project-2\App.js',
    r'c:\Users\HP\Downloads\CrickEye_Project-3\CrickEye_Project-2\android\app\src\main\assets\App.js',
]

replacements = {
    'âœ“': '✓',
    'â†‘': '↑',
    'â†“': '↓',
    'â†’': '→',
    'âš ': '⚠',
    'â³': '⏳',
    'â–¶': '▶',
    'âœ–': '✕',
    'â€¢': '•',
    'â€”': '—',
    'â€“': '–',
    'â€': '-',
    'Â·': '•',
    'Â©': '©',
    'Ã—': 'x',
}

for p in files:
    with open(p, 'rb') as f:
        data = f.read()
    text = data.decode('utf-8', errors='replace')
    for k, v in replacements.items():
        text = text.replace(k, v)
    with open(p, 'wb') as f:
        f.write(text.encode('utf-8'))
    print('Cleaned:', p)

