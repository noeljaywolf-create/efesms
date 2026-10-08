@echo off
:: Opens the firewall so your phone can reach the EFESMS dev servers.
:: Right-click this file and choose "Run as administrator".

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo.
  echo Requesting administrator rights...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo.
echo Adding firewall rules for TCP 5173 (frontend) and 3001 (backend)...

netsh advfirewall firewall delete rule name="EFESMS Dev Frontend 5173" >nul 2>&1
netsh advfirewall firewall add rule name="EFESMS Dev Frontend 5173" dir=in action=allow protocol=TCP localport=5173 profile=any enable=yes

netsh advfirewall firewall delete rule name="EFESMS Dev Backend 3001" >nul 2>&1
netsh advfirewall firewall add rule name="EFESMS Dev Backend 3001" dir=in action=allow protocol=TCP localport=3001 profile=any enable=yes

echo.
echo Done. Rules added.
echo.
pause
