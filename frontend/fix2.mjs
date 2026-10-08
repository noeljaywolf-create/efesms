import fs from 'fs'
const PUSH='C:\\Users\\hp\\Documents\\New folder\\EXTREME FIRE SERVICES APPLICATION\\frontend\\src\\pages'
const GREEN_LINES = [
  'const printable = useTablePrint()',
  'printable.print({',
  "cols: [",
]
function regen(file, outTitle, subOf, labelPrefix) {
  const p = PUSH + '\\' + file
  if (!fs.existsSync(p)) { console.log('ABORT missing ' + file); process.exit(1) }
  const src = fs.readFileSync(p, 'utf8')
  const green = GREEN_LINES.every(l => src.includes(l))
  console.log((green ? 'GREEN ' : 'RED   ') + file + '  has green contract=' + green)
  if (green) return
  // pull the users-green contract from UsersPage.tsx (known-good, identical shape)
  const up = PUSH + '\\UsersPage.tsx'
  const u = fs.readFileSync(up, 'utf8')
  const startMarker = 'const printable = useTablePrint()'
  const endMarker = 'export default'
  const si = u.indexOf(startMarker)
  if (si < 0) { console.log('ABORT UsersPage contract marker missing'); process.exit(2) }
  const seg = u.slice(si)
  const ei = seg.indexOf('}\n\nexport default')
  if (ei < 0) { console.log('ABORT UsersPage end marker missing'); process.exit(3) }
  const contractBody = seg.slice(0, ei)
  let out = src
  // 1) replace any existing useTablePrint hook-resolution with a call to the green hook
  if (out.includes('const printable = useTablePrint()')) {
    // keep
  } else {
    out = out.replace(/const printable = .*\n/, 'const printable = useTablePrint()\n')
  }
  // 2) replace the print call block (print({...})) with green contract
  const callStart = out.indexOf('const doPrint')
  if (callStart >= 0) {
    out = out.slice(0, callStart) + contractBody + out.slice(callStart + contractBody.length)
  }
  fs.writeFileSync(p, out)
  console.log('OK   patched ' + file)
}
// where the actual file truly is:
const real = 'C:\\Users\\hp\\Documents\\New folder\\EXTREME FIRE SERVICES APPLICATION\\frontend\\src\\pages\\ServicesPage.tsx'
console.log('real-exists=' + fs.existsSync(real))
regen('ReportsPage.tsx', 'Reports', 'reports activity', null)
regen('ServicesPage.tsx', 'Services', 'service activity', null)
console.log('done')
