import os
import shutil
import socket
import subprocess

def get_lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "10.253.13.192"

lan_ip = get_lan_ip()
print(f"[0/3] Detected host LAN IP: {lan_ip}")

# Ensure config.js has active LAN IP
config_content = f"""/**
 * CrickEye Pro - Client-side Supabase Configuration
 * Bundled with APK assets for instant, zero-delay authentication initialization.
 */
window.SUPABASE_URL = 'https://sjisoyaltztonlfaqech.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqaXNveWFsdHp0b25sZmFxZWNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NjM4ODIsImV4cCI6MjA5MDUzOTg4Mn0.R7_ugYoqEFOLgmX5E8a7Cdhu4BMXMGIvEuKw-mEwtoM';
window.CRICKEYE_DEFAULT_BACKEND_URL = 'http://{lan_ip}:8000';
"""
with open("config.js", "w", encoding="utf-8") as f:
    f.write(config_content)

print("[1/3] Syncing assets...")
assets_dir = os.path.join("android", "app", "src", "main", "assets")
os.makedirs(assets_dir, exist_ok=True)

for f in ["index.html", "style.css", "App.js", "config.js"]:
    if os.path.exists(f):
        shutil.copy2(f, os.path.join(assets_dir, f))
        print(f"  Copied {f}")

# app.js alias
shutil.copy2("App.js", os.path.join(assets_dir, "app.js"))

for d in ["components", "data"]:
    target = os.path.join(assets_dir, d)
    shutil.rmtree(target, ignore_errors=True)
    shutil.copytree(d, target)
    print(f"  Copied {d}/")

print("[2/3] Building APK with Gradle...")
gradle_bat = r"C:\Users\HP\.gradle\wrapper\dists\gradle-8.9-bin\90cnw93cvbtalezasaz0blq0a\gradle-8.9\bin\gradle.bat"
subprocess.run([gradle_bat, "assembleDebug", "-p", "android"], check=True)

print("[3/3] Copying APK and installing on phone...")
apk_src = os.path.join("android", "app", "build", "outputs", "apk", "debug", "app-debug.apk")
shutil.copy2(apk_src, "CrickEye-Pro.apk")

adb = r"C:\Users\HP\AppData\Local\Android\Sdk\platform-tools\adb.exe"
device_id = "RZCY21LV4YM"

try:
    subprocess.run([adb, "-s", device_id, "install", "-r", "CrickEye-Pro.apk"], check=True)
    subprocess.run([adb, "-s", device_id, "reverse", "tcp:8000", "tcp:8000"], check=False)
    subprocess.run([adb, "-s", device_id, "reverse", "tcp:8080", "tcp:8080"], check=False)
    subprocess.run([adb, "-s", device_id, "shell", "am", "start", "-n", "com.crickeye.pro/.MainActivity"], check=True)
    print("SUCCESS: APK updated and launched on device!")
except Exception as e:
    print("Warning during adb step:", e)
