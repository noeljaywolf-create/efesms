import fs from 'fs'
import { execFileSync } from 'child_process'
const base = 'C:\\Users\\hp\\Documents\\New folder\\EXTREME FIRE SERVICES APPLICATION\\frontend'
const pages = base + '\\src\\pages'
const up = pages + '\\UsersPage.tsx'
const U = fs.readFileSync(up, 'utf8')
const m = U.match(/printable\.print\(\{[\s\S]*?\n\s*\}\)/)
if (!m) { console.log('ABORT: UsersPage print literal not found on disk'); process.exit(2) }
const greenLit = m[0]
console.log('GREEN users literal chars=' + greenLit.length)

for (const f of ['ReportsPage.tsx', 'ServicesPage.tsx']) {
  const p = pages + '\\' + f
  const t = fs.readFileSync(p, 'utf8')
  const mm = t.match(/printable\.print\(\{[\s\S]*?\n\s*\}\)/)
  if (!mm) { console.log('NO print-call in ' + f + ' (already ok or different shape)'); continue }
  const title = f === 'ReportsPage.tsx' ? "Reports & Documents" : "Services Activity"
  const repl = greenLit.replace(/Users & Technician Directory/g, title)
  const nt = t.slice(0, t.indexOf(mm[0])) + repl + t.slice(t.indexOf(mm[0]) + mm[0].length)
  fs.writeFileSync(p, nt)
  console.log('patched print-call in ' + f)
}

try {
  const b = execFileSync(
    'C:\\Program Files\\nodejs\\npm.cmd',
    ['run', 'build'],
    { cwd: base, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, timeout: 600000 }
  )
  const hits = b.split('\n').filter(l => /built in|error TS/.test(l))
  console.log('BUILD_EXIT=0 (GREEN)'); hits.slice(0, 4).forEach(l => console.log('  ' + l.trim()))
} catch (e) {
  console.log('BUILD_EXIT>0')
  const all = String(e.stdout || '') + String(e.stderr || '')
  all.split('\n').filter(l => /error TS/.test(l)).slice(0, 6).forEach(l => console.log('  ' + l.trim()))
}
