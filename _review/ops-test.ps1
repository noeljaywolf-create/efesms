$ErrorActionPreference = "Stop"
$base = "http://localhost:3001/api/v1"

function Login($u, $p) {
    $r = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ username = $u; password = $p } | ConvertTo-Json)
    return $r.token
}
function Hdr($token) { @{ Authorization = "Bearer $token" } }
function StatusOf($sb) { try { & $sb | Out-Null; 0 } catch { if ($_.Exception.Response) { $_.Exception.Response.StatusCode.value__ } else { ($_.Exception.Message) } } }

$tech = Login "tech" "Tech@123"
$acc  = Login "accounts" "Accounts@123"
$adm  = Login "admin" "Admin@123"

Write-Host "== AI analyze (full) =="
$resp = Invoke-WebRequest -Uri "$base/operations/analyze/full" -Method Post -Headers (Hdr $tech) -ContentType "application/json" -Body "{}" -TimeoutSec 60
$out = $resp.Content | ConvertFrom-Json
Write-Host ("  status={0} confidence={1} assignments={2} routes={3} risks={4} anomalies={5} incidents={6} forecasts={7} reorders={8} siteRisks={9} reminders={10} clusters={11}" -f `
    $resp.StatusCode, $out.overallConfidence, @($out.assignments).Count, @($out.routes).Count, @($out.riskAssessments).Count, @($out.anomalies).Count, `
    @($out.incidents).Count, @($out.forecasts).Count, @($out.reorders).Count, @($out.siteRisks).Count, @($out.reminders).Count, @($out.riskClusters).Count)
$a0 = @($out.assignments)[0]
if ($a0) { Write-Host ("  assignment: job {0} -> {1} (score {2}) reasons=[{3}]" -f $a0.jobId, $a0.technicianName, $a0.score, ($a0.reasons -join '; ')) }
$r0 = @($out.riskAssessments)[0]
if ($r0) { Write-Host ("  top risk: {0} risk={1} [{2}] action={3}" -f $r0.name, $r0.riskScore, $r0.severity, $r0.recommendedAction) }
$an0 = @($out.anomalies)[0]
if ($an0) { Write-Host ("  anomaly: {0} [{1}] {2} (conf {3})" -f $an0.type, $an0.severity, $an0.description, $an0.confidence) }
$rd0 = @($out.reorders)[0]
if ($rd0) { Write-Host ("  reorder: {0} stock={1} order={2} [{3}] days={4}" -f $rd0.itemName, $rd0.currentStock, $rd0.suggestedOrderQty, $rd0.urgency, $rd0.daysRemaining) }
$rm0 = @($out.reminders)[0]
if ($rm0) { Write-Host ("  reminder: [{0}/{1}] {2} (due in {3}d)" -f $rm0.category, $rm0.severity, $rm0.message, $rm0.daysUntilDue) }
$rt0 = @($out.routes)[0]
if ($rt0) { Write-Host ("  route: {0} stops={1} travel={2}km work={3}h" -f $rt0.technicianName, @($rt0.stops).Count, $rt0.totalTravelKm, $rt0.totalWorkHours) }

Write-Host ""
Write-Host "== RBAC: ops writes =="
Write-Host ("  accounts POST /jobs        -> {0} (expect 403)" -f (StatusOf { Invoke-RestMethod -Uri "$base/operations/jobs" -Method Post -Headers (Hdr $acc) -ContentType "application/json" -Body '{"title":"hack"}' | Out-Null }))
Write-Host ("  accounts POST /techs       -> {0} (expect 403)" -f (StatusOf { Invoke-RestMethod -Uri "$base/operations/technicians" -Method Post -Headers (Hdr $acc) -ContentType "application/json" -Body '{"name":"Hacker"}' | Out-Null }))
Write-Host ("  tech DELETE /jobs/5        -> {0} (expect 403)" -f (StatusOf { Invoke-RestMethod -Uri "$base/operations/jobs/5" -Method Delete -Headers (Hdr $tech) | Out-Null }))
Write-Host ("  tech DELETE /equipment/2   -> {0} (expect 403)" -f (StatusOf { Invoke-RestMethod -Uri "$base/operations/equipment/2" -Method Delete -Headers (Hdr $tech) | Out-Null }))

Write-Host ""
Write-Host "== tech write + assign =="
$jobA = Invoke-RestMethod -Uri "$base/operations/jobs" -Method Post -Headers (Hdr $tech) -ContentType "application/json" -Body '{"title":"Test fire drill support","jobType":"Service","priority":"Urgent"}'
Write-Host ("  created {0} [{1}]" -f $jobA.jobNumber, $jobA.priority)
$techs = Invoke-RestMethod -Uri "$base/operations/technicians" -Headers (Hdr $tech)
$assigned = Invoke-RestMethod -Uri "$base/operations/jobs/$($jobA.id)/assign" -Method Post -Headers (Hdr $tech) -ContentType "application/json" -Body (@{ technicianId = @($techs)[0].id } | ConvertTo-Json)
Write-Host ("  assigned -> status now {0}" -f $assigned.status)

Write-Host ""
Write-Host "== admin write + cleanup =="
$eNew = Invoke-RestMethod -Uri "$base/operations/equipment" -Method Post -Headers (Hdr $adm) -ContentType "application/json" -Body '{"name":"CO2 5kg test unit","category":"Extinguisher","conditionRating":9}'
$iNew = Invoke-RestMethod -Uri "$base/operations/inventory" -Method Post -Headers (Hdr $adm) -ContentType "application/json" -Body '{"name":"Test Seal Tag","category":"Spares","currentStock":50,"reorderLevel":10,"unitCost":1.2}'
Write-Host ("  created {0} + {1}" -f $eNew.equipmentNumber, $iNew.name)
Write-Host ("  delete job test   -> {0} (expect 204)" -f (StatusOf { Invoke-RestMethod -Uri "$base/operations/jobs/$($jobA.id)" -Method Delete -Headers (Hdr $adm) | Out-Null }))
Write-Host ("  delete equip test -> {0} (expect 204)" -f (StatusOf { Invoke-RestMethod -Uri "$base/operations/equipment/$($eNew.id)" -Method Delete -Headers (Hdr $adm) | Out-Null }))
Write-Host ("  delete inv test   -> {0} (expect 404/405/204; no DELETE endpoint staged)" -f (StatusOf { Invoke-RestMethod -Uri "$base/operations/inventory/$($iNew.id)" -Method Delete -Headers (Hdr $adm) | Out-Null }))

Write-Host ""
Write-Host "ALL OPERATIONS TESTS COMPLETE"