import os

app_path = os.path.join(os.path.dirname(__file__), '..', 'App.js')

with open(app_path, 'r', encoding='utf-8') as f:
    text = f.read()

target = """  list.push('http://192.168.0.179:8000');
  list.push('http://10.253.4.106:8000');
  list.push('http://localhost:8000');"""

replacement = """  list.push('http://192.168.29.14:8000');
  list.push('http://localhost:8000');
  list.push('http://10.253.4.106:8000');
  list.push('http://192.168.0.179:8000');"""

if target in text:
    text = text.replace(target, replacement, 1)

text = text.replace(" && !saved.includes('192.168.29.14')", "")
text = text.replace("10.253.4.106:8000", "192.168.29.14:8000")

with open(app_path, 'w', encoding='utf-8') as f:
    f.write(text)

print("Updated App.js IP to 192.168.29.14")

