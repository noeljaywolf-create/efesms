import fs from 'fs'
import { execFileSync } from 'child_process'

const pagesDir = 'C:\\Users\\hp\\Documents\\New folder\\EXTREME FIRE SERVICES APPLICATION\\frontend\\src\\pages'
const feDir = 'C:\\Users\\hp\\Documents\\New folder\\EXTREME FIRE SERVICES APPLICATION\\frontend'

function patchR(f, label) {
  const p = pagesDir + '\\' + f
  const t = fs.readFileSync(p, 'utf8')
  let nt = t
  const before = { R: (t.match(/R /g) || []).length }
  nt = nt.replace(/R /g, '$ ')
  const sec = (nt.match(/"text\.secondary"/g) || []).length
  nt = nt.replace(/color="text\.secondary"/g, 'color="#111"')
  nt = nt.replace(/"text\.secondary"/g, '"#111"')
  fs.writeFileSync(p, nt)
  const after = fs.readFileSync(p, 'utf8')
  console.log(label + ': wrote chars=' + after.length + ' | R-before=' + before.R + ' | greyProps->black=' + sec)
}

patchR('ReportsPage.tsx', 'ReportsPage')
patchR('ServicesPage.tsx', 'ServicesPage')

try {
  const out = execFileSync('C:\\Program Files\\nodejs\\npm.cmd', ['run', 'build'], {
    cwd: feDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 128 * 1024 * 1024, timeout: 420000,
  })
  console.log('BUILD=GREEN ' + (out.match(/built in [\d.]+s/) || [''])[0])
} catch (e) {
  console.log('BUILD=RED')
  const tx = String((e.stdout || '') + (e.stderr || ''))
  tx.split('\n').filter((l) => /error TS/.test(l)).slice(0, 8).forEach((l) => console.log('  ' + l.trim()))
}