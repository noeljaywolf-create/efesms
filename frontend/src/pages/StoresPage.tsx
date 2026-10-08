import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControl, Grid, InputLabel, MenuItem, Paper, Select, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import Inventory2Icon from '@mui/icons-material/Inventory2'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import SearchIcon from '@mui/icons-material/Search'
import DownloadIcon from '@mui/icons-material/Download'
import RefreshIcon from '@mui/icons-material/Refresh'
import { api } from '../api/client'

type StoreItem = { id: number; name: string; category: string; currentStock: number; unit: string; unitCost: number }
type Customer = { id: number; customerId?: string; name: string }
type Job = { id: number; jobNumber: string; title?: string; customerId?: number | null; customerName?: string | null }
type StoreMovement = {
  id: number; storeItemId: number; itemName: string; itemCategory: string; itemUnit?: string | null
  type: string; source: string; qty: number; customerId?: number | null; customerName?: string | null
  jobId?: number | null; jobNumber?: string | null; reference?: string | null; supplier?: string | null
  receiptNumber?: string | null; unitCost?: number | null; totalCost?: number | null; notes?: string | null
  movedBy?: string | null; movedAt: string; balanceAfter: number; hasDocument: boolean; documentName?: string | null
  documentSizeBytes?: number | null
}

const FIELD_SX = {
  '& .MuiInputLabel-root': { color: '#b8bfd0' },
  '& .MuiInputLabel-root.Mui-focused': { color: '#42d6cf' },
  '& .MuiOutlinedInput-root': {
    color: '#f4f6fb', bgcolor: '#1c1d28', borderRadius: 2,
    '& fieldset': { borderColor: '#3d4051' },
    '&:hover fieldset': { borderColor: '#74798f' },
    '&.Mui-focused fieldset': { borderColor: '#42d6cf' },
  },
  '& .MuiSelect-icon': { color: '#b8bfd0' },
}

const cardSx = {
  p: 2, borderRadius: 3, color: '#f4f6fb', bgcolor: 'rgba(21,22,31,.9)',
  border: '1px solid rgba(255,255,255,.09)', boxShadow: '0 12px 32px rgba(0,0,0,.2)',
}

