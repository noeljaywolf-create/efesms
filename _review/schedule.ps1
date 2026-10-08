$ErrorActionPreference = 'SilentlyContinue'
$rev = 'C:\Users\hp\Documents\New folder\EXTREME FIRE SERVICES APPLICATION\_review'

function Test-Port($port) {
  $c = New-Object System.Net.Sockets.TcpClient
  try { $iar = $c.BeginConnect('127.0.0.1', $port, $null, $null); $r = $iar.AsyncWaitHandle.WaitOne(2000) -and $c.Connected } catch { $r = $false }
  $c.Close(); return $r
}

# API
schtasks /Delete /TN EFESMS_Api /F | Out-Null
schtasks /Create /TN EFESMS_Api /TR "$rev\run_api.bat" /SC ONCE /ST 23:59 /F
schtasks /Run /TN EFESMS_Api

# WEB
schtasks /Delete /TN EFESMS_Web /F | Out-Null
schtasks /Create /TN EFESMS_Web /TR "$rev\run_web.bat" /SC ONCE /ST 23:59 /F
schtasks /Run /TN EFESMS_Web

Start-Sleep -Seconds 15
Write-Output ("API 3001 : " + $(if (Test-Port 3001) {'OPEN'} else {'CLOSED'}))
Write-Output ("WEB 5173 : " + $(if (Test-Port 5173) {'OPEN'} else {'CLOSED'}))
