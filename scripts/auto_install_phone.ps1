$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$apk = "c:\Users\HP\Downloads\CrickEye_Project-3\CrickEye_Project-2\CrickEye-Pro.apk"

Write-Output "Waiting for S25 Ultra authorization on USB..."
$found = $false

for ($i = 0; $i -lt 30; $i++) {
    $out = & $adb devices
    if ($out -match "device\b") {
        Write-Output "Phone detected and authorized!"
        $found = $true
        break
    } elseif ($out -match "unauthorized") {
        Write-Output "Phone detected but UNAUTHORIZED! Please tap 'Allow' on your phone screen."
    }
    Start-Sleep -Seconds 2
}

if ($found) {
    Write-Output "Configuring USB reverse proxy (ports 8000 and 8080)..."
    & $adb reverse tcp:8000 tcp:8000
    & $adb reverse tcp:8080 tcp:8080
    Write-Output "Installing CrickEye Pro APK to phone..."
    & $adb install -r $apk
    Write-Output "Launching CrickEye Pro on phone..."
    & $adb shell monkey -p com.crickeye.pro -c android.intent.category.LAUNCHER 1
    Write-Output "SUCCESS: CrickEye Pro is running on your S25 Ultra!"
} else {
    Write-Output "Timeout waiting for USB debugging. Please ensure USB debugging is turned ON in Developer Options."
}
