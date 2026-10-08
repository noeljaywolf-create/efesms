@echo off
start "EFESMS-API" /min cmd /c "cd /d ""C:\Users\hp\Documents\New folder\EXTREME FIRE SERVICES APPLICATION\backend\EFESMS.Api"" && ""C:\Program Files\dotnet\dotnet.exe"" run --no-build > ""C:\Users\hp\Documents\New folder\EXTREME FIRE SERVICES APPLICATION\_review\api2.log"" 2>&1"
start "EFESMS-WEB" /min cmd /c "cd /d ""C:\Users\hp\Documents\New folder\EXTREME FIRE SERVICES APPLICATION\frontend"" && npm run dev > ""C:\Users\hp\Documents\New folder\EXTREME FIRE SERVICES APPLICATION\_review\vite2.log"" 2>&1"
echo Started.
