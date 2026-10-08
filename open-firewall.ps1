$ErrorActionPreference = 'Stop'
$port = 5173
$rules = @(
  @{ Name = "EFESMS Phone 5173"; Port = 5173 },
  @{ Name = "EFESMS Phone 3001"; Port = 3001 }
)
foreach ($r in $rules) {
  Get-NetFirewallRule -DisplayName $r.Name -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
  New-NetFirewallRule -DisplayName $r.Name -Direction Inbound -Action Allow -Protocol TCP -LocalPort $r.Port -Profile Any -Enabled True | Out-Null
  Write-Host "Added inbound rule: $($r.Name) on TCP $($r.Port)"
}
Write-Host ""
Write-Host "EFESMS firewall rules are now open."
Write-Host ""
Get-NetFirewallRule -DisplayName "EFESMS Phone*" | Select-Object DisplayName, Enabled, Action, Direction, Profile | Format-Table -AutoSize
Write-Host ""
Write-Host "Open this on your phone:  http://192.168.1.253:5173"
Write-Host ""
Read-Host "Press Enter to close this window"
