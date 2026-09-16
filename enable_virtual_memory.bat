@echo off
:: Self-elevation to Administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

echo ====================================================
echo   Enabling Windows Automatically Managed Pagefile
echo ====================================================
echo.

:: 1. Enable System Managed Pagefile via PowerShell CIM
powershell -NoProfile -ExecutionPolicy Bypass -Command "$cs = Get-CimInstance Win32_ComputerSystem; Set-CimInstance -InputObject $cs -Property @{AutomaticManagedPagefile=$true}"

:: 2. Set registry for automatically managed pagefile
reg add "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Memory Management" /v PagingFiles /t REG_MULTI_SZ /d "?:\pagefile.sys" /f

echo.
echo ====================================================
echo   Virtual Memory Status
echo ====================================================
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_ComputerSystem | Select-Object AutomaticManagedPagefile; Get-CimInstance Win32_OperatingSystem | Select-Object @{Name='Total Virtual Memory (GB)'; Expression={[math]::Round($_.TotalVirtualMemorySize/1MB, 2)}}, @{Name='Free Virtual Memory (GB)'; Expression={[math]::Round($_.FreeVirtualMemory/1MB, 2)}}"

echo.
echo [SUCCESS] Virtual Memory Pagefile has been enabled!
echo NOTE: A quick Windows restart or signing out and back in is recommended
echo       for Windows to fully allocate the new pagefile.sys file.
echo.
pause

