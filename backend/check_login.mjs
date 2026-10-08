import fs from 'fs'
const p = 'C:\\Users\\hp\\Documents\\New folder\\EXTREME FIRE SERVICES APPLICATION\\backend\\EFESMS.Api\\Controllers\\AuthController.cs'
const t = fs.readFileSync(p, 'utf8')
const lines = t.split('\n')
let inLogin = false
lines.forEach((l, i) => {
  if (l.includes('HttpPost("login")')) inLogin = true
  if (inLogin) console.log(i + 1 + ': ' + l.trim())
  if (inLogin && l.trim() === '}') inLogin = false
})