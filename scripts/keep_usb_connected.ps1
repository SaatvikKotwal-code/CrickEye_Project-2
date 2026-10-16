$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"

while ($true) {
    try {
        & $adb reverse tcp:8000 tcp:8000 2>$null
        & $adb reverse tcp:8080 tcp:8080 2>$null
    } catch {}
    Start-Sleep -Seconds 5
}
