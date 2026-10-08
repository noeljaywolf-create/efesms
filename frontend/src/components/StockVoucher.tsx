import { createPortal } from 'react-dom'
import { PrintLetterhead } from './print'

export type VoucherKind = 'issue' | 'receive'

type Props = {
  kind: VoucherKind
  itemName: string
  category: string
  unit?: string | null
  qty: number
  displayName: string
  customerName?: string | null
  jobNumber?: string | null
  reference?: string | null
  notes?: string | null
  date: Date
  voucherNo: string
  stockBefore: number
  stockAfter: number
}

const s = {
  page: { background: '#ffffff', color: '#111', fontFamily: `'Segoe UI', Arial, sans-serif', Arial, sans-serif`, padding: '28px 34px', lineHeight: 1.45 },
  titleRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 4px' },
  title: { fontSize: 19, fontWeight: 800, letterSpacing: '0.06em', color: '#0f0f13', textTransform: 'uppercase' as const },
  sub: { fontSize: 11.5, color: '#FF3D00', fontWeight: 700, marginBottom: 8 },
  rule: { border: 0, borderTop: '1px solid #e5e7eb', margin: '12px 0' },
  table: { width: '100%', borderCollapse: 'collapse' as const, marginTop: 4 },
  th: { textAlign: 'left', fontSize: 10.5, letterSpacing: '0.05em', color: '#6b7280', textTransform: 'uppercase' as const, padding: '6px 8px', borderBottom: '1px solid #e5e7eb', fontWeight: 700 },
  td: { padding: '8px', fontSize: 14, color: '#111', borderBottom: '1px dashed #e5e7eb', fontWeight: 600 },
  label: { fontSize: 10.5, letterSpacing: '0.05em', color: '#6b7280', textTransform: 'uppercase' as const, fontWeight: 700, padding: '6px 8px 2px', borderBottom: 0 as const },
  value: { fontSize: 14, color: '#111', padding: '0 8px 8px', fontWeight: 600 },
  sigFrame: { display: 'flex', gap: 40, marginTop: 40, flexWrap: 'wrap' as const },
  sig: { flex: 1, minWidth: 180 },
  sigLine: { borderBottom: '1px solid #111', height: 30, marginBottom: 6 },
  sigLabel: { fontSize: 11, color: '#374151', fontWeight: 600, letterSpacing: '0.03em' },
  foot: { marginTop: 26, borderTop: '1px solid #e5e7eb', paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: '#9ca3af' },
} as const

const numWords = (n: number): string => {
  if (!Number.isFinite(n) || n <= 0) return 'Zero'
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']
  const chunk = (x: number): string => {
    if (x < 20) return ones[x]
    if (x < 100) return `${tens[Math.floor(x / 10)]}${x % 10 ? ' ' + ones[x % 10] : ''}`
    return `${ones[Math.floor(x / 100)]} Hundred${x % 100 ? ' ' + chunk(x % 100) : ''}`
  }
  const big = Math.floor(n)
  let out = ''
  if (big >= 1000) out = `${chunk(Math.floor(big / 1000))} Thousand`
  const rest = big % 1000
  if (rest) out += (out ? ' ' : '') + chunk(rest)
  return out || 'Zero'
}

const fmtQty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))

export default function StockVoucher(p: Props) {
  const unit = p.unit || 'units'
  const action = p.kind === 'issue' ? 'ISSUED TO' : 'RECEIVED FROM / REFERENCE'
  const signA = p.kind === 'issue' ? 'Issued By' : 'Received By'
  const signB = p.kind === 'issue' ? 'Authorized By' : 'Authorized By'
  const signC = p.kind === 'issue' ? 'Received By' : 'Stock Officer'
  const who = p.kind === 'issue' ? p.customerName || '—' : p.reference || '—'
  const title = p.kind === 'issue' ? 'STOCK ISSUE VOUCHER' : 'STOCK RECEIPT VOUCHER'
  const dateStr = p.date.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })

  return createPortal(
    <div className="print-area">
      <div style={s.page}>
        <PrintLetterhead />

        <div style={s.titleRow}>
          <div>
            <div style={s.title}>{title}</div>
            <div style={s.sub}>Official record of fire equipment stock movement</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#0f0f13' }}>Voucher No: {p.voucherNo}</div>
            <div style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>Date: {dateStr}</div>
          </div>
        </div>

        <table style={s.table}>
          <tbody>
            <tr>
              <td style={{ ...s.label, width: '24%' }}>{p.kind === 'issue' ? 'Issued By' : 'Added By'}</td>
              <td style={{ ...s.label, width: '28%' }}>Date</td>
              <td style={{ ...s.label, width: '24%' }}>Voucher No</td>
              <td style={{ ...s.label }}>Status</td>
            </tr>
            <tr>
              <td style={s.value}>{p.displayName}</td>
              <td style={s.value}>{dateStr}</td>
              <td style={s.value}>{p.voucherNo}</td>
              <td style={s.value}>Pending Stock Capture</td>
            </tr>
            <tr>
              <td style={s.label}>Item</td>
              <td style={s.label}>Category</td>
              <td style={s.label}>Unit</td>
              <td style={s.label}>Quantity</td>
            </tr>
            <tr>
              <td style={s.value} colSpan={1}>{p.itemName}</td>
              <td style={s.value}>{p.category}</td>
              <td style={s.value}>{p.unit || '—'}</td>
              <td style={{ ...s.value, fontWeight: 800 }}>{fmtQty(p.qty)} {unit}</td>
            </tr>
            <tr>
              <td colSpan={4} style={{ ...s.value, borderTop: '1px dashed #e5e7eb' }}>
                In words: <b>{numWords(p.qty)} ({unit})</b>
              </td>
            </tr>
            <tr>
              <td style={s.label}>{action}</td>
              <td style={s.label}>Stock Before</td>
              <td style={s.label}>Stock After</td>
              <td style={s.label}>Notes</td>
            </tr>
            <tr>
              <td style={s.value}>{who}</td>
              <td style={s.value}>{p.stockBefore} {unit}</td>
              <td style={s.value}>{p.stockAfter} {unit}</td>
              <td style={s.value}>{p.notes || '—'}</td>
            </tr>
            {p.jobNumber ? (
              <tr>
                <td style={s.label}>Job Reference</td>
                <td style={s.value} colSpan={3}>{p.jobNumber}</td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <div style={s.sigFrame}>
          <div style={s.sig}>
            <div style={s.sigLine} />
            <div style={s.sigLabel}>{signA} — Signature</div>
          </div>
          <div style={s.sig}>
            <div style={s.sigLine} />
            <div style={s.sigLabel}>{signB} — Signature</div>
          </div>
          <div style={s.sig}>
            <div style={s.sigLine} />
            <div style={s.sigLabel}>{signC} — Signature</div>
          </div>
        </div>

        <div style={s.foot}>
          <span>EFESMS — Fire Operations Document</span>
          <span>Generated {p.date.toLocaleString('en-GB')}</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export { numWords }