import fs from 'fs'
const p = 'C:\\Users\\hp\\Documents\\New folder\\EXTREME FIRE SERVICES APPLICATION\\frontend\\src\\pages\\UsersPage.tsx'
let s = fs.readFileSync(p, 'utf8')
const bad = "import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'"
const good = "import DeleteIcon from '@mui/icons-material/Delete'"
if (!s.includes(bad)) { console.log('ABORT: icon import line not found'); process.exit(1) }
s = s.replace(bad, good).replace(/DeleteOutlineIcon/g, 'DeleteIcon')
if (!s.includes("import DeleteIcon from '@mui/icons-material/Delete'")) { console.log('ABORT: new import not present'); process.exit(2) }
if (s.includes('DeleteOutline')) { console.log('ABORT: DeleteOutline still present'); process.exit(3) }
fs.writeFileSync(p, s)
console.log('OK  DeleteOutlineIcon -> DeleteIcon (import + usages)')

