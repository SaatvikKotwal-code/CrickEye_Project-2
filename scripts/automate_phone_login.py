import subprocess
import time

adb = r'C:\Users\HP\AppData\Local\Android\Sdk\platform-tools\adb.exe'
dev = 'RZCY21LV4YM'

def cmd(args):
    subprocess.run([adb, '-s', dev] + args)

print("1. Tapping Email field...")
cmd(['shell', 'input', 'tap', '539', '980'])
time.sleep(0.5)

# Clear any text in email field
cmd(['shell', 'input', 'keyevent', 'KEYCODE_MOVE_END'])
for _ in range(40):
    cmd(['shell', 'input', 'keyevent', 'KEYCODE_DEL'])

print("2. Entering Email: saatvikkotwal78@gmail.com...")
cmd(['shell', 'input', 'text', 'saatvikkotwal78@gmail.com'])
time.sleep(0.8)

print("3. Tapping Password field...")
cmd(['shell', 'input', 'tap', '539', '1115'])
time.sleep(0.5)

cmd(['shell', 'input', 'keyevent', 'KEYCODE_MOVE_END'])
for _ in range(30):
    cmd(['shell', 'input', 'keyevent', 'KEYCODE_DEL'])

print("4. Entering Password: CrickEye@123...")
cmd(['shell', 'input', 'text', 'CrickEye@123'])
time.sleep(0.8)

# Dismiss soft keyboard so Login button is fully visible and clickable
print("5. Dismissing keyboard with KEYCODE_BACK...")
# Note: If keyboard is open, KEYCODE_BACK dismisses keyboard only without closing app
cmd(['shell', 'input', 'keyevent', '111']) # KEYCODE_ESCAPE (dismisses keyboard without navigation)
time.sleep(0.5)

print("6. Tapping Login Button at (539, 1254)...")
cmd(['shell', 'input', 'tap', '539', '1254'])

print("7. Waiting 7 seconds for login and dashboard...")
time.sleep(7)

data = subprocess.check_output([adb, '-s', dev, 'exec-out', 'screencap', '-p'])
open(r'C:\Users\HP\.gemini\antigravity-ide\brain\aa8b31bf-c56d-4e92-b303-0724d1d86575\phone_logged_in_final.png', 'wb').write(data)
print("SUCCESS: phone_logged_in_final.png captured!")
