const fs = require('fs')
const path = require('path')
const R = 'C:\\Users\\hp\\Documents\\New folder\\EXTREME FIRE SERVICES APPLICATION\\frontend\\src'
const steps = []

// 1) App.tsx — import + real route for /users
const appP = path.join(R, 'App.tsx')
let a = fs.readFileSync(appP, 'utf8')

const IMPORT_ANCHOR = "import ModulePlaceholderPage from './pages/ModulePlaceholderPage'"
if (!a.includes(IMPORT_ANCHOR)) { console.log('ABORT: ModulePlaceholderPage import not found in App.tsx'); process.exit(1) }
if (a.includes("import UsersPage from './pages/UsersPage'")) { console.log('ABORT: UsersPage already imported'); process.exit(2) }
a = a.replace(IMPORT_ANCHOR, IMPORT_ANCHOR + "\nimport UsersPage from './pages/UsersPage'")

const ROUTE_ANCHOR = `<Route path="/customers" element={<CustomersPage />} />`
if (!a.includes(ROUTE_ANCHOR)) { console.log('ABORT: customers route anchor not found'); process.exit(3) }
if (!a.includes('/users')) {
  a = a.replace(ROUTE_ANCHOR, ROUTE_ANCHOR + "\n          <Route path=\"/users\" element={<UsersPage />} />")
  // exclude /users from the NAV-driven ModulePlaceholderPage auto-flatMap so it never gets masked
  a = a.replace("'/technicians', '/invoices', '/certificates'].includes(item.path))", "'/technicians', '/invoices', '/certificates', '/users'].includes(item.path))")
} else { console.log('ABORT: /users already present in App.tsx'); process.exit(4) }

const appChecks = [
  ['App import UsersPage', a.includes("import UsersPage from './pages/UsersPage'")],
  ['App route /users', a.includes('<Route path="/users" element={<UsersPage />} />')],
  ['users excluded from placeholder map', a.includes("'/users'].includes(item.path))")],
]
for (const [n, ok] of appChecks) { console.log((ok ? 'OK  ' : 'FAIL ') + 'App.tsx: ' + n); if (!ok) process.exit(5) }
fs.writeFileSync(appP, a)
steps.push('App.tsx OK')

// 2) navigation.ts — add /users into the Admin group
const navP = path.join(R, 'lib', 'navigation.ts')
let n = fs.readFileSync(navP, 'utf8')
const ADMIN_ANCHOR = "{ path: '/technicians', label: 'Technicians', roles: ['*'] },"
if (!n.includes(ADMIN_ANCHOR)) { console.log('ABORT: technicians nav anchor not found'); process.exit(6) }
if (n.includes("'/users'")) { console.log('ABORT: /users already in navigation.ts'); process.exit(7) }
n = n.replace(ADMIN_ANCHOR, ADMIN_ANCHOR + "\n      { path: '/users', label: 'Users', roles: ['admin', 'administrator'] },")
const navChecks = [
  ['nav /users item', n.includes("{ path: '/users', label: 'Users', roles: ['admin', 'administrator'] },")],
  ['nav roles gated', n.includes("roles: ['admin', 'administrator']")],
]
for (const [c, ok] of navChecks) { console.log((ok ? 'OK  ' : 'FAIL ') + 'navigation.ts: ' + c); if (!ok) process.exit(8) }
fs.writeFileSync(navP, n)
steps.push('navigation.ts OK')

console.log('\n' + steps.join(' · ') + ' — Users wired into App routes + Admin nav (admin|administrator gated).')
