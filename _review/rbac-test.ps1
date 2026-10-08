$ErrorActionPreference = "Stop"
$base = "http://localhost:3001/api/v1"

function Login($u, $p) {
    $r = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body (@{ username = $u; password = $p } | ConvertTo-Json)
    return $r.token
}

function Hdr($token) { @{ Authorization = "Bearer $token" } }

function GalBody($extra) {
    $o = @{ name = "ABC Engineering"; phone = "0772111222"; customerType = "Corporate"; status = "Active"; priority = "Normal"; preferredContact = "Phone" }
    $extra.GetEnumerator() | ForEach-Object { $o[$_.Key] = $_.Value }
    return ($o | ConvertTo-Json)
}

$tech = Login "tech" "Tech@123"
$acc  = Login "accounts" "Accounts@123"
$con  = Login "contracts" "Contracts@123"
$adm  = Login "admin" "Admin@123"

Write-Host "== 1. LIST LVL: tech GET /customers (expect vatNumber & contractRef null/masked) =="
$list = Invoke-RestMethod -Uri "$base/customers" -Headers (Hdr $tech)
$c1 = $list | Where-Object { $_.id -eq 1 } | Select-Object -First 1
Write-Host ("tech sees name={0} vatNumber=[{1}] tin=[{2}] paymentTerms=[{3}] contractRef=[{4}] contractValue=[{5}]" -f $c1.name, $c1.vatNumber, $c1.tinNumber, $c1.paymentTerms, $c1.contractRef, $c1.contractValue)

Write-Host ""
Write-Host "== 2. TECH tries to change vatNumber -> expect 403 =="
try {
    Invoke-RestMethod -Uri "$base/customers/1" -Method Put -Headers (Hdr $tech) -ContentType "application/json" -Body (GalBody @{ vatNumber = "HACK-999"; changed = @("vatNumber") }) | Out-Null
    Write-Host "FAIL: unexpectedly allowed"
} catch {
    Write-Host ("status={0} fields={1}" -f $_.Exception.Response.StatusCode.value__, $_.ErrorDetails.Message)
}

Write-Host ""
Write-Host "== 3. TECH tries phone + vatNumber -> expect 403 listing vatNumber =="
try {
    Invoke-RestMethod -Uri "$base/customers/1" -Method Put -Headers (Hdr $tech) -ContentType "application/json" -Body (GalBody @{ phone = "0990000111"; vatNumber = "HACK-999"; changed = @("phone", "vatNumber") }) | Out-Null
    Write-Host "FAIL: unexpectedly allowed"
} catch {
    Write-Host ("status={0} error={1}" -f $_.Exception.Response.StatusCode.value__, $_.ErrorDetails.Message)
}

Write-Host ""
Write-Host "== 4. TECH DELETE -> expect 403 =="
try {
    Invoke-RestMethod -Uri "$base/customers/3" -Method Delete -Headers (Hdr $tech) | Out-Null
    Write-Host "FAIL: unexpectedly allowed"
} catch {
    Write-Host ("status={0} msg={1}" -f $_.Exception.Response.StatusCode.value__, $_.ErrorDetails.Message)
}

Write-Host ""
Write-Host "== 5. ACCOUNTS changes vatNumber -> expect 200 =="
$before = (Invoke-RestMethod -Uri "$base/customers/1" -Headers (Hdr $acc)).vatNumber
$actPut = Invoke-RestMethod -Uri "$base/customers/1" -Method Put -Headers (Hdr $acc) -ContentType "application/json" -Body (GalBody @{ vatNumber = "RBAC-VAT-001"; reason = "RBAC test update by accounts"; changed = @("vatNumber") })
Write-Host ("accounts changed vat [{0}] -> [{1}] OK" -f $before, $actPut.vatNumber)

Write-Host ""
Write-Host "== 6. CONTRACTS changes contractRef -> expect 200 =="
$conPut = Invoke-RestMethod -Uri "$base/customers/1" -Method Put -Headers (Hdr $con) -ContentType "application/json" -Body (GalBody @{ contractRef = "RBAC-CON-001"; reason = "RBAC test update by contracts"; changed = @("contractRef") })
Write-Host ("contracts changed contractRef -> [{0}] OK" -f $conPut.contractRef)