const localToday = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export default function StoresPage() {
  const [items, setItems] = useState<StoreItem[]>([])
  const [rows, setRows] = useState<StoreMovement[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [type, setType] = useState<'Receipt' | 'Issue'>('Receipt')
  const [itemId, setItemId] = useState('')
  const [itemName, setItemName] = useState('')
  const [itemCategory, setItemCategory] = useState('')
  const [itemUnit, setItemUnit] = useState('unit')
  const [qty, setQty] = useState('1')
  const [unitCost, setUnitCost] = useState('')
  const [supplier, setSupplier] = useState('')
  const [receiptNumber, setReceiptNumber] = useState('')
  const [reference, setReference] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [jobId, setJobId] = useState('')
  const [movedAt, setMovedAt] = useState(localToday())
  const [notes, setNotes] = useState('')
  const [document, setDocument] = useState<File | null>(null)
  const [message, setMessage] = useState('')
  const canWrite = ['admin', 'administrator', 'management', 'stores man'].includes((localStorage.getItem('efesms_role') || '').toLowerCase()) ||
    ['stores', 'administration'].includes((localStorage.getItem('efesms_dept') || '').toLowerCase())

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [ledger, storeItems, customerList, jobList] = await Promise.all([
        api.get<StoreMovement[]>('/operations/store-ledger'),
        api.get<StoreItem[]>('/operations/store-items'),
        api.get<Customer[]>('/customers'),
        api.get<Job[]>('/operations/jobs'),
      ])
      setRows(ledger.data ?? [])
      setItems(storeItems.data ?? [])
      setCustomers(customerList.data ?? [])
      setJobs(jobList.data ?? [])
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Stores data could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter((r) => [r.itemName, r.itemCategory, r.type, r.source, r.supplier, r.receiptNumber, r.reference, r.customerName, r.jobNumber, r.movedBy, r.notes, r.documentName]
      .some((value) => String(value ?? '').toLowerCase().includes(needle)))
  }, [query, rows])

  const totals = useMemo(() => ({
    receipts: rows.filter((r) => r.type === 'in').length,
    issues: rows.filter((r) => r.type === 'out').length,
    docs: rows.filter((r) => r.hasDocument).length,
    units: items.reduce((sum, item) => sum + item.currentStock, 0),
  }), [items, rows])

  const resetForm = () => {
    setType('Receipt'); setItemId(''); setItemName(''); setItemCategory(''); setItemUnit('unit'); setQty('1'); setUnitCost(''); setSupplier('')
    setReceiptNumber(''); setReference(''); setCustomerId(''); setJobId(''); setMovedAt(localToday()); setNotes(''); setDocument(null)
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    const addingNewItem = type === 'Receipt' && itemId === 'new'
    if ((!addingNewItem && !itemId) || (addingNewItem && (!itemName.trim() || !itemCategory.trim() || !itemUnit.trim())) || Number(qty) <= 0 || !Number.isInteger(Number(qty))) {
      setMessage('Choose an existing Store item or enter a new item name, category, unit, and positive whole quantity.')
      return
    }
    setSaving(true)
    setMessage('')
    const form = new FormData()
    form.append('Type', type)
    if (addingNewItem) {
      form.append('ItemName', itemName.trim())
      form.append('ItemCategory', itemCategory.trim())
      form.append('ItemUnit', itemUnit.trim())
    } else {
      form.append('StoreItemId', itemId)
    }
    form.append('Qty', qty)
    form.append('UnitCost', type === 'Receipt' ? unitCost || '0' : '0')
    form.append('Supplier', supplier)
    form.append('ReceiptNumber', receiptNumber)
    form.append('Reference', reference)
    if (customerId) form.append('CustomerId', customerId)
    if (jobId) form.append('JobId', jobId)
    form.append('MovedAt', movedAt)
    form.append('Notes', notes)
    if (document) form.append('Document', document)
    try {
      await api.post('/operations/store-ledger', form)
      resetForm()
      setOpen(false)
      setMessage(`${type} saved. Store stock and the Store movement register have been updated; extinguisher Inventory is unchanged.`)
      await load()
    } catch (e: any) {
      setMessage(e?.response?.data?.message || e?.message || 'The store movement could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const downloadDocument = async (row: StoreMovement) => {
    try {
      const { data } = await api.get(`/operations/store-ledger/${row.id}/document`, { responseType: 'blob' })
      const url = URL.createObjectURL(data)
      const link = window.document.createElement('a')
      link.href = url
      link.download = row.documentName || `receipt-${row.id}`
      link.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setMessage(e?.response?.data?.message || 'The receipt could not be downloaded.')
    }
  }

  const selectedItem = items.find((item) => item.id === Number(itemId))

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2.5 }, minHeight: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: 2.5 }}>
        <Box sx={{ width: 48, height: 48, borderRadius: 2.5, display: 'grid', placeItems: 'center', color: '#42d6cf', bgcolor: '#42d6cf1c', border: '1px solid #42d6cf55' }}>
          <Inventory2Icon />
        </Box>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography variant="h4" sx={{ fontWeight: 900, color: '#f4f6fb', letterSpacing: '-.025em' }}>Stores</Typography>
          <Typography variant="body2" sx={{ color: '#a5aabd' }}>Receipts, issues, supporting documents, and a traceable link to inventory activity.</Typography>
        </Box>
        <Button startIcon={<RefreshIcon />} variant="outlined" onClick={() => void load()} sx={{ borderColor: '#596075', color: '#e3e8f4', minHeight: 42 }}>Refresh</Button>
        {canWrite && <Button startIcon={<AddIcon />} variant="contained" onClick={() => { setMessage(''); setOpen(true) }} sx={{ bgcolor: '#15a89c', color: '#071b1a', fontWeight: 800, minHeight: 42, '&:hover': { bgcolor: '#42d6cf' } }}>New store record</Button>}
      </Box>

      {message && <Alert severity={message.includes('could not') || message.includes('Choose') ? 'error' : 'success'} onClose={() => setMessage('')} sx={{ mb: 2 }}>{message}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
        {[
          { label: 'Store stock on hand', value: totals.units, detail: 'installation equipment and materials', color: '#42d6cf', icon: <Inventory2Icon /> },
          { label: 'Receipts', value: totals.receipts, detail: 'incoming stock records', color: '#6fe39a', icon: <LocalShippingIcon /> },
          { label: 'Issues', value: totals.issues, detail: 'stock issued or used', color: '#ff987a', icon: <ReceiptLongIcon /> },
          { label: 'Documents', value: totals.docs, detail: 'receipts attached', color: '#b49aff', icon: <DownloadIcon /> },
        ].map((metric) => (
          <Grid key={metric.label} size={{ xs: 6, md: 3 }}>
            <Paper elevation={0} sx={{ ...cardSx, minHeight: 106, display: 'flex', alignItems: 'center', gap: 1.5, background: `linear-gradient(135deg, ${metric.color}12, rgba(21,22,31,.94) 60%)` }}>
              <Box sx={{ width: 42, height: 42, borderRadius: 2, display: 'grid', placeItems: 'center', color: metric.color, bgcolor: `${metric.color}20` }}>{metric.icon}</Box>
              <Box><Typography variant="h5" sx={{ fontWeight: 900, color: '#f4f6fb', lineHeight: 1.1 }}>{metric.value}</Typography><Typography variant="body2" sx={{ fontWeight: 700, color: '#e0e4ee', mt: .5 }}>{metric.label}</Typography><Typography variant="caption" sx={{ color: '#9ba2b5' }}>{metric.detail}</Typography></Box>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Paper elevation={0} sx={{ ...cardSx, p: { xs: 1, sm: 1.5 } }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 1.5, alignItems: { sm: 'center' } }}>
          <Box sx={{ flex: 1 }}><Typography variant="h6" sx={{ color: '#f4f6fb', fontWeight: 800 }}>Store movement register</Typography><Typography variant="caption" sx={{ color: '#9ba2b5' }}>Installation-system equipment and material receipts/issues, with optional job and customer links.</Typography></Box>
          <TextField size="small" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search item, supplier, receipt, job…" slotProps={{ input: { startAdornment: <SearchIcon sx={{ color: '#9ba2b5', mr: 1 }} /> } }} sx={{ ...FIELD_SX, width: { xs: '100%', sm: 330 } }} />
        </Stack>
        {loading ? <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}><CircularProgress sx={{ color: '#42d6cf' }} /></Box> : (
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 920 }}>
              <TableHead><TableRow sx={{ '& th': { color: '#b8bfd0', fontWeight: 800, borderBottom: '1px solid #383b4a', whiteSpace: 'nowrap' } }}>
                <TableCell>Date</TableCell><TableCell>Movement</TableCell><TableCell>Item</TableCell><TableCell>Supplier / link</TableCell><TableCell>Receipt / reference</TableCell><TableCell align="right">Qty</TableCell><TableCell align="right">Balance</TableCell><TableCell align="right">Cost</TableCell><TableCell>Recorded by</TableCell><TableCell>Document</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id} hover sx={{ '& td': { borderColor: '#303342', color: '#e5e8f0' }, '&:hover': { bgcolor: '#222532' } }}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{new Date(row.movedAt).toLocaleDateString()}</TableCell>
                    <TableCell><Chip size="small" label={row.type === 'in' ? 'Receipt' : row.source === 'job' ? 'Job issue' : 'Issue'} sx={{ bgcolor: row.type === 'in' ? '#6fe39a20' : '#ff987a20', color: row.type === 'in' ? '#6fe39a' : '#ff987a', fontWeight: 800 }} /></TableCell>
                    <TableCell><Typography variant="body2" sx={{ fontWeight: 750 }}>{row.itemName}</Typography><Typography variant="caption" sx={{ color: '#9ba2b5' }}>{row.itemCategory}</Typography></TableCell>
                    <TableCell>{row.supplier || row.jobNumber || row.customerName || '—'}</TableCell>
                    <TableCell>{row.receiptNumber || row.reference || '—'}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800, color: row.type === 'in' ? '#6fe39a !important' : '#ff987a !important' }}>{row.type === 'in' ? '+' : '−'}{row.qty} {row.itemUnit || ''}</TableCell>
                    <TableCell align="right">{row.balanceAfter} {row.itemUnit || ''}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{row.totalCost != null ? `US$${Number(row.totalCost).toFixed(2)}` : '—'}</TableCell>
                    <TableCell>{row.movedBy || '—'}</TableCell>
                    <TableCell>{row.hasDocument ? <Button size="small" startIcon={<DownloadIcon />} onClick={() => void downloadDocument(row)} sx={{ color: '#42d6cf', textTransform: 'none', whiteSpace: 'nowrap' }}>{row.documentName || 'Receipt'}</Button> : <Typography variant="caption" sx={{ color: '#747b8f' }}>—</Typography>}</TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && <TableRow><TableCell colSpan={10} align="center" sx={{ py: 5, color: '#9ba2b5' }}>{rows.length ? 'No store records match your search.' : 'No store movements yet. Record a receipt or issue to begin the audit trail.'}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Dialog open={open} onClose={() => { if (!saving) setOpen(false) }} fullWidth maxWidth="md" slotProps={{ paper: { sx: { bgcolor: '#15161f', color: '#f4f6fb', border: '1px solid #343746', borderRadius: 3 } } }}>
        <Box component="form" onSubmit={save}>
          <DialogTitle sx={{ fontWeight: 850, borderBottom: '1px solid #343746' }}>New store record</DialogTitle>
          <DialogContent sx={{ pt: '20px !important' }}>
            <Typography variant="body2" sx={{ color: '#a5aabd', mb: 2 }}>Stores is a separate register for fire-protection installation equipment and materials. Add items as you receive them; these records do not change extinguisher Inventory.</Typography>
            <Grid container spacing={1.5}>
              <Grid size={{ xs: 12, sm: 4 }}><FormControl fullWidth size="small" sx={FIELD_SX}><InputLabel>Movement</InputLabel><Select label="Movement" value={type} onChange={(e) => { const nextType = e.target.value as 'Receipt' | 'Issue'; setType(nextType); if (nextType === 'Issue' && itemId === 'new') setItemId('') }}><MenuItem value="Receipt">Receipt · stock in</MenuItem><MenuItem value="Issue">Issue · stock out</MenuItem></Select></FormControl></Grid>
              <Grid size={{ xs: 12, sm: 8 }}><FormControl fullWidth size="small" sx={FIELD_SX}><InputLabel>Store item</InputLabel><Select label="Store item" value={itemId} onChange={(e) => { setItemId(e.target.value); const selected = items.find((item) => item.id === Number(e.target.value)); if (selected) setUnitCost(String(selected.unitCost ?? 0)) }} required><MenuItem value="" disabled>Select Store item</MenuItem>{type === 'Receipt' && <MenuItem value="new">+ Add new installation-system item</MenuItem>}{items.map((item) => <MenuItem key={item.id} value={String(item.id)}>{item.name} · {item.currentStock} {item.unit} in Stores</MenuItem>)}</Select></FormControl></Grid>
              {itemId === 'new' && <>
                <Grid size={{ xs: 12, sm: 4 }}><TextField size="small" fullWidth label="Equipment or material name" value={itemName} onChange={(e) => setItemName(e.target.value)} required sx={FIELD_SX} /></Grid>
                <Grid size={{ xs: 12, sm: 4 }}><TextField size="small" fullWidth label="Category" placeholder="e.g. fire alarm, sprinkler, pipework" value={itemCategory} onChange={(e) => setItemCategory(e.target.value)} required sx={FIELD_SX} /></Grid>
                <Grid size={{ xs: 12, sm: 4 }}><TextField size="small" fullWidth label="Unit" placeholder="piece, metre, roll, set" value={itemUnit} onChange={(e) => setItemUnit(e.target.value)} required sx={FIELD_SX} /></Grid>
              </>}
              <Grid size={{ xs: 12, sm: 4 }}><TextField size="small" fullWidth label={`Quantity${selectedItem?.unit ? ` (${selectedItem.unit})` : ''}`} type="number" slotProps={{ htmlInput: { min: 1, step: 1 } }} value={qty} onChange={(e) => setQty(e.target.value)} required sx={FIELD_SX} /></Grid>
              <Grid size={{ xs: 12, sm: 4 }}><TextField size="small" fullWidth label="Transaction date" type="date" value={movedAt} onChange={(e) => setMovedAt(e.target.value)} required slotProps={{ inputLabel: { shrink: true } }} sx={FIELD_SX} /></Grid>
              {type === 'Receipt' && <>
                <Grid size={{ xs: 12, sm: 4 }}><TextField size="small" fullWidth label="Unit cost (US$)" type="number" slotProps={{ htmlInput: { min: 0, step: '0.01' } }} value={unitCost} onChange={(e) => setUnitCost(e.target.value)} sx={FIELD_SX} /></Grid>
                <Grid size={{ xs: 12, sm: 6 }}><TextField size="small" fullWidth label="Supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} sx={FIELD_SX} /></Grid>
                <Grid size={{ xs: 12, sm: 6 }}><TextField size="small" fullWidth label="Receipt / invoice number" value={receiptNumber} onChange={(e) => setReceiptNumber(e.target.value)} sx={FIELD_SX} /></Grid>
              </>}
              <Grid size={{ xs: 12, sm: 6 }}><FormControl fullWidth size="small" sx={FIELD_SX}><InputLabel>Link customer (optional)</InputLabel><Select label="Link customer (optional)" value={customerId} onChange={(e) => { setCustomerId(e.target.value); setJobId('') }}><MenuItem value="">No customer link</MenuItem>{customers.map((customer) => <MenuItem key={customer.id} value={String(customer.id)}>{customer.customerId ? `${customer.customerId} · ` : ''}{customer.name}</MenuItem>)}</Select></FormControl></Grid>
              <Grid size={{ xs: 12, sm: 6 }}><FormControl fullWidth size="small" sx={FIELD_SX}><InputLabel>Link job (optional)</InputLabel><Select label="Link job (optional)" value={jobId} onChange={(e) => { const selected = jobs.find((job) => job.id === Number(e.target.value)); setJobId(e.target.value); if (selected?.customerId) setCustomerId(String(selected.customerId)) }}><MenuItem value="">No job link</MenuItem>{jobs.filter((job) => !customerId || job.customerId === Number(customerId)).map((job) => <MenuItem key={job.id} value={String(job.id)}>{job.jobNumber} · {job.title || job.customerName || 'Job card'}</MenuItem>)}</Select></FormControl></Grid>
              <Grid size={{ xs: 12 }}><TextField size="small" fullWidth label="Reference (job, delivery, or source)" value={reference} onChange={(e) => setReference(e.target.value)} sx={FIELD_SX} /></Grid>
              <Grid size={{ xs: 12 }}><TextField size="small" fullWidth multiline minRows={2} label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} sx={FIELD_SX} /></Grid>
              <Grid size={{ xs: 12 }}>
                <Button component="label" variant="outlined" startIcon={<ReceiptLongIcon />} sx={{ borderColor: '#4f6370', color: '#42d6cf', minHeight: 44, textTransform: 'none' }}>
                  {document ? document.name : 'Attach receipt or supporting document'}
                  <input hidden type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setDocument(e.target.files?.[0] || null)} />
                </Button>
                <Typography variant="caption" sx={{ ml: 1, color: '#9ba2b5' }}>PDF, JPG, PNG, or WebP · max 8 MB</Typography>
              </Grid>
              {type === 'Receipt' && itemId === 'new' && <Grid size={{ xs: 12 }}><Alert severity="info" sx={{ bgcolor: '#102c35', color: '#c6f4f2', '& .MuiAlert-icon': { color: '#42d6cf' } }}>This creates a Store-only item and adds {qty || 0} {itemUnit || 'unit(s)'} to Stores. Extinguisher Inventory will not change.</Alert></Grid>}
              {type === 'Receipt' && selectedItem && <Grid size={{ xs: 12 }}><Alert severity="info" sx={{ bgcolor: '#102c35', color: '#c6f4f2', '& .MuiAlert-icon': { color: '#42d6cf' } }}>This receipt adds {qty || 0} {selectedItem.unit} to Store stock only. Estimated total: US${(Number(qty || 0) * Number(unitCost || 0)).toFixed(2)}.</Alert></Grid>}
            </Grid>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #343746' }}>
            <Button onClick={() => setOpen(false)} disabled={saving} sx={{ color: '#ccd1df' }}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={saving || (type === 'Issue' && items.length === 0)} sx={{ bgcolor: '#15a89c', color: '#071b1a', fontWeight: 850, '&:hover': { bgcolor: '#42d6cf' } }}>{saving ? 'Saving…' : `Save ${type.toLowerCase()}`}</Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  )
}
