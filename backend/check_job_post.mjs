import fs from 'fs'
const p = 'C:\\Users\\hp\\Documents\\New folder\\EXTREME FIRE SERVICES APPLICATION\\backend\\EFESMS.Api\\Controllers\\OperationsController.cs'
const t = fs.readFileSync(p, 'utf8')
const lines = t.split('\n')
let inJobPost = false
lines.forEach((l, i) => {
  if (l.includes('HttpPost("jobs")')) inJobPost = true
  if (inJobPost) console.log(i + 1 + ': ' + l.trim())
  if (inJobPost && l.trim() === '}') inJobPost = false
})