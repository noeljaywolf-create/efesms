$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$userData = "C:\Users\hp\AppData\Local\Temp\opencode\chrome-efsm2"
$shotDir = "C:\Users\hp\Documents\New folder\EXTREME FIRE SERVICES APPLICATION\_review\shots"

New-Item -ItemType Directory -Force -Path $shotDir | Out-Null
function Clear-Chrome {
    Get-CimInstance Win32_Process -Filter "Name = 'chrome.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like "*$userData*" } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

# 1. Seed localStorage as tech via Vite origin (no CORS), then land on /jobs
$launcher = "C:\Users\hp\AppData\Local\Temp\opencode\efsm-seed2.html"
$seedScript = "<html><body><script>
fetch('http://localhost:5173/api/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'tech',password:'Tech@123'})})
.then(r=>r.json()).then(d=>{localStorage.setItem('efesms_token',d.token);localStorage.setItem('efesms_role',d.role);localStorage.setItem('efesms_dept',d.department);localStorage.setItem('efesms_user',d.name);location.href='http://localhost:5173/jobs';});
</script></body></html>"
Set-Content -Path $launcher -Value $seedScript

Clear-Chrome
$dom = & $chrome --headless=new --disable-gpu --user-data-dir="$userData" --virtual-time-budget=20000 --dump-dom "file://$launcher" 2>$null
"jobs dump: redirect landed on jobs? " + ($dom -match 'Job Cards')
"jobs has AI assignment? " + ($dom -match '%')
"jobs has New job button? " + ($dom -match 'New job|Assign')

$jobsDom = $dom
$jobsPage = ($jobsDom -match 'class="MuiTableRow-root"')

Clear-Chrome
$dom = & $chrome --headless=new --disable-gpu --user-data-dir="$userData" --virtual-time-budget=16000 --dump-dom "http://localhost:5173/equipment" 2>$null
"equipment: page? " + ($dom -match 'Equipment')
"equipment: risk rows? " + ($dom -match 'High|Medium|Critical|risk')

Clear-Chrome
$dom = & $chrome --headless=new --disable-gpu --user-data-dir="$userData" --virtual-time-budget=16000 --dump-dom "http://localhost:5173/inventory" 2>$null
"inventory: page? " + ($dom -match 'Inventory')
"inventory: reorder suggestions? " + ($dom -match 'reorder')

Clear-Chrome
$dom = & $chrome --headless=new --disable-gpu --user-data-dir="$userData" --virtual-time-budget=16000 --dump-dom "http://localhost:5173/reminders" 2>$null
"reminders: page? " + ($dom -match 'Smart Reminders')
"reminders: rows? " + ($dom -match 'd|Overdue|in ')

# 4 screenshots
Clear-Chrome
& $chrome --headless=new --disable-gpu --user-data-dir="$userData" --virtual-time-budget=14000 --window-size=1440,900 --screenshot="$shotDir\ops-jobs.png" "http://localhost:5173/jobs" 2>$null | Out-Null
"shot jobs: $?"
Clear-Chrome
& $chrome --headless=new --disable-gpu --user-data-dir="$userData" --virtual-time-budget=14000 --window-size=1440,900 --screenshot="$shotDir\ops-equipment.png" "http://localhost:5173/equipment" 2>$null | Out-Null
"shot equipment: $?"
Clear-Chrome
& $chrome --headless=new --disable-gpu --user-data-dir="$userData" --virtual-time-budget=14000 --window-size=1440,900 --screenshot="$shotDir\ops-inventory.png" "http://localhost:5173/inventory" 2>$null | Out-Null
"shot inventory: $?"
Clear-Chrome
& $chrome --headless=new --disable-gpu --user-data-dir="$userData" --virtual-time-budget=14000 --window-size=1440,900 --screenshot="$shotDir\ops-reminders.png" "http://localhost:5173/reminders" 2>$null | Out-Null
"shot reminders: $?"
Clear-Chrome
Get-ChildItem $shotDir -Filter "ops-*.png" -ErrorAction SilentlyContinue | ForEach-Object { "png: $($_.Name) $($_.Length)b" }
"done"