import re

files = [
    r'c:\Users\HP\Downloads\CrickEye_Project-3\CrickEye_Project-2\index.html',
    r'c:\Users\HP\Downloads\CrickEye_Project-3\CrickEye_Project-2\android\app\src\main\assets\index.html',
    r'c:\Users\HP\Downloads\CrickEye_Project-3\CrickEye_Project-2\App.js',
    r'c:\Users\HP\Downloads\CrickEye_Project-3\CrickEye_Project-2\android\app\src\main\assets\App.js',
]

for p in files:
    with open(p, 'rb') as f:
        data = f.read()
    # Decode utf-8 with error replace
    text = data.decode('utf-8', errors='replace')
    # Replace in html: any btnSpeed content like 1Ã- or 1A- or 1× -> 1x
    text = re.sub(r'(id=["\']btnSpeed["\'][^>]*>)[^<]*(</span>)', r'\g<1>1x\g<2>', text)
    # Replace in js: btnSpeed.textContent=sp+'...' -> btnSpeed.textContent=sp+'x';
    text = re.sub(r'btnSpeed\.textContent\s*=\s*sp\s*\+\s*[\'"][^\'"]*[\'"]', "btnSpeed.textContent=sp+'x'", text)
    with open(p, 'wb') as f:
        f.write(text.encode('utf-8'))
    print('Updated:', p)

