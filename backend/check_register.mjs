import fs from 'fs'
const p = 'C:\\Users\\hp\\Documents\\New folder\\EXTREME FIRE SERVICES APPLICATION\\backend\\EFESMS.Api\\Controllers\\AuthController.cs'
const t = fs.readFileSync(p, 'utf8')
const lines = t.split('\n')
let inRegister = false
let count = 0
lines.forEach((l, i) => {
  if (l.includes('HttpPost("register")')) inRegister = true
  if (inRegister) {
    console.log(i + 1 + ': ' + l.trim())
    count++
  }
  if (inRegister && l.trim() === '}' && count > 10) inRegister = false
})