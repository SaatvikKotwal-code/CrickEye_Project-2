with open("index.html", "r", encoding="utf-8") as f:
    lines = f.readlines()

start_del = None
end_del = None

for i, line in enumerate(lines):
    if 'id="gateMessage" class="auth-message-box"' in line:
        start_del = i + 3
    if 'APP SHELL' in line:
        end_del = i
        break

print(f"start_del: {start_del}, end_del: {end_del}")
for l in lines[start_del:end_del]:
    print(repr(l))

new_lines = lines[:start_del] + ["\n"] + lines[end_del:]
with open("index.html", "w", encoding="utf-8") as f:
    f.writelines(new_lines)

print("Successfully removed orphan login fragment from index.html")
