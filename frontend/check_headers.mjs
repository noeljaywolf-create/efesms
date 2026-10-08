import fs from 'fs'
const pagesDir = 'C:\\Users\\hp\\Documents\\New folder\\EXTREME FIRE SERVICES APPLICATION\\frontend\\src\\pages'
for(const f of ['ReportsPage.tsx','ServicesPage.tsx','UsersPage.tsx','CustomersPage.tsx']){
  const t = fs.readFileSync(pagesDir + '\\' + f, 'utf8')
  const lines = t.split('\n')
  console.log('===== ' + f + ' =====')
  lines.forEach((l, i) => {
    if(l.includes('Typography') && (l.includes('variant="h5') || l.includes("variant='h5") || l.includes('variant="h4') || l.includes("variant='h4") || l.includes('variant="h6') || l.includes("variant='h6"))){
      console.log(i+1 + ': ' + l.trim())
    }
  })
}