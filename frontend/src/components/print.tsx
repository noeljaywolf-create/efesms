import { createPortal } from 'react-dom'
import { Fragment, useMemo, useState } from 'react'

export const BRAND = { red: '#FC0000', blue: '#2F03FD', orange: '#FD4601', ink: '#0f0f13', pale: '#F3E7ED' }

export const CONTACT = { name: 'Extreme Fire Equipment & Services', dept: 'Dept of Fire & Safety, Harare', tel: 'Tel: 0242488270 / 1 / 2 / 3', email: 'info@extremefire.co.zw' }

// Shared letterhead used by all HTML-based document downloads as well as browser printing.
export const PRINT_LETTERHEAD_HTML = `<div class="ef-letterhead" style="display:flex;justify-content:space-between;align-items:center;gap:16px;border-bottom:4px solid ${BRAND.red};padding-bottom:12px;margin-bottom:14px"><img src="/logo.png" alt="Extreme Fire Design Inc" style="width:270px;max-width:55%;height:auto;object-fit:contain;display:block"><div style="text-align:right;font-size:10.5px;color:#0f0f13;line-height:1.6;font-weight:600"><strong>${CONTACT.name}</strong><br/>${CONTACT.dept}<br/>${CONTACT.tel}<br/>${CONTACT.email}</div></div>`

export type PrintCol = { label: string; align?: 'l' | 'r' | 'c' }
export type PrintRow = (string | number | null | undefined)[]

export type PrintDoc = {
  title: string
  subtitle?: string
  cols: PrintCol[]
  rows: PrintRow[]
  groupBy?: number
  note?: string
}

type Row = { c: string[]; i: number; n?: number }

export function PrintLetterhead({ compact }: { compact?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, borderBottom: `4px solid ${BRAND.red}`, paddingBottom: compact ? 10 : 12 }}>
      <div>
        <img src="/logo.png" alt="Extreme Fire Design Inc" style={{ width: compact ? 190 : 270, maxWidth: '100%', height: 'auto', objectFit: 'contain', display: 'block' }} />
        <div style={{ fontSize: 10.5, color: '#374151', fontWeight: 600, marginTop: 4 }}>Fire Protection &amp; Safety Equipment — Servicing · Installation · Maintenance</div>
      </div>
      <div style={{ textAlign: 'right', fontSize: 10.5, color: '#0f0f13', lineHeight: 1.6, fontWeight: 600 }}>
        <div style={{ fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.02em' }}>{CONTACT.name}</div>
        <div style={{ color: '#6b7280' }}>{CONTACT.dept}</div>
        <div style={{ color: '#6b7280' }}>{CONTACT.tel}</div>
        <div style={{ color: BRAND.blue, fontWeight: 700 }}>{CONTACT.email}</div>
      </div>
    </div>
  )
}

export function PrintableTable({ doc }: { doc: PrintDoc }) {
  const gen = new Date().toLocaleString('en-GB')
  const grouped = doc.groupBy != null && doc.groupBy >= 0 && doc.groupBy < doc.cols.length
  const groups = useMemo<Row[]>(() => {
    const out: Row[] = []
    let cur: { val: string; n: number } | null = null
    doc.rows.forEach((r, i) => {
      if (grouped) {
        const v = String(r[doc.groupBy!] ?? '')
        if (!cur || cur.val !== v) {
          cur = { val: v, n: 0 }
          out.push({ c: [v], i: -1, n: 0 })
        }
        cur.n++
        out[out.length - 1].n = cur.n
      }
      out.push({ c: r.map((x) => (x == null ? '—' : String(x))), i })
    })
    return out
  }, [doc, grouped])

  const visCols = grouped ? doc.cols.filter((_, i) => i !== doc.groupBy) : doc.cols
  const visOf = (row: string[]) => (grouped ? row.filter((_, i) => i !== doc.groupBy) : row)

  return createPortal(
    <div className="print-area ef-print">
      <div style={{ padding: '10mm 9mm', background: '#ffffff', color: '#14121a', fontFamily: "'Segoe UI', Arial, sans-serif", lineHeight: 1.42 }}>
        <PrintLetterhead />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', margin: '16px 0 6px' }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: BRAND.red }}>{doc.title}</div>
            {doc.subtitle && <div style={{ fontSize: 11.5, color: '#6b7280', fontWeight: 600 }}>{doc.subtitle}</div>}
          </div>
          <div style={{ fontSize: 10, color: '#6b7280', textAlign: 'right' }}>Generated {gen}</div>
        </div>
        <div style={{ height: 3, background: BRAND.blue, margin: '0 0 14px', borderRadius: 2 }} />

        <table className="ef-tbl" cellSpacing={0}>
          <thead>
            <tr>
              {visCols.map((c, i) => (
                <th key={i} style={{ textAlign: c.align === 'r' ? 'right' : c.align === 'c' ? 'center' : 'left' }}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr><td colSpan={Math.max(1, visCols.length)} style={{ fontStyle: 'italic', color: '#9ca3af' }}>No records.</td></tr>
            )}
            {groups.map((g, idx) => (
              <Fragment key={idx}>
                {g.i === -1 && (
                  <tr className="ef-grp">
                    <td colSpan={Math.max(1, visCols.length)}>
                      <span className="ef-grp-name">{g.c[0] || 'General'}</span>
                      <span className="ef-grp-count">{g.n ?? 0} record{(g.n ?? 0) === 1 ? '' : 's'}</span>
                    </td>
                  </tr>
                )}
                {g.i !== -1 && (
                  <tr className={g.i % 2 === 1 ? 'ef-alt' : ''}>
                    {visOf(g.c).map((v, ci) => (
                      <td key={ci} style={{ textAlign: visCols[ci].align === 'r' ? 'right' : visCols[ci].align === 'c' ? 'center' : 'left' }}>{v}</td>
                    ))}
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>

        {doc.note && (
          <div style={{ fontSize: 10, color: '#6b7280', marginTop: 10, borderLeft: `3px solid ${BRAND.orange}`, paddingLeft: 8 }}>{doc.note}</div>
        )}

        <div style={{ display: 'flex', gap: 56, marginTop: 28 }}>
          <div style={{ flex: 1 }}><div style={{ borderBottom: '1px solid #14121a', height: 32 }} /><div style={{ fontSize: 10.5, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Prepared By</div></div>
          <div style={{ flex: 1 }}><div style={{ borderBottom: '1px solid #14121a', height: 32 }} /><div style={{ fontSize: 10.5, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Checked By</div></div>
          <div style={{ flex: 1 }}><div style={{ borderBottom: '1px solid #14121a', height: 32 }} /><div style={{ fontSize: 10.5, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Authorized Signatory</div></div>
        </div>

        <div style={{ marginTop: 22, borderTop: '1px solid #e5e7eb', paddingTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#9ca3af' }}>
          <span>EFESMS — {doc.title}</span>
          <span>Generated {gen} · {CONTACT.email}</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function useTablePrint() {
  const [doc, setDoc] = useState<PrintDoc | null>(null)
  const print = (d: PrintDoc) => {
    setDoc({ ...d, ts: 0 } as PrintDoc & { ts: number })
    let didOpenPrint = false
    const openPrint = () => {
      if (didOpenPrint) return
      didOpenPrint = true
      window.print()
    }
    const img = new Image()
    img.onload = openPrint
    img.onerror = openPrint
    img.src = '/logo.png'
    setTimeout(openPrint, 1600)
  }
  const clear = () => setDoc(null)
  const node = doc ? <PrintableTable doc={doc} /> : null
  return { print, node, clear }
}

export default PrintableTable
