import fs from 'fs'
import { execFileSync } from 'child_process'

const pages = 'C:\\Users\\hp\\Documents\\New folder\\EXTREME FIRE SERVICES APPLICATION\\frontend\\src\\pages'
const repo = 'C:\\Users\\hp\\Documents\\New folder\\EXTREME FIRE SERVICES APPLICATION\\frontend'

const targets = [
  { file: 'ReportsPage.tsx', title: 'Reports & Documents' },
  { file: 'ServicesPage.tsx', title: 'Services Activity' },
]

function buildLiteral(title) {
  const parts = []
  parts.push('printable.print({')
  parts.push('      title: ' + JSON.stringify(title) + ',')
  parts.push('      subtitle: `${insp.length} inspections \\cdot ${maint.length} maintenance \\cdot ${refill.length} refills`,')
  parts.push('      cols: [')
  parts.push('        { label: "Metric" },')
  parts.push('        { label: "Value" },')
  parts.push('        { label: "Context" },')
  parts.push('      ],')
  parts.push('      rows: [')
  parts.push('        ...metrics.map((m) => [m.label, m.value, m.detail]),')
  parts.push('        ...spans.map((s) => [s.label, s.value, s.detail]),')
  parts.push('      ],')
  parts.push('    })')
  return parts.join('\n')
}

for (const t of targets) {
  const p = pages + '\\' + t.file
  const src = fs.readFileSync(p, 'utf8')
  const m = src.match(/printable\.print\(\{[\s\S]*?\n\s*\}\)/)
  if (!m) { console.log('SKIP ' + t.file + ': no literal'); continue }
  const nt = src.slice(0, m.index) + buildLiteral(t.title) + src.slice(m.index + m[0].length)
  const cleaned = nt.replace(/ en?flexWrap="wrap"/g, '').replace(/ flexWrap="wrap"/g, '')
  fs.writeFileSync(p, cleaned)
  console.log('PATCHED ' + t.file)
}

try {
  const b = execFileSync('C:\\Program Files\\nodejs\\npm.cmd', ['run', 'build'], {
    cwd: repo, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, timeout: 600000, stdio: ['ignore', 'pipe', 'pipe'],
  })
  console.log('BUILD=GREEN')
  b.split('\n').forEach((l) => { const tr = l.trim(); if (/built in/.test(tr)) console.log('  ' + tr) })
} catch (e) {
  console.log('BUILD=RED exit=' + (e.status ?? '?'))
  const out = String((e.stdout || '') + (e.stderr || ''))
  out.split('\n').forEach((l) => { if (/error TS/.test(l)) console.log('  ' + l.trim()) })
}
