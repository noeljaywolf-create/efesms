import fs from 'fs'
const p = 'C:\\Users\\hp\\Documents\\New folder\\EXTREME FIRE SERVICES APPLICATION\\backend\\EFESMS.Api\\Controllers\\AuthController.cs'
const t = fs.readFileSync(p, 'utf8')
const lines = t.split('\n')
let inLogin = false
let count = 0
lines.forEach((l, i) => {
  if (l.includes('HttpPost("login")')) inLogin = true
  if (inLogin) {
    console.log(i + 1 + ': ' + l.trim())
    count++
  }
  if (inLogin && l.trim() === '}') {
    if (count > 10) inLogin = false
  }
})