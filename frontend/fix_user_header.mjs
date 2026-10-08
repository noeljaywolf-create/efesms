import fs from 'fs'
const p = 'C:\\Users\\hp\\Documents\\New folder\\EXTREME FIRE SERVICES APPLICATION\\frontend\\src\\pages\\UsersPage.tsx'
let t = fs.readFileSync(p, 'utf8')
t = t.replace(
  '<Typography variant="h5" sx={{ fontWeight: 800 }}>Users & Technicians</Typography>',
  '<Typography variant="h5" sx={{ fontWeight: 800, color: "#111" }}>Users & Technicians</Typography>'
)
fs.writeFileSync(p, t)
console.log('fixed UsersPage header')