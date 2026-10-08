import fs from 'fs'
const p = 'C:\\Users\\hp\\Documents\\New folder\\EXTREME FIRE SERVICES APPLICATION\\frontend\\src\\pages\\UsersPage.tsx'
let t = fs.readFileSync(p, 'utf8')

const target = '<Typography variant="h5" sx={{ fontWeight: 800 }}>Users & Technicians</Typography>'
const replacement = '<Typography variant="h5" sx={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 1 }}><GroupIcon sx={{ color: "#FF3D00" }} /> Users & Technicians</Typography>'

if (t.includes(target)) {
  t = t.replace(target, replacement)
  fs.writeFileSync(p, t)
  console.log('REPLACED with &')
} else {
  console.log('NOT FOUND')
}