Write-Host ""
Write-Host "== 7. ACCOUNTS tries to change contractRef -> expect 403 =="
try {
    Invoke-RestMethod -Uri "$base/customers/1" -Method Put -Headers (Hdr $acc) -ContentType "application/json" -Body (GalBody @{ contractRef = "HACK-CON"; changed = @("contractRef") }) | Out-Null
    Write-Host "FAIL: unexpectedly allowed"
} catch {
    Write-Host ("status={0} fields={1}" -f $_.Exception.Response.StatusCode.value__, $_.ErrorDetails.Message)
}

Write-Host ""
Write-Host "== 8. CONTRACTS tries to change vatNumber -> expect 403 =="
try {
    Invoke-RestMethod -Uri "$base/customers/1" -Method Put -Headers (Hdr $con) -ContentType "application/json" -Body (GalBody @{ vatNumber = "HACK-CON"; changed = @("vatNumber") }) | Out-Null
    Write-Host "FAIL: unexpectedly allowed"
} catch {
    Write-Host ("status={0} fields={1}" -f $_.Exception.Response.StatusCode.value__, $_.ErrorDetails.Message)
}

Write-Host ""
Write-Host "== 9. ACCOUNTS list: vat VISIBLE, contractRef masked =="
$acl = Invoke-RestMethod -Uri "$base/customers" -Headers (Hdr $acc)
$a1 = $acl | Where-Object { $_.id -eq 1 } | Select-Object -First 1
Write-Host ("accounts sees vatNumber=[{0}] contractRef=[{1}] contractValue=[{2}]" -f $a1.vatNumber, $a1.contractRef, $a1.contractValue)

Write-Host ""
Write-Host "== 10. ADMIN list: everything visible =="
$adl = Invoke-RestMethod -Uri "$base/customers" -Headers (Hdr $adm)
$d1 = $adl | Where-Object { $_.id -eq 1 } | Select-Object -First 1
Write-Host ("admin sees vatNumber=[{0}] contractRef=[{1}] contractValue=[{2}]" -f $d1.vatNumber, $d1.contractRef, $d1.contractValue)

Write-Host ""
Write-Host "== 11. ADMIN full access: vatNumber + contractValue together -> expect 200 =="
$adPut = Invoke-RestMethod -Uri "$base/customers/1" -Method Put -Headers (Hdr $adm) -ContentType "application/json" -Body (GalBody @{ vatNumber = "RBAC-ADMIN-VAT"; contractValue = 15000.50; reason = "RBAC admin full access test"; changed = @("vatNumber", "contractValue") })
Write-Host ("admin set vat=[{0}] contractValue=[{1}] OK" -f $adPut.vatNumber, $adPut.contractValue)

Write-Host ""
Write-Host "== 12. TECH profile: fields masked in customer AND in audit before/after =="
$prof = Invoke-RestMethod -Uri "$base/customers/1" -Headers (Hdr $tech)
$pc = $prof.customer
Write-Host ("profile customer: vat=[{0}] contractRef=[{1}]" -f $pc.vatNumber, $pc.contractRef)
$vatAudit = $prof.fieldAudits | Where-Object { $_.field -eq "vatNumber" } | Select-Object -First 1
Write-Host ("audit entry: field={0} before=[{1}] after=[{2}] actor={3}" -f $vatAudit.field, $vatAudit.before, $vatAudit.after, $vatAudit.userName)

Write-Host ""
Write-Host "== 13. ADMIN create + delete a throwaway record =="
$tmp = Invoke-RestMethod -Uri "$base/customers" -Method Post -Headers (Hdr $adm) -ContentType "application/json" -Body (GalBody @{ name = "RBAC Delete Probe"; phone = "0990000999" })
Invoke-RestMethod -Uri "$base/customers/$($tmp.id)" -Method Delete -Headers (Hdr $adm) | Out-Null
Write-Host ("admin created {0} ({1}) and deleted it OK" -f $tmp.customerId, $tmp.id)

Write-Host ""
Write-Host "ALL RBAC TESTS COMPLETE"