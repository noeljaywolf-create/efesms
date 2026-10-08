import fs from 'fs'
const S = 'C:\\Users\\hp\\Documents\\New folder\\EXTREME FIRE SERVICES APPLICATION\\frontend\\src'
const appP = S + '\\App.tsx'
let a = fs.readFileSync(appP, 'utf8')
const chk = (x) => (a.split(x).length - 1)
if (chk("UsersPage") !== 0) throw new Error('App: UsersPage already present (' + chk("UsersPage") + ')')

const cust = "import CustomersPage from './pages/CustomersPage'"
if (!a.includes(cust)) throw new Error('App: CustomersPage import anchor missing')
a = a.replace(cust, cust + "\nimport UsersPage from './pages/UsersPage'")

const techRoute = '<Route path="/technicians" element={<TechniciansPage />} />'
if (!a.includes(techRoute)) throw new Error('App: technicians route anchor missing')
a = a.replace(techRoute, techRoute + '\n          <Route path="/users" element={<UsersPage />} />')

const excl = "'/technicians', '/invoices', '/certificates']"
if (!a.includes(excl)) throw new Error('App: exclude-list anchor missing')
a = a.replace(excl, "'/technicians', '/invoices', '/certificates', '/users']")

if (chk("UsersPage") !== 2) throw new Error('App: post UsersPage != 2 (got ' + chk("UsersPage") + ')')
if (chk("<Route path=\"/users\" element={<UsersPage />} />") !== 1) throw new Error('App: /users route != 1')
if (chk("'/users']") !== 1) throw new Error('App: /users exclude != 1')
fs.writeFileSync(appP, a)
console.log('OK  App.tsx: UsersPage import + /users route + exclude')

const navP = S + '\\lib\\navigation.ts'
let n = fs.readFileSync(navP, 'utf8')
const rep = "{ path: '/reports', label: 'Reports', roles: ['*'] },"
if (!n.includes(rep)) throw new Error('nav: Reports anchor missing')
if (n.includes("'/users'")) throw new Error('nav: /users already present')
n = n.replace(rep, rep + "\n      { path: '/users', label: 'Users', roles: ['admin', 'administrator'] },")
if (n.split("'/users'").length - 1 !== 1) throw new Error('nav: /users post != 1')
if (!n.includes("{ path: '/users', label: 'Users', roles: ['admin', 'administrator'] },")) throw new Error('nav: /users item text mismatch')
fs.writeFileSync(navP, n)
console.log('OK  navigation.ts: Users under Admin (admin|administrator)')
