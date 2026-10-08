import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControl,
  InputLabel, LinearProgress, MenuItem, Paper, Select, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography, useMediaQuery,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import RefreshIcon from '@mui/icons-material/Refresh'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import SouthEastIcon from '@mui/icons-material/SouthEast'
import NorthEastIcon from '@mui/icons-material/NorthEast'
import PrintIcon from '@mui/icons-material/Print'
import { api } from '../api/client'
import { DANGER_COLORS, PRIORITY_COLORS, type InventoryRow, type ForecastResult, type ReorderSuggestion, type EngineOutput } from '../types/fireops'
import StockVoucher from '../components/StockVoucher'
import type { VoucherKind } from '../components/StockVoucher'
import { lightFieldSx } from '../lib/fieldSx'
import { useTablePrint } from '../components/print'

type StockMovement = {
  id: number
  type: 'in' | 'out'
  source: string
  qty: number
  customerName?: string | null
  jobNumber?: string | null
  reference?: string | null
  notes?: string | null
  movedBy?: string | null
  movedAt: string
  balanceAfter: number
}

const CATEGORIES = ['Extinguishers', 'Agents', 'Spares', 'Nozzles', 'Signage', 'Other']

const usd = (n?: number | null) => (n != null ? `US$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—')
const dd = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const dt = (d?: string | null) => (d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—')

export default function InventoryPage() {
  const isMobile = useMediaQuery('(max-width: 700px)')
  const [rows, setRows] = useState<InventoryRow[]>([])
  const [forecasts, setForecasts] = useState<Record<string, ForecastResult>>({})
  const [reorders, setReorders] = useState<ReorderSuggestion[]>([])
  const [, setAi] = useState<EngineOutput | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState<InventoryRow | null>(null)
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [movLoading, setMovLoading] = useState(false)
  const [refs, setRefs] = useState({ customers: [] as any[], jobs: [] as any[] })
  const [mvDialog, setMvDialog] = useState<null | 'receive' | 'issue'>(null)
  const [mvForm, setMvForm] = useState({ qty: '', customerId: '', jobId: '', reference: '', notes: '' })
  const [mvSaving, setMvSaving] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [form, setForm] = useState({ name: '', category: 'Extinguishers', currentStock: '', reorderLevel: '', unitCost: '', unit: '', customerName: '', lastReceivedQty: '' })
  const [invQuery, setInvQuery] = useState('')
  const [displayName, setDisplayName] = useState(localStorage.getItem('efesms_display') || localStorage.getItem('efesms_user') || 'you')
  const [voucher, setVoucher] = useState<{ kind: VoucherKind; qty: number; customerName?: string; jobNumber?: string; reference?: string; notes: string; slip?: StockMovement } | null>(null)
  const tablePrint = useTablePrint()

  const role = localStorage.getItem('efesms_role') ?? ''
  const dept = localStorage.getItem('efesms_dept') ?? ''
  const canWrite = ['admin', 'administrator', 'management', 'technician', 'contracts manager', 'stores man'].includes((role || '').toLowerCase()) ||
    ['technical', 'operations', 'administration', 'contracts', 'stores'].includes((dept || '').toLowerCase())
  const isAdmin = ['admin', 'administrator'].includes((role || '').toLowerCase())
  const [delItem, setDelItem] = useState<InventoryRow | null>(null)
  const [delConfirm, setDelConfirm] = useState('')
  const [delBusy, setDelBusy] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.get<InventoryRow[]>('/operations/inventory')
      setRows(r.data)
      if (sel) {
        const fresh = r.data.find((x) => x.id === sel.id)
        if (fresh) setSel(fresh)
      }
    } catch (x) { setErr('Failed to load inventory') }
    try {
      const a = await api.post<EngineOutput>('/operations/analyze/full', {})
      setAi(a.data)
      setReorders(a.data.reorders)
      const f: Record<string, ForecastResult> = {}
      a.data.forecasts.forEach((x) => { f[x.itemName] = x })
      setForecasts(f)
    } catch (x) { /* analysis optional */ }
    setLoading(false)
  }

  const loadRefs = async () => {
    try {
      const c = await api.get<any[]>('/customers')
      setRefs((p) => ({ ...p, customers: (c.data ?? []).filter((x) => x.id && x.name) }))
    } catch { /* ignore */ }
    try {
      const j = await api.get<any[]>('/operations/jobs')
      setRefs((p) => ({ ...p, jobs: (j.data ?? []).filter((x) => x.id && x.jobNumber) }))
    } catch { /* ignore */ }
  }

  const loadMovements = async (id: number) => {
    setMovLoading(true)
    try {
      const m = await api.get<StockMovement[]>(`/operations/inventory/${id}/movements`)
      setMovements(m.data)
    } catch { setMovements([]) }
    setMovLoading(false)
  }

  useEffect(() => {
    load()
    loadRefs()
    ;(async () => {
      try {
        const me = await api.get<any>('/auth/me')
        if (me.data?.displayName) {
          setDisplayName(me.data.displayName)
          localStorage.setItem('efesms_display', me.data.displayName)
        }
      } catch { /* keep fallback */ }
    })()
  }, [])

  const create = async () => {
    setSaving(true)
    setErr('')
    try {
      await api.post('/operations/inventory', {
        name: form.name,
        category: form.category,
        currentStock: Number(form.currentStock || 0),
        reorderLevel: Number(form.reorderLevel || 0),
        unitCost: Number(form.unitCost || 0),
        unit: form.unit || null,
        customerName: form.customerName || null,
        lastReceivedQty: form.lastReceivedQty === '' ? null : Number(form.lastReceivedQty),
      })
      setOpen(false)
      setForm({ name: '', category: 'Extinguishers', currentStock: '', reorderLevel: '', unitCost: '', unit: '', customerName: '', lastReceivedQty: '' })
      await load()
    } catch (x: any) {
      setErr(x?.response?.data?.message ?? 'Could not create item')
    }
    setSaving(false)
  }

  const openMv = async (kind: 'receive' | 'issue') => {
    setMvForm({ qty: '', customerId: '', jobId: '', reference: '', notes: '' })
    setMvDialog(kind)
    if (sel) await loadMovements(sel.id)
  }

  const doDeleteItem = async () => {
    if (!delItem) return
    setDelBusy(true)
    setErr('')
    try {
      await api.delete(`/operations/inventory/${delItem.id}`)
      setDelItem(null)
      setDelConfirm('')
      setSel(null)
      await load()
    } catch (x: any) {
      setErr(x?.response?.data?.message ?? 'Could not delete item — admins only.')
    }
    setDelBusy(false)
  }

  const submitMv = async () => {    if (!sel) return
    const qty = Number(mvForm.qty)
    if (!qty || qty <= 0) { setErr('Enter a quantity greater than zero.'); return }
    if (mvDialog === 'issue' && qty > sel.currentStock) { setErr(`You only have ${sel.currentStock} ${sel.unit ?? ''} in stock — cannot issue ${qty}.`); return }
    setMvSaving(true)
    setErr('')
    try {
      await api.post(`/operations/inventory/${sel.id}/${mvDialog}`, {
        qty,
        customerId: mvForm.customerId ? Number(mvForm.customerId) : null,
        jobId: mvForm.jobId ? Number(mvForm.jobId) : null,
        reference: mvForm.reference || null,
        notes: mvForm.notes || null,
      })
      setMvDialog(null)
      await load()
      await loadMovements(sel.id)
    } catch (x: any) {
      setErr(x?.response?.data?.message ?? 'Could not save — try again.')
    }
    setMvSaving(false)
  }

  const low = rows.filter((r) => r.currentStock <= r.reorderLevel)

  const filtered = rows.filter((r) => {
    const q = invQuery.trim().toLowerCase()
    if (!q) return true
    return [r.name, r.category, r.customerName ?? '']
      .some((v) => (v ?? '').toLowerCase().includes(q))
  })

  const printVoucher = () => {
    if (!sel) return
    const qty = Number(mvForm.qty)
    if (!qty || qty <= 0) { setErr('Enter a quantity greater than zero before printing.'); return }
    if (mvDialog === 'issue' && qty > sel.currentStock) { setErr(`Can only print for the ${sel.currentStock} ${sel.unit ?? ''} available.`); return }
    const kind = mvDialog as VoucherKind
    const customerName = refs.customers.find((c) => String(c.id) === String(mvForm.customerId))?.name
    const jobNumber = refs.jobs.find((j) => String(j.id) === String(mvForm.jobId))?.jobNumber
    tablePrint.clear()
    setVoucher({ kind, qty, customerName, jobNumber, reference: mvForm.reference || undefined, notes: mvForm.notes })
    setTimeout(() => window.print(), 200)
  }

  const voucherNo = (kind: VoucherKind) => {
    const d = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    return `${kind === 'issue' ? 'ISS' : 'REC'}-${sel?.id ?? '0'}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  }

  const slipVoucher = (m: StockMovement) => {
    tablePrint.clear()
    setVoucher({
      kind: m.type === 'in' ? 'receive' : 'issue',
      qty: m.qty,
      customerName: m.customerName ?? undefined,
      jobNumber: m.jobNumber ?? undefined,
      reference: m.reference ?? undefined,
      notes: m.notes ?? '—',
      slip: m,
    })
    setTimeout(() => window.print(), 200)
  }

  const stockStatus = (r: InventoryRow) => (r.currentStock > r.reorderLevel ? 'OK' : 'Restock now')

  const printInventory = () => {
    setVoucher(null)
    tablePrint.print({
      title: 'Inventory Register',
      subtitle: `${filtered.length} items · ${low.length} need restocking · grouped by stock status`,
      cols: [
        { label: 'Stock status' }, { label: 'Item' }, { label: 'Category' }, { label: 'Customer' },
        { label: 'Stock', align: 'r' }, { label: 'Restock at', align: 'r' }, { label: 'Last restock' }, { label: 'Unit cost', align: 'r' }, { label: 'Needed next month', align: 'r' },
      ],
      rows: filtered.map((r) => {
        const f = forecasts[r.name]
        return [
          stockStatus(r),
          r.name,
          r.category,
          r.customerName || '—',
          String(r.currentStock),
          String(r.reorderLevel),
          r.lastReceivedQty != null ? `${r.lastReceivedQty} ${r.unit ?? ''} · ${dd(r.lastReceivedDate)}` : '—',
          usd(r.unitCost),
          f ? String(Math.round(f.forecastNextMonth)) : '—',
        ]
      }),
      groupBy: 0,
      note: 'Reorder suggestions and usage forecasts from the inventory engine are included where available.',
    })
  }

  const printLedger = () => {
    if (!sel) return
    setVoucher(null)
    tablePrint.print({
      title: 'Stock Ledger',
      subtitle: `${sel.name} · ${sel.category}${sel.unit ? ` · ${sel.unit}` : ''} — current stock ${sel.currentStock}`,
      cols: [
        { label: 'Type' }, { label: 'Date' }, { label: 'Qty', align: 'r' }, { label: 'Stock after', align: 'r' },
        { label: 'Where it went / From' }, { label: 'By' }, { label: 'Comment' },
      ],
      rows: movements.map((m) => [
        m.type === 'in' ? 'Added' : m.source === 'job' ? 'Used · Job' : 'Used',
        dt(m.movedAt),
        `${m.type === 'in' ? '+' : '−'}${m.qty}`,
        `${m.balanceAfter} ${sel.unit ?? ''}`,
        m.customerName || m.jobNumber || m.reference || '—',
        m.movedBy || '—',
        m.notes || '—',
      ]),
      groupBy: 0,
      note: `Every line of this ledger corresponds to a signed Stock Issue or Stock Receipt Voucher.`,
    })
  }

  const Detail = sel ? (
    <Dialog open={!!sel} onClose={() => setSel(null)} fullWidth maxWidth="md" fullScreen={isMobile} sx={{ '& .MuiPaper-root': { borderRadius: 3 } }}>
      <DialogContent sx={{ p: 0, bgcolor: '#ffffff' }}>
        <Box sx={{ p: 2.5, borderBottom: '1px solid #eef0f4', bgcolor: '#fafafc', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography sx={{ fontWeight: 800, color: '#0f0f13', fontSize: 17 }}>{sel.name}</Typography>
            <Typography variant="caption" sx={{ color: '#6b7280' }}>{sel.category}{sel.unit ? ` · ${sel.unit}` : ''} · stock {sel.currentStock}</Typography>
          </Box>
          {canWrite && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button size="small" variant="outlined" startIcon={<NorthEastIcon sx={{ color: '#2e7d32' }} />} onClick={() => openMv('receive')} sx={{ borderRadius: 2, color: '#0f0f13', borderColor: '#e5e7eb' }}>
                Add Stock
              </Button>
              <Button size="small" variant="outlined" startIcon={<SouthEastIcon sx={{ color: '#FF3D00' }} />} onClick={() => openMv('issue')} sx={{ borderRadius: 2, color: '#0f0f13', borderColor: '#e5e7eb' }}>
                Use Stock
              </Button>
              <Button size="small" variant="outlined" onClick={() => setSel(null)} sx={{ borderRadius: 2, color: '#0f0f13', borderColor: '#e5e7eb' }}>Close</Button>
              {isAdmin && (
                <Button size="small" variant="outlined" color="error" onClick={() => { setDelItem(sel); setDelConfirm('') }} sx={{ borderRadius: 2 }}>
                  Delete (admin)
                </Button>
              )}
            </Box>
          )}
        </Box>
        <Box sx={{ p: 2.5 }}>
          <Row label="Stock status" value={<Chip size="small" label={sel.currentStock > sel.reorderLevel ? 'OK' : 'Restock now'} sx={{ bgcolor: `${sel.currentStock > sel.reorderLevel ? DANGER_COLORS.safe : DANGER_COLORS.critical}18`, color: sel.currentStock > sel.reorderLevel ? DANGER_COLORS.safe : DANGER_COLORS.critical, fontWeight: 800 }} />} />
          <Row label="Current stock" value={`${sel.currentStock} ${sel.unit ?? ''}`} />
          <Row label="Restock at" value={`${sel.reorderLevel} ${sel.unit ?? ''}`} />
          <Row label="Customer" value={sel.customerName || '—'} />
          <Row label="Last restock" value={sel.lastReceivedQty != null ? `${sel.lastReceivedQty} ${sel.unit ?? ''}` : '—'} />
          <Row label="Last restock date" value={dd(sel.lastReceivedDate)} />
          <Row label="Unit cost" value={usd(sel.unitCost)} money />
          <Row label="Restock takes" value={`${sel.leadTimeDays} days`} />
          {(() => { const f = forecasts[sel.name]; const r = reorders.find((x) => x.itemId === sel.id); return (
            <>
              <Row label="Expected use next month" value={f ? `${Math.round(f.forecastNextMonth)} ${sel.unit ?? ''}` : '—'} />
              <Row label="Usage trend" value={f ? `${f.trend >= 0 ? '+' : ''}${f.trend.toFixed(1)}/mo` : '—'} />
              <Row label="Suggested order" value={r ? `${r.suggestedOrderQty} ${sel.unit ?? ''} · ${r.urgency}` : '—'} />
            </> ) })()}
        </Box>

        <Box sx={{ px: 2.5, pb: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, flexWrap: 'wrap', gap: 1 }}>
          <Typography sx={{ fontWeight: 800, color: '#0f0f13' }}>Stock history</Typography>
          {movements.length > 0 && (
            <Button size="small" startIcon={<PrintIcon />} onClick={printLedger} sx={{ borderRadius: 2, color: '#0f0f13', borderColor: '#e5e7eb' }} variant="outlined">Print Stock Ledger</Button>
          )}
        </Box>
          {movLoading ? (
            <Typography variant="caption" sx={{ color: '#9ca3af' }}>Loading stock history…</Typography>
          ) : movements.length === 0 ? (
            <Typography variant="caption" sx={{ color: '#9ca3af' }}>No stock history yet — use Add stock / Use stock to record stock coming in or going out.</Typography>
          ) : (
            <>
            <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #eef0f4', borderRadius: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { bgcolor: '#fafafc', fontWeight: 800, color: '#0f0f13', borderBottom: '1px solid #eef0f4', fontSize: 12 } }}>
                    <TableCell>Date</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>Qty</TableCell>
                    <TableCell>Stock after</TableCell>
                    <TableCell>Where it went / From</TableCell>
                    {!isMobile && <TableCell>By</TableCell>}
                    {!isMobile && <TableCell>Comment</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {movements.map((m) => (
                    <TableRow key={m.id} hover onClick={() => slipVoucher(m)} sx={{ cursor: 'pointer', '&:hover': { bgcolor: '#fff3ea' } }}>
                      <TableCell><Typography variant="caption" sx={{ color: '#6b7280', fontWeight: 600 }}>{dt(m.movedAt)}</Typography></TableCell>
                      <TableCell><Chip size="small" label={m.type === 'in' ? 'Added' : m.source === 'job' ? 'Used · Job' : 'Used'} sx={{ bgcolor: `${m.type === 'in' ? '#2e7d32' : '#FF3D00'}14`, color: m.type === 'in' ? '#2e7d32' : '#FF3D00', fontWeight: 800, fontSize: 11 }} /></TableCell>
                      <TableCell><Typography sx={{ fontWeight: 800, color: m.type === 'in' ? '#2e7d32' : '#d32f2f', fontSize: 13 }}>{m.type === 'in' ? '+' : '−'}{m.qty}</Typography></TableCell>
                      <TableCell><Typography sx={{ fontWeight: 700, color: '#0f0f13', fontSize: 13 }}>{m.balanceAfter} {sel.unit ?? ''}</Typography></TableCell>
                      <TableCell>
                        {m.customerName && <Typography variant="caption" sx={{ fontWeight: 700, color: '#0f0f13' }}>{m.customerName}</Typography>}
                        {m.jobNumber && <Typography variant="caption" sx={{ display: 'block', color: '#FF3D00', fontWeight: 700 }}>{m.jobNumber}</Typography>}
                        {!m.customerName && !m.jobNumber && m.reference && <Typography variant="caption" sx={{ color: '#6b7280' }}>{m.reference}</Typography>}
                        {!m.customerName && !m.jobNumber && !m.reference && <Typography variant="caption" sx={{ color: '#9ca3af' }}>—</Typography>}
                      </TableCell>
                      {!isMobile && <TableCell><Typography variant="caption" sx={{ fontWeight: 700, color: '#0f0f13' }}>{m.movedBy || '—'}</Typography></TableCell>}
                      {!isMobile && <TableCell><Typography variant="caption" sx={{ color: '#6b7280' }}>{m.notes || '—'}</Typography></TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Typography variant="caption" sx={{ color: '#9ca3af', display: 'block', mt: 0.75 }}>
              Click any row to open its printable Stock Movement Slip.
            </Typography>
            </>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  ) : null

  return (
    <Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h4" sx={{ fontWeight: 900, color: '#f2f2f7', letterSpacing: '-0.02em' }}>Inventory</Typography>
          <Typography variant="body2" sx={{ color: '#9aa0b0' }}>
            {loading ? 'Loading…' : `${rows.length} items · ${low.length} need restocking`}{' '}
            · click a row to see details and stock history
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<PrintIcon />} disabled={rows.length === 0} onClick={printInventory} sx={{ borderRadius: 2 }}>Print</Button>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={() => { load(); loadRefs() }} sx={{ borderRadius: 2 }}>Refresh</Button>
        {canWrite && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)} sx={{ borderRadius: 2, bgcolor: '#FF3D00', '&:hover': { bgcolor: '#C42A00' } }}>
            Add item
          </Button>
        )}
      </Box>

      {err && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr('')}>{err}</Alert>}

      <TextField
        label="Search by item, category, or customer"
        fullWidth
        size="small"
        value={invQuery}
        onChange={(e) => setInvQuery(e.target.value)}
        sx={{ mb: 2, ...lightFieldSx }}
      />

      {reorders.length > 0 && (
        <Paper elevation={0} sx={{ mb: 2.5, border: '1px solid #ffd8c9', borderRadius: 2.5, p: 2, bgcolor: '#fff7f2' }}>
          <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f0f13', display: 'flex', alignItems: 'center', gap: 1, fontSize: 16 }}>
            <AutoAwesomeIcon sx={{ color: '#FF3D00' }} /> Needs restocking
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 1.5 }}>
            {reorders.map((r) => (
              <Chip
                key={r.itemId}
                sx={{ height: 'auto', py: 1, '& .MuiChip-label': { whiteSpace: 'normal' }, bgcolor: `${PRIORITY_COLORS[r.urgency] ?? DANGER_COLORS.neutral}14`, color: PRIORITY_COLORS[r.urgency] ?? DANGER_COLORS.neutral, fontWeight: 800 }}
                label={`${r.itemName}: ${r.currentStock} left → order ${r.suggestedOrderQty} · ${r.urgency}`}
              />
            ))}
          </Box>
        </Paper>
      )}

      {isMobile && <Typography variant="caption" sx={{ display: 'block', mb: 0.75, color: 'text.secondary' }}>Scroll horizontally to see all stock columns.</Typography>}
      <TableContainer component={Paper} elevation={0} sx={{ overflowX: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2.5, bgcolor: '#ffffff', boxShadow: '0 10px 34px rgba(0,0,0,0.35)' }}>
        <Table size={isMobile ? 'small' : 'medium'} sx={{ minWidth: isMobile ? 720 : 'auto', '& th, & td': { whiteSpace: 'nowrap' } }}>
          <TableHead>
            <TableRow sx={{ '& th': { bgcolor: '#fafafc', fontWeight: 800, color: '#0f0f13', borderBottom: '1px solid #eef0f4' } }}>
              <TableCell>Item</TableCell>
              <TableCell>Customer</TableCell>
              <TableCell>Stock</TableCell>
              <TableCell>Last restock</TableCell>
              {!isMobile && <TableCell>Needed next month</TableCell>}
              <TableCell sx={{ minWidth: 150 }}>Stock level</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={6} sx={{ textAlign: 'center', color: '#9ca3af', py: 4 }}>{rows.length === 0 ? 'No inventory recorded.' : 'No items match this search.'}</TableCell></TableRow>
            )}
            {filtered.map((r) => {
              const f = forecasts[r.name]
              const pct = r.reorderLevel > 0 ? Math.min(100, (r.currentStock / (r.reorderLevel * 2)) * 100) : 100
              const healthy = r.currentStock > r.reorderLevel
              const stockColor = healthy ? DANGER_COLORS.safe : DANGER_COLORS.critical
              return (
                <TableRow key={r.id} hover onClick={() => { setSel(r); loadMovements(r.id) }} sx={{ cursor: 'pointer', '&:hover': { bgcolor: '#fff3ea' } }}>
                  <TableCell>
                    <Typography sx={{ fontWeight: 700, color: '#0f0f13', fontSize: 14 }}>{r.name}</Typography>
                    <Typography variant="caption" sx={{ color: '#9ca3af' }}>{r.category}{r.unit ? ` · ${r.unit}` : ''}</Typography>
                  </TableCell>
                  <TableCell><Typography variant="caption" sx={{ color: '#374151', fontWeight: 600 }}>{r.customerName || '—'}</Typography></TableCell>
                  <TableCell>
                    <Typography sx={{ fontWeight: 800, color: healthy ? '#0f0f13' : stockColor }}>{r.currentStock}</Typography>
                    {!healthy && <Chip size="small" label="Low stock" sx={{ bgcolor: `${DANGER_COLORS.critical}14`, color: DANGER_COLORS.critical, fontWeight: 700, fontSize: 11, mt: 0.5 }} />}
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" sx={{ color: '#374151', fontWeight: 600 }}>{r.lastReceivedQty != null ? `${r.lastReceivedQty} ${r.unit ?? ''} · ${dd(r.lastReceivedDate)}` : '—'}</Typography>
                  </TableCell>
                  {!isMobile && <TableCell>
                    {f ? <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f0f13' }}>{Math.round(f.forecastNextMonth)}</Typography>
                      : <Typography variant="caption" sx={{ color: '#9ca3af' }}>—</Typography>}
                  </TableCell>}
                  <TableCell>
                    <LinearProgress variant="determinate" value={pct} sx={{ height: 7, borderRadius: 3, bgcolor: '#eef0f4', '& .MuiLinearProgress-bar': { bgcolor: healthy ? '#2e7d32' : '#d32f2f' } }} />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {Detail}

      <Dialog open={!!mvDialog} onClose={() => setMvDialog(null)} fullWidth maxWidth="sm" fullScreen={isMobile}>
        <DialogTitle sx={{ fontWeight: 800 }}>{mvDialog === 'receive' ? `Add Stock — ${sel?.name ?? ''}` : `Use Stock — ${sel?.name ?? ''}`}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gap: 2, mt: 1 }}>
            <TextField
              label={mvDialog === 'receive' ? 'Added By' : 'Issued By'}
              fullWidth
              size="small"
              value={displayName}
              disabled
              helperText="Captured automatically from your sign-in."
              sx={lightFieldSx}
            />
            <TextField label="Quantity *" type="number" fullWidth size="small" value={mvForm.qty} onChange={(e) => setMvForm({ ...mvForm, qty: e.target.value })} sx={lightFieldSx} />
            {mvDialog === 'issue' && (
              <>
                <FormControl size="small" sx={lightFieldSx}><InputLabel>Client</InputLabel>
                  <Select label="Client" value={mvForm.customerId} onChange={(e) => setMvForm({ ...mvForm, customerId: e.target.value as string })}>
                    <MenuItem value="">— None —</MenuItem>
                    {refs.customers.map((c) => <MenuItem key={c.id} value={String(c.id)}>{c.name}</MenuItem>)}
                  </Select>
                </FormControl>
                <FormControl size="small" sx={lightFieldSx}><InputLabel>Job Reference</InputLabel>
                  <Select label="Job Reference" value={mvForm.jobId} onChange={(e) => setMvForm({ ...mvForm, jobId: e.target.value as string })}>
                    <MenuItem value="">— None —</MenuItem>
                    {refs.jobs.map((j) => <MenuItem key={j.id} value={String(j.id)}>{j.jobNumber} · {j.title}</MenuItem>)}
                  </Select>
                </FormControl>
              </>
            )}
            {mvDialog === 'receive' && (
              <TextField label="Reference" fullWidth size="small" placeholder="e.g. delivery note number" value={mvForm.reference} onChange={(e) => setMvForm({ ...mvForm, reference: e.target.value })} sx={lightFieldSx} />
            )}
            <TextField label="Notes" fullWidth size="small" multiline minRows={2} value={mvForm.notes} onChange={(e) => setMvForm({ ...mvForm, notes: e.target.value })} sx={lightFieldSx} />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, flexWrap: 'wrap', gap: 1 }}>
          <Button onClick={() => setMvDialog(null)} sx={{ borderRadius: 2 }}>Cancel</Button>
          <Button variant="outlined" startIcon={<PrintIcon />} disabled={!Number(mvForm.qty)} onClick={printVoucher} sx={{ borderRadius: 2 }}>Print</Button>
          <Button variant="contained" disabled={mvSaving || !Number(mvForm.qty)} onClick={submitMv} sx={{ borderRadius: 2, bgcolor: mvDialog === 'receive' ? '#2e7d32' : '#FF3D00', '&:hover': { bgcolor: mvDialog === 'receive' ? '#1b5e20' : '#C42A00' } }}>
            {mvSaving ? 'Saving…' : mvDialog === 'receive' ? 'Add Stock' : 'Use Stock'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm" fullScreen={isMobile}>
        <DialogTitle sx={{ fontWeight: 800 }}>Add stock item</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gap: 2, mt: 1 }}>
            <TextField label="Name *" fullWidth value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} size="small" sx={lightFieldSx} />
            <FormControl size="small" sx={lightFieldSx}><InputLabel>Category</InputLabel>
              <Select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as string })}>
                {CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
              </Select>
            </FormControl>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr 1fr' }, gap: 2 }}>
              <TextField label="Stock" type="number" size="small" value={form.currentStock} onChange={(e) => setForm({ ...form, currentStock: e.target.value })} sx={lightFieldSx} />
              <TextField label="Restock at" type="number" size="small" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} sx={lightFieldSx} />
              <TextField label="Cost per unit (US$)" type="number" size="small" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: e.target.value })} sx={lightFieldSx} />
              <TextField label="Unit" size="small" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} sx={lightFieldSx} />
            </Box>
            <TextField label="Customer" size="small" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} sx={lightFieldSx} />
            <TextField label="Last restock qty" type="number" size="small" value={form.lastReceivedQty} onChange={(e) => setForm({ ...form, lastReceivedQty: e.target.value })} sx={lightFieldSx} />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpen(false)} sx={{ borderRadius: 2 }}>Cancel</Button>
          <Button variant="contained" disabled={saving || !form.name.trim()} onClick={create} sx={{ borderRadius: 2, bgcolor: '#FF3D00', '&:hover': { bgcolor: '#C42A00' } }}>
            {saving ? 'Saving…' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!delItem} onClose={() => !delBusy && setDelItem(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Delete stock item? (admin)</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Permanently delete <b>{delItem?.name}</b> and its stock history?
          </Typography>
          <TextField
            autoFocus
            size="small"
            fullWidth
            placeholder={`Type "${delItem?.name ?? ''}" to confirm`}
            value={delConfirm}
            onChange={(e) => setDelConfirm(e.target.value)}
            sx={{ mt: 1, '& input': { fontWeight: 700 } }}
          />
        </DialogContent>
        <DialogActions>
          <Button size="small" onClick={() => { setDelItem(null); setDelConfirm('') }}>Cancel</Button>
          <Button
            size="small"
            color="error"
            variant="contained"
            disabled={delConfirm.trim() !== (delItem?.name ?? '') || delBusy}
            onClick={doDeleteItem}
          >
            {delBusy ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {voucher && sel && (
        <StockVoucher
          kind={voucher.kind}
          itemName={sel.name}
          category={sel.category}
          unit={sel.unit}
          qty={voucher.qty}
          displayName={displayName}
          customerName={voucher.customerName}
          jobNumber={voucher.jobNumber}
          reference={voucher.reference}
          notes={voucher.notes}
          date={new Date()}
          voucherNo={voucherNo(voucher.kind)}
          stockBefore={sel.currentStock}
          stockAfter={voucher.kind === 'receive' ? sel.currentStock + voucher.qty : sel.currentStock - voucher.qty}
        />
      )}
    </Box>
  )
}

function Row({ label, value, money }: { label: string; value: ReactNode; money?: boolean }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.7, borderBottom: '1px dashed #eef0f4' }}>
      <Typography variant="caption" sx={{ color: '#6b7280', fontWeight: 700, pt: 0.2 }}>{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: money ? 800 : 600, color: money ? '#035a3f' : '#0f0f13', textAlign: 'right' }}>{value}</Typography>
    </Box>
  )
}
