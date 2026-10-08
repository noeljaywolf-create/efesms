$ErrorActionPreference = 'SilentlyContinue'
Write-Output '=== netstat 3001/5173 ==='
$status = netstat -ano
$status | Select-String -Pattern '(:3001|:5173)' | ForEach-Object { $_.Line }
Write-Output '=== API health (direct localhost:3001) ==='
try {
  $h = Invoke-WebRequest -Uri 'http://127.0.0.1:3001/api/v1/health' -UseBasicParsing -TimeoutSec 5
  Write-Output ("direct health: HTTP {0} -> {1}" -f $h.StatusCode, $h.Content)
} catch {
  Write-Output ("direct health FAILED: {0}" -f $_.Exception.Message)
}
Write-Output '=== PROXY login (via vite 5173) ==='
$body = @{ username = 'admin'; password = 'Admin@123' } | ConvertTo-Json
try {
  $r = Invoke-WebRequest -Uri 'http://127.0.0.1:5173/api/v1/auth/login' -Method Post -Body $body -ContentType 'application/json' -UseBasicParsing -TimeoutSec 5
  Write-Output ("proxy login: HTTP {0}" -f $r.StatusCode)
} catch {
  Write-Output ("proxy login FAILED: {0}" -f $_.Exception.Message)
}
