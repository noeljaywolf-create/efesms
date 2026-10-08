import fs from 'fs'
const p = 'C:\\Users\\hp\\Documents\\New folder\\EXTREME FIRE SERVICES APPLICATION\\backend\\EFESMS.Api\\Models'
const files = fs.readdirSync(p).filter(f => f.endsWith('.cs'))
files.forEach(f => {
  const t = fs.readFileSync(p + '\\' + f, 'utf8')
  if (t.includes('class JobIn') || t.includes('record JobIn')) {
    console.log('===== ' + f + ' =====')
    const lines = t.split('\n')
    let inJobIn = false
    lines.forEach((l, i) => {
      if (l.includes('class JobIn') || l.includes('record JobIn') || l.includes('public class JobIn')) inJobIn = true
      if (inJobIn) console.log(i + 1 + ': ' + l.trim())
      if (inJobIn && l.trim() === '}') inJobIn = false
    })
  }
})