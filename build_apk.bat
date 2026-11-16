@echo off
title CrickEye Pro - APK Builder
echo ===================================================
echo       Building CrickEye Pro Android APK
echo ===================================================

cd /d "%~dp0"

echo [1/3] Syncing latest web assets to Android...
py -3 -c "import os, shutil; os.makedirs(r'android\app\src\main\assets', exist_ok=True); [shutil.copy2(f, os.path.join(r'android\app\src\main\assets', f)) for f in ['index.html', 'style.css', 'App.js', 'config.example.js']]; shutil.copy2('App.js', r'android\app\src\main\assets\app.js'); [shutil.copy2('config.js', r'android\app\src\main\assets\config.js') if os.path.exists('config.js') else None]; [shutil.rmtree(os.path.join(r'android\app\src\main\assets', d), ignore_errors=True) or shutil.copytree(d, os.path.join(r'android\app\src\main\assets', d)) for d in ['components', 'data']]; print('Assets synced successfully.')" 2>nul || python -c "import os, shutil; os.makedirs(r'android\app\src\main\assets', exist_ok=True); [shutil.copy2(f, os.path.join(r'android\app\src\main\assets', f)) for f in ['index.html', 'style.css', 'App.js', 'config.example.js']]; shutil.copy2('App.js', r'android\app\src\main\assets\app.js'); [shutil.copy2('config.js', r'android\app\src\main\assets\config.js') if os.path.exists('config.js') else None]; [shutil.rmtree(os.path.join(r'android\app\src\main\assets', d), ignore_errors=True) or shutil.copytree(d, os.path.join(r'android\app\src\main\assets', d)) for d in ['components', 'data']]; print('Assets synced successfully.')"

echo [2/3] Compiling Android APK with Gradle...
call "C:\Users\HP\.gradle\wrapper\dists\gradle-8.9-bin\90cnw93cvbtalezasaz0blq0a\gradle-8.9\bin\gradle.bat" assembleDebug -p android

if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Gradle build failed.
    pause
    exit /b %ERRORLEVEL%
)

echo [3/3] Copying APK to project root...
copy /y "android\app\build\outputs\apk\debug\app-debug.apk" "CrickEye-Pro.apk"

echo ===================================================
echo  SUCCESS: CrickEye-Pro.apk generated successfully!
echo  Location: %~dp0CrickEye-Pro.apk
echo ===================================================
pause
