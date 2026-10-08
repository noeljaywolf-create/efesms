$ErrorActionPreference = 'SilentlyContinue'
$root = 'C:\Users\hp\Documents\New folder\EXTREME FIRE SERVICES APPLICATION'
$rev = Join-Path $root '_review'

# --- helper: is a tcp port open? ---
function Test-Port($port) {
  $c = New-Object System.Net.Sockets.TcpClient
  try {
    $iar = $c.BeginConnect('127.0.0.1', $port, $null, $null)
    $r = $iar.AsyncWaitHandle.WaitOne(2000) -and $c.Connected
  } catch { $r = $false }
  $c.Close()
  return $r
}

# --- ensure output dir ---
if (-not (Test-Path $rev)) { New-Item -ItemType Directory -Path $rev -Force | Out-Null }

Write-Output 'Starting EFESMS background services...'

# --- Backend: ASP.NET (already built) ---
if (-not (Test-Port 3001)) {
  $taskName = 'EFESMS_Api'
  schtasks /Delete /TN $taskName /F 2>$null | Out-Null
  schtasks /Create /TN $taskName /TR "powershell -NoProfile -ExecutionPolicy Bypass -Command \"cd 'C:\Users\hp\Documents\New folder\EXTREME FIRE SERVICES APPLICATION\backend\EFESMS.Api'; & 'C:\Program Files\dotnet\dotnet.exe' run --no-build > 'C:\Users\hp\Documents\New folder\EXTREME FIRE SERVICES APPLICATION\_review\api3.log' 2>&1\" /SC ONCE /ST 00:00 /F | Out-Null
  schtasks /Run /TN $taskName | Out-Null
  Write-Output '  scheduled API task'
} else {
  Write-Output '  API already up (port 3001)'
}

# --- Frontend: Vite dev ---
if (-not (Test-Port 5173)) {
  $taskName = 'EFESMS_Web'
  schtasks /Delete /TN $taskName /F 2>$null | Out-Null
  schtasks /Create /TN $taskName /TR "powershell -NoProfile -ExecutionPolicy Bypass -Command \"cd 'C:\Users\hp\Documents\New folder\EXTREME FIRE SERVICES APPLICATION\frontend'; npm run dev > 'C:\Users\hp\Documents\New folder\EXTREME FIRE SERVICES APPLICATION\_review\vite3.log' 2>&1\" /SC ONCE /ST 00:00 /F | Out-Null
  schtasks /Run /TN $taskName | Out-Null
  Write-Output '  scheduled WEB task'
} else {
  Write-Output '  WEB already up (port 5173)'
}

# --- wait & verify ---
Start-Sleep -Seconds 12
Write-Output ''
Write-Output '=== VERIFICATION ==='
Write-Output ("API port 3001 : " + $(if (Test-Port 3001) { 'OPEN' } else { 'CLOSED' }))
Write-Output ("WEB port 5173 : " + $(if (Test-Port 5173) { 'OPEN' } else { 'CLOSED' }))
if (Test-Port 3001) {
  try { $h = Invoke-WebRequest -Uri 'http://127.0.0.1:3001/api/v1/health' -UseBasicParsing -TimeoutSec 5; Write-Output ("health: " + $h.Content) } catch { Write-Output 'health: FAILED' }
}
if (Test-Port 5173) {
  $body = @{ username = 'admin'; password = 'Admin@123' } | ConvertTo-Json
  try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/api/v1/auth/login' -Method Post -Body $body -ContentType 'application/json' -UseBasicParsing -TimeoutSec 6; Write-Output ("proxy login: HTTP " + $r.StatusCode) } catch { Write-Output ("proxy login: FAILED " + $_.Exception.Message) }
}
