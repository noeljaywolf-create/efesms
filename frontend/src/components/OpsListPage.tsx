import { useEffect, useState } from 'react'
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, InputLabel, MenuItem, Paper, Select, Switch, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Typography, useMediaQuery,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import RefreshIcon from '@mui/icons-material/Refresh'
import PrintIcon from '@mui/icons-material/Print'
import SearchIcon from '@mui/icons-material/Search'
import { api } from '../api/client'
import { lightFieldSx } from '../lib/fieldSx'
import { useTablePrint } from './print'
import type { PrintDoc, PrintCol } from './print'

export type Col = {
  key: string
  label: string
  format?: 'text' | 'date' | 'number' | 'money' | 'chip' | 'bool'
  colors?: Record<string, string>
  hideOnMobile?: boolean
}

export type Field = {
  key: string
  label: string
  type: 'text' | 'number' | 'date' | 'select' | 'bool'
  options?: string[]
  required?: boolean
  placeholder?: string
}

export type OpsListConfig = {
  title: string
  subtitle: string
  endpoint: string
  idKey?: string
  idPrefix?: (id: number) => string
  columns: Col[]
  fields: Field[]
  empty: string
  groupLabel?: string
  printGroupBy?: string
  searchPlaceholder?: string
}

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const money = (n?: number | null) => (n != null ? `US$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—')

const labelize = (k: string) => k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())

const apiErrorMessage = (error: any, fallback: string) => {
  const data = error?.response?.data
  if (typeof data?.message === 'string') return data.message
  if (typeof data?.detail === 'string') return data.detail
  if (typeof data?.title === 'string') return data.title
  if (typeof data?.error === 'string') return data.error
  if (typeof error?.message === 'string') return error.message
  return fallback
}

function Cell({ row, col }: { row: any; col: Col }) {
  const v = row?.[col.key]
  if (col.format === 'date') return <Typography variant="body2" sx={{ color: '#374151', fontSize: 13 }}>{fmtDate(v)}</Typography>
  if (col.format === 'money') return <Typography variant="body2" sx={{ color: '#035a3f', fontWeight: 800, fontSize: 13 }}>{money(v)}</Typography>
  if (col.format === 'bool') {
    const on = !!v
    return <Chip size="small" label={on ? 'Yes' : 'No'} sx={{ bgcolor: on ? '#2e7d3218' : '#6b728014', color: on ? '#2e7d32' : '#6b7280', fontWeight: 700 }} />
  }
  if (col.format === 'chip') {
    const s = String(v ?? '')
    const c = col.colors?.[s] ?? '#374151'
    return <Chip size="small" label={s || '—'} sx={{ bgcolor: `${c}20`, color: c, fontWeight: 800 }} />
  }
  return <Typography variant="body2" sx={{ color: '#0f0f13', fontWeight: 600, fontSize: 13 }}>{v ?? '—'}</Typography>
}

function DetailValue({ k, v }: { k: string; v: any }) {
  let disp: React.ReactNode = v
  let color: string | null = null
  if (Array.isArray(v)) disp = v.length ? v.join(', ') : '—'
  else if (typeof v === 'boolean') { disp = v ? 'Yes' : 'No'; color = v ? '#2e7d32' : '#6b7280' }
  else if (typeof v === 'number') {
    if (/cost|amount|rate/i.test(k)) { disp = money(v); color = '#035a3f' }
    else disp = v.toLocaleString()
  }
  else if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(v) && !/price|number|code/.test(k)) disp = fmtDate(v)
    else disp = v
  }
  if (disp === null || disp === undefined || disp === '') disp = '—'
  const node = <Typography variant="body2" sx={{ color: color ?? '#0f0f13', fontWeight: color ? 800 : 600 }}>{disp}</Typography>
  if (color && color !== '#6b7280') return <Box>{node}</Box>
  return node
}

export default function OpsListPage({ config }: { config: OpsListConfig }) {
  // Keep table columns readable on compact laptop and tablet widths too.
  const isMobile = useMediaQuery('(max-width: 700px)')
  const [rows, setRows] = useState<any[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState<any | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [form, setForm] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<any | null>(null)
  const [editForm, setEditForm] = useState<Record<string, string>>({})
  const [equipOpts, setEquipOpts] = useState<any[]>([])
  const [jobOpts, setJobOpts] = useState<any[]>([])
  const printable = useTablePrint()

  useEffect(() => {
    api.get('/operations/equipment').then(r => setEquipOpts(r.data || [])).catch(() => {})
    api.get('/operations/jobs').then(r => setJobOpts(r.data || [])).catch(() => {})
  }, [])

  const role = localStorage.getItem('efesms_role') ?? ''
  const dept = localStorage.getItem('efesms_dept') ?? ''
  const canWrite = ['admin', 'administrator', 'management', 'technician', 'contracts manager', 'stores man'].includes((role || '').toLowerCase()) ||
    ['technical', 'operations', 'administration', 'contracts', 'stores'].includes((dept || '').toLowerCase())
  const isAdmin = ['admin', 'administrator'].includes((role || '').toLowerCase())

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.get<any[]>(config.endpoint)
      setRows(r.data)
    } catch (x) { setErr(`Failed to load ${config.title.toLowerCase()}`) }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const toPayload = (src: Record<string, string>): Record<string, unknown> => {
    const p: Record<string, unknown> = {}
    for (const f of config.fields) {
      const raw = src[f.key] ?? ''
      if (f.type === 'number') p[f.key] = raw === '' ? null : Number(raw)
      else if (f.type === 'date') p[f.key] = raw === '' ? null : new Date(raw).toISOString()
      else if (f.type === 'bool') p[f.key] = raw === '1'
      else p[f.key] = raw === '' ? null : raw
    }
    return p
  }

  const create = async () => {
    setSaving(true)
    setErr('')
    try {
      await api.post(config.endpoint, toPayload(form))
      setOpen(false)
      setForm({})
      await load()
    } catch (x: any) { setErr(apiErrorMessage(x, `Could not create record`)) }
    setSaving(false)
  }

  const toInput = (f: Field, v: any): string => {
    if (v == null) return ''
    if (f.type === 'bool') return v ? '1' : '0'
    if (f.type === 'date') return String(v).slice(0, 10)
    return String(v)
  }

  const startEdit = (row: any) => {
    const init: Record<string, string> = {}
    for (const f of config.fields) init[f.key] = toInput(f, row?.[f.key])
    setEditForm(init)
    setEditing(row)
  }

  const saveEdit = async () => {
    if (!editing) return
    setSaving(true)
    setErr('')
    try {
      await api.put(`${config.endpoint}/${editing.id}`, toPayload(editForm))
      setEditing(null)
      setSel(null)
      await load()
    } catch (x: any) {
      setErr(apiErrorMessage(x, `Could not save changes`))
    }
    setSaving(false)
  }

  const [delBusy, setDelBusy] = useState(false)
  const doDelete = async () => {
    if (!sel) return
    if (!window.confirm(`Delete ${config.title.slice(0,-1)} ${numOf(sel)}? This cannot be undone.`)) return
    setDelBusy(true); setErr('')
    try {
      await api.delete(`${config.endpoint}/${sel.id}`)
      setSel(null)
      await load()
    } catch (x: any) { setErr(apiErrorMessage(x, 'Delete failed — admin only.')) }
    setDelBusy(false)
  }

  const numOf = (r: any) => (config.idPrefix ? config.idPrefix(r?.id) : String(r?.id ?? ''))
  const subtitle = loading ? 'Loading…' : `${rows.length} records`
  // Search across values returned by the database so customer, job, equipment
  // and agent details can all be found from the refill register.
  const visibleRows = config.searchPlaceholder && query.trim()
    ? rows.filter((row) => Object.values(row ?? {}).some((value) => String(value ?? '').toLowerCase().includes(query.trim().toLowerCase())))
    : rows
  const detailKeys = sel ? Object.keys(sel).filter((k) => k !== 'id' && k !== 'createdAt' && !config.columns.some((c) => c.key === k)) : []

  const visibleColumns = isMobile ? config.columns.filter((c) => !c.hideOnMobile) : config.columns

  const printDoc = () => {
    const cell = (r: any, c: Col) => {
      const v = r?.[c.key]
      if (c.format === 'date') return fmtDate(v)
      if (c.format === 'money') return money(v)
      if (c.format === 'bool') return v ? 'Yes' : 'No'
      if (c.format === 'chip' || c.format === 'text') return v ?? '—'
      return v == null ? '—' : String(v)
    }
    const idx = config.printGroupBy ? config.columns.findIndex((c) => c.key === config.printGroupBy) : -1
    const cols: PrintCol[] = config.columns.map((c) => ({ label: c.label, align: c.format === 'number' || c.format === 'money' ? 'r' : 'l' }))
    const doc: PrintDoc = {
      title: config.title,
      subtitle: `${rows.length} records · ${config.subtitle}`,
      cols,
      rows: rows.map((r) => config.columns.map((c) => cell(r, c))),
      groupBy: idx >= 0 ? idx : undefined,
      note: `Issued from the ${config.title} register.`,
    }
    printable.print(doc)
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h4" sx={{ fontWeight: 900, color: '#f2f2f7', letterSpacing: '-0.02em' }}>{config.title}</Typography>
          <Typography variant="body2" sx={{ color: '#9aa0b0' }}>{subtitle} · {config.subtitle} · click a row for full details</Typography>
        </Box>
        <Button variant="outlined" startIcon={<PrintIcon />} disabled={rows.length === 0} onClick={printDoc} sx={{ borderRadius: 2 }}>Print</Button>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={load} sx={{ borderRadius: 2 }}>Refresh</Button>
        {canWrite && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)} sx={{ borderRadius: 2, bgcolor: '#FF3D00', '&:hover': { bgcolor: '#C42A00' } }}>
            {config.groupLabel ?? 'Record'}
          </Button>
        )}
      </Box>

      {err && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr('')}>{err}</Alert>}

      {config.searchPlaceholder && (
        <TextField
          fullWidth
          size="small"
          placeholder={config.searchPlaceholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          sx={{ ...lightFieldSx, mb: 1.5, maxWidth: 560 }}
          slotProps={{ input: { startAdornment: <SearchIcon sx={{ color: '#9aa0b0', mr: 1 }} /> } }}
        />
      )}

      {isMobile && <Typography variant="caption" sx={{ display: 'block', mb: 0.75, color: 'text.secondary' }}>Scroll horizontally to see all columns.</Typography>}
      <TableContainer component={Paper} elevation={0} sx={{ overflowX: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2.5, bgcolor: '#ffffff', boxShadow: '0 10px 34px rgba(0,0,0,0.35)' }}>
        <Table size={isMobile ? 'small' : 'medium'} sx={{ minWidth: isMobile ? 680 : 'auto', '& th, & td': { whiteSpace: 'nowrap' } }}>
          <TableHead>
            <TableRow sx={{ '& th': { bgcolor: '#fafafc', fontWeight: 800, color: '#0f0f13', borderBottom: '1px solid #eef0f4' } }}>
              {visibleColumns.map((c) => <TableCell key={c.key}>{c.label}</TableCell>)}
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleRows.length === 0 && (
              <TableRow><TableCell colSpan={visibleColumns.length} sx={{ textAlign: 'center', color: '#9ca3af', py: 4 }}>{rows.length && query.trim() ? 'No records match your search.' : config.empty}</TableCell></TableRow>
            )}
            {visibleRows.map((r) => (
              <TableRow
                key={r.id}
                hover
                onClick={() => setSel(r)}
                sx={{ cursor: 'pointer', '&:hover': { bgcolor: '#fff3ea' } }}
              >
                {visibleColumns.map((c) => (
                  <TableCell key={c.key}>
                    {c.key === config.idKey ? (
                      <Typography sx={{ fontWeight: 800, color: '#FF3D00', fontSize: 13, fontFamily: 'monospace' }}>{numOf(r)}</Typography>
                    ) : (
                      <Cell row={r} col={c} />
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm" fullScreen={isMobile}>
        <DialogTitle sx={{ fontWeight: 800 }}>New {config.title.slice(0, -1).toLowerCase()}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mt: 1 }}>
            {config.fields.map((f) => {
              if (f.key === 'equipmentId') {
                return (
                  <FormControl key={f.key} size="small" sx={lightFieldSx}><InputLabel>Equipment (pick)</InputLabel>
                    <Select label="Equipment (pick)" value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} sx={lightFieldSx}>
                      <MenuItem value=""><em>-- No specific unit --</em></MenuItem>
                      {equipOpts.map((eq: any) => <MenuItem key={eq.id} value={String(eq.id)}>{eq.equipmentNumber} - {eq.name}{eq.agentType ? ` (${eq.agentType})` : ''}</MenuItem>)}
                    </Select>
                  </FormControl>
                )
              }
              if (f.key === 'jobId') {
                return (
                  <FormControl key={f.key} size="small" sx={lightFieldSx}><InputLabel>Job (pick)</InputLabel>
                    <Select label="Job (pick)" value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} sx={lightFieldSx}>
                      <MenuItem value=""><em>-- No job --</em></MenuItem>
                      {jobOpts.map((j: any) => <MenuItem key={j.id} value={String(j.id)}>{j.jobNumber} - {j.title}{j.equipmentName ? ` (${j.equipmentName})` : ''}</MenuItem>)}
                    </Select>
                  </FormControl>
                )
              }
              if (f.type === 'select') {
                return (
                  <FormControl key={f.key} size="small" sx={lightFieldSx}><InputLabel>{f.label}{f.required ? ' *' : ''}</InputLabel>
                    <Select label={f.label} value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} sx={lightFieldSx}>
                      {f.options!.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
                    </Select>
                  </FormControl>
                )
              }
              if (f.type === 'bool') {
                return (
                  <Box key={f.key} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Switch checked={form[f.key] === '1'} onChange={(e) => setForm({ ...form, [f.key]: e.target.checked ? '1' : '0' })} />
                    <Typography variant="body2" sx={{ color: '#374151', fontWeight: 600 }}>{f.label}</Typography>
                  </Box>
                )
              }
              return (
                <TextField
                  key={f.key}
                  label={`${f.label}${f.required ? ' *' : ''}`}
                  type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : undefined}
                  size="small"
                  value={form[f.key] ?? ''}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  slotProps={f.type === 'date' ? { inputLabel: { shrink: true } } : undefined}
                  sx={lightFieldSx}
                />
              )
            })}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpen(false)} sx={{ borderRadius: 2 }}>Cancel</Button>
          <Button
            variant="contained"
            disabled={saving || config.fields.some((f) => f.required && !(form[f.key] ?? '').trim())}
            onClick={create}
            sx={{ borderRadius: 2, bgcolor: '#FF3D00', '&:hover': { bgcolor: '#C42A00' } }}
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!sel} onClose={() => setSel(null)} fullWidth maxWidth="sm" fullScreen={isMobile}>
        <DialogContent sx={{ p: 0, bgcolor: '#ffffff' }}>
          <Box sx={{ p: 2.5, borderBottom: '1px solid #eef0f4', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, bgcolor: '#fafafc' }}>
            <Typography sx={{ fontWeight: 800, color: '#FF3D00', fontFamily: 'monospace', fontSize: 15 }}>{numOf(sel ?? {})}</Typography>
            <Typography sx={{ fontWeight: 800, color: '#0f0f13', flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{config.title.slice(0, -1)} details</Typography>
            {canWrite && <Button size="small" variant="outlined" onClick={() => sel && startEdit(sel)} sx={{ borderRadius: 2 }}>Edit</Button>}
            {isAdmin && <Button size="small" variant="outlined" color="error" disabled={delBusy} onClick={doDelete} sx={{ borderRadius: 2 }}>{delBusy ? 'Deleting…' : 'Delete'}</Button>}
            <Button size="small" variant="outlined" onClick={() => setSel(null)} sx={{ borderRadius: 2 }}>Close</Button>
          </Box>
          <Box sx={{ p: 2.5 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: '10px 18px' }}>
              {sel && config.columns.map((c) => (
                <Box key={c.key} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, borderBottom: '1px dashed #eef0f4', pb: 0.6 }}>
                  <Typography variant="caption" sx={{ color: '#6b7280', fontWeight: 700, pt: 0.2 }}>{c.label}</Typography>
                  <Box sx={{ textAlign: 'right' }}>{c.key === config.idKey ? <Typography sx={{ fontWeight: 800, color: '#FF3D00', fontSize: 13, fontFamily: 'monospace' }}>{numOf(sel)}</Typography> : <Cell row={sel} col={c} />}</Box>
                </Box>
              ))}
              {detailKeys.map((k) => (
                <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, borderBottom: '1px dashed #eef0f4', pb: 0.6 }}>
                  <Typography variant="caption" sx={{ color: '#6b7280', fontWeight: 700, pt: 0.2 }}>{labelize(k)}</Typography>
                  <Box sx={{ textAlign: 'right' }}><DetailValue k={k} v={sel?.[k]} /></Box>
                </Box>
              ))}
            </Box>
          </Box>
        </DialogContent>
      </Dialog>
      <Dialog open={!!editing} onClose={() => setEditing(null)} fullWidth maxWidth="sm" fullScreen={isMobile}>
        <DialogTitle sx={{ fontWeight: 800 }}>Edit {config.title.slice(0, -1).toLowerCase()}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mt: 1 }}>
            {config.fields.map((f) => {
              if (f.key === 'equipmentId') {
                return (
                  <FormControl key={f.key} size="small" sx={lightFieldSx}><InputLabel>Equipment (pick)</InputLabel>
                    <Select label="Equipment (pick)" value={editForm[f.key] ?? ''} onChange={(e) => setEditForm({ ...editForm, [f.key]: e.target.value })} sx={lightFieldSx}>
                      <MenuItem value=""><em>-- No specific unit --</em></MenuItem>
                      {equipOpts.map((eq: any) => <MenuItem key={eq.id} value={String(eq.id)}>{eq.equipmentNumber} - {eq.name}{eq.agentType ? ` (${eq.agentType})` : ''}</MenuItem>)}
                    </Select>
                  </FormControl>
                )
              }
              if (f.key === 'jobId') {
                return (
                  <FormControl key={f.key} size="small" sx={lightFieldSx}><InputLabel>Job (pick)</InputLabel>
                    <Select label="Job (pick)" value={editForm[f.key] ?? ''} onChange={(e) => setEditForm({ ...editForm, [f.key]: e.target.value })} sx={lightFieldSx}>
                      <MenuItem value=""><em>-- No job --</em></MenuItem>
                      {jobOpts.map((j: any) => <MenuItem key={j.id} value={String(j.id)}>{j.jobNumber} - {j.title}</MenuItem>)}
                    </Select>
                  </FormControl>
                )
              }
              if (f.type === 'select') {
                return (
                  <FormControl key={f.key} size="small" sx={lightFieldSx}><InputLabel>{f.label}</InputLabel>
                    <Select label={f.label} value={editForm[f.key] ?? ''} onChange={(e) => setEditForm({ ...editForm, [f.key]: e.target.value })} sx={lightFieldSx}>
                      {f.options!.map((o) => <MenuItem key={o} value={o}>{o}</MenuItem>)}
                    </Select>
                  </FormControl>
                )
              }
              if (f.type === 'bool') {
                return (
                  <Box key={f.key} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Switch checked={editForm[f.key] === '1'} onChange={(e) => setEditForm({ ...editForm, [f.key]: e.target.value ? '1' : '0' })} />
                    <Typography variant="body2" sx={{ color: '#374151', fontWeight: 600 }}>{f.label}</Typography>
                  </Box>
                )
              }
              return (
                <TextField
                  key={f.key}
                  label={f.label}
                  type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : undefined}
                  size="small"
                  value={editForm[f.key] ?? ''}
                  onChange={(e) => setEditForm({ ...editForm, [f.key]: e.target.value })}
                  slotProps={f.type === 'date' ? { inputLabel: { shrink: true } } : undefined}
                  sx={lightFieldSx}
                />
              )
            })}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditing(null)} sx={{ borderRadius: 2 }}>Cancel</Button>
          <Button variant="contained" disabled={saving} onClick={saveEdit} sx={{ borderRadius: 2, bgcolor: '#FF3D00', '&:hover': { bgcolor: '#C42A00' } }}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogActions>
      </Dialog>
      {printable.node}
    </Box>
  )
}
