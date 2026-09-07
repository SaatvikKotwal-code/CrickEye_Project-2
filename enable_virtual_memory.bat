@echo off
:: Self-elevation to Administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo ====================================================
echo   Enabling Windows Automatically Managed Pagefile
echo ====================================================
echo.
powershell -Command "Set-CimInstance -Query 'Select * from Win32_ComputerSystem' -Property @{AutomaticManagedPagefile=$True}; reg add 'HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management' /v PagingFiles /t REG_MULTI_SZ /d '?:\pagefile.sys' /f; Write-Host '[SUCCESS] Automatically Managed Pagefile enabled on Windows!' -ForegroundColor Green"
echo.
echo Checking Virtual Memory status...
powershell -Command "Get-CimInstance Win32_ComputerSystem | Select-Object AutomaticManagedPagefile; Get-CimInstance Win32_OperatingSystem | Select-Object @{Name='Total Virtual Memory (GB)'; Expression={[math]::Round($_.TotalVirtualMemorySize/1MB, 2)}}, @{Name='Free Virtual Memory (GB)'; Expression={[math]::Round($_.FreeVirtualMemory/1MB, 2)}}"
echo.
echo Done! Please restart your terminal/IDE or system if needed to apply the pagefile.
pause
