import { useEffect, useState } from 'react'
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, IconButton, InputLabel, LinearProgress, MenuItem, Paper, Select, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Typography, useMediaQuery,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import RefreshIcon from '@mui/icons-material/Refresh'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import PrintIcon from '@mui/icons-material/Print'
import DownloadIcon from '@mui/icons-material/Download'
import Autocomplete from '@mui/material/Autocomplete'
import { api } from '../api/client'
import type { OperationEquipment, PredictiveAssessment, Anomaly, EngineOutput } from '../types/fireops'
import { SEVERITY_COLORS } from '../types/fireops'
import { PRINT_LETTERHEAD_HTML, PrintLetterhead, useTablePrint } from '../components/print'
import { EXTINGUISHER_TYPES } from '../lib/extinguishers'
import { lightFieldSx } from '../lib/fieldSx'

const CATEGORIES = ['Extinguisher', 'Sprinkler', 'Detection', 'Gas', 'Hose Reel', 'Hydrant', 'Other']

const dd = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

const EQUIP_CSS = `.ef-card{font-family:Arial,Helvetica,sans-serif;color:#111827;background:#fff;max-width:760px;margin:0 auto;padding:24px}
.ef-card .head{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #FF3D00;padding-bottom:12px;margin-bottom:14px}
.ef-card h1{font-size:20px;margin:0}.ef-card .sub{color:#6b7280;font-size:12px;margin:2px 0 0}
.ef-card .num{font-size:20px;font-weight:800;color:#FF3D00;text-align:right;line-height:1.2}
.ef-card .chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}
.ef-card .chip{font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;border:1px solid #e5e7eb;background:#f8fafc}
.ef-card .grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.ef-card .details td{padding:4px 0;vertical-align:top}
.ef-card .details td.k{color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.04em;padding-right:12px;white-space:nowrap;font-weight:600}
.ef-card .details td.v{font-size:13px;color:#111827}
.ef-card .notes{font-size:13px;white-space:normal;margin:0}
.ef-card .risk{font-size:13px;font-weight:700}
.ef-card .foot{margin-top:20px;border-top:1px solid #e5e7eb;padding-top:10px;display:flex;justify-content:space-between;font-size:11px;color:#6b7280}
@media print{.ef-card{max-width:100%;padding:0}}`

const equipCard = (e: OperationEquipment, risk?: PredictiveAssessment | null) => {
  const rows: [string, string][] = [
    ['Equipment number', e.equipmentNumber],
    ['Name', e.name],
    ['Category', e.category],
    ['Make / model', [e.make, e.model].filter(Boolean).join(' / ') || '—'],
    ['Serial number', e.serialNumber ?? '—'],
    ['Agent type', e.agentType ?? '—'],
    ['Manufactured', dd(e.manufactureDate)],
    ['Installed', dd(e.installationDate)],
    ['Last inspection', dd(e.lastInspectionDate)],
    ['Last service', dd(e.lastServiceDate)],
    ['Next service due', dd(e.nextServiceDue)],
    ['Condition rating', e.conditionRating ? `${e.conditionRating}/10` : '—'],
    ['Life span', `${e.lifeSpanMonths} months`],
    ['Service interval', `${e.serviceIntervalMonths} months`],
    ['Status', e.status],
    ['AI risk score', risk ? `${Math.round(risk.riskScore)} / 100 · ${risk.severity}` : 'not scored'],
    ['Suggested action', risk?.recommendedAction ?? '—'],
    ['Remaining life', risk ? `${risk.remainingUsefulLifeMonths} months` : '—'],
    ['Days overdue', risk && risk.daysOverdueService > 0 ? `${risk.daysOverdueService} days` : 'none'],
    ['Failure evidence', risk ? `${Math.round(risk.failureEvidenceScore)}/100` : '—'],
    ['AI explanation', risk?.explanation ?? '—'],
  ]
  return (
    PRINT_LETTERHEAD_HTML +
    `<div class="head"><div><h1>Extreme Fire Equipment &amp; Services</h1><p class="sub">Asset register · AI risk profile</p></div>` +
    `<div class="num">${e.equipmentNumber}<br/><span class="sub">Equipment</span></div></div>` +
    `<div class="chips">${[e.category, e.status].map((c) => `<span class="chip">${c}</span>`).join('')}${risk ? `<span class="chip">${risk.severity} risk</span>` : ''}</div>` +
    `<div class="grid"><div><h3 style="margin:0 0 8px">Details</h3><table class="details">` +
    rows.map(([k, v]) => `<tr><td class="k">${k}</td><td class="v">${v}</td></tr>`).join('') +
    `</table></div></div>` +
    `<div class="foot"><span>Generated ${new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span><span>Extreme Fire Design Inc</span></div>`
  )
}

export default function EquipmentPage() {
  const isMobile = useMediaQuery('(max-width: 700px)')
  const [rows, setRows] = useState<OperationEquipment[]>([])
  const [risks, setRisks] = useState<Record<number, PredictiveAssessment>>({})
  const [anoms, setAnoms] = useState<Anomaly[]>([])
  const [ai, setAi] = useState<EngineOutput | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [form, setForm] = useState({ name: '', category: 'Extinguisher', make: '', model: '', agentType: '', conditionRating: '8', customerId: '', siteId: '' })
  const [sel, setSel] = useState<OperationEquipment | null>(null)
  const [editEq, setEditEq] = useState<any | null>(null)
  const printable = useTablePrint()

  const toDateInput = (d?: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : '')

  const openEdit = (e: OperationEquipment) => {
    setSel(null)
    setEditEq({
      id: e.id,
      name: e.name ?? '',
      category: e.category ?? 'Extinguisher',
      make: e.make ?? '',
      model: e.model ?? '',
      serialNumber: (e as any).serialNumber ?? '',
      agentType: (e as any).agentType ?? '',
      status: e.status ?? 'Active',
      conditionRating: e.conditionRating != null ? String(e.conditionRating) : '8',
      nextServiceDue: toDateInput(e.nextServiceDue),
      lastServiceDate: toDateInput(e.lastServiceDate),
      customerId: e.customerId != null ? String(e.customerId) : '',
      siteId: e.siteId != null ? String(e.siteId) : '',
    })
  }

  const saveEdit = async () => {
    if (!editEq || !editEq.name.trim()) { setErr('Equipment name is required.'); return }
    setSaving(true)
    setErr('')
    try {
      await api.put(`/operations/equipment/${editEq.id}`, {
        name: editEq.name.trim(),
        category: editEq.category,
        make: editEq.make || null,
        model: editEq.model || null,
        serialNumber: editEq.serialNumber || null,
        agentType: editEq.agentType || null,
        status: editEq.status,
        conditionRating: Number(editEq.conditionRating || 8),
        nextServiceDue: editEq.nextServiceDue ? new Date(editEq.nextServiceDue).toISOString() : null,
        lastServiceDate: editEq.lastServiceDate ? new Date(editEq.lastServiceDate).toISOString() : null,
        customerId: editEq.customerId ? Number(editEq.customerId) : null,
        siteId: editEq.siteId ? Number(editEq.siteId) : null,
      })
      setEditEq(null)
      await load()
    } catch (x) { setErr('Could not save equipment') }
    setSaving(false)
  }

  const doDelete = async () => {
    if (!sel) return
    if (!window.confirm(`Delete equipment ${sel.equipmentNumber} — ${sel.name}? This cannot be undone.`)) return
    setSaving(true); setErr('')
    try {
      await api.delete(`/operations/equipment/${sel.id}`)
      setSel(null)
      await load()
    } catch (x: any) { setErr(x?.response?.data?.message ?? 'Delete failed — admin only.') }
    setSaving(false)
  }

  const role = localStorage.getItem('efesms_role') ?? ''
  const dept = localStorage.getItem('efesms_dept') ?? ''
  const canWrite = ['admin', 'administrator', 'management', 'technician', 'contracts manager', 'stores man'].includes((role || '').toLowerCase()) ||
    ['technical', 'operations', 'administration', 'contracts', 'stores'].includes((dept || '').toLowerCase())
  const isAdmin = ['admin', 'administrator'].includes((role || '').toLowerCase())

  const load = async () => {
    setLoading(true)
    try {
      const e = await api.get<OperationEquipment[]>('/operations/equipment')
      setRows(e.data)
    } catch (x) { setErr('Failed to load equipment') }
    try {
      const a = await api.post<EngineOutput>('/operations/analyze/full', {})
      setAi(a.data)
      const m: Record<number, PredictiveAssessment> = {}
      a.data.riskAssessments.forEach((r) => { m[r.equipmentId] = r })
      setRisks(m)
      setAnoms(a.data.anomalies.filter((x) => x.entityType === 'Equipment' || x.type === 'OverdueService'))
    } catch (x) { /* analysis optional */ }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const create = async () => {
    setSaving(true)
    setErr('')
    try {
      await api.post('/operations/equipment', {
        name: form.name,
        category: form.category,
        make: form.make || null,
        model: form.model || null,
        agentType: form.agentType.trim() || null,
        conditionRating: Number(form.conditionRating || 8),
        customerId: form.customerId ? Number(form.customerId) : null,
        siteId: form.siteId ? Number(form.siteId) : null,
      })
      setOpen(false)
      setForm({ name: '', category: 'Extinguisher', make: '', model: '', agentType: '', conditionRating: '8', customerId: '', siteId: '' })
      await load()
    } catch (x) { setErr('Could not create equipment') }
    setSaving(false)
  }

  const barColor = (sev: string) => SEVERITY_COLORS[sev] ?? '#6b7280'
  const critical = Object.values(risks).filter((r) => r.severity === 'High' || r.severity === 'Critical').length

  return (
    <Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h4" sx={{ fontWeight: 900, color: '#f2f2f7', letterSpacing: '-0.02em' }}>Equipment</Typography>
          <Typography variant="body2" sx={{ color: '#9aa0b0' }}>
            {loading ? 'Loading…' : `${rows.length} units · ${critical} at high/critical risk`}
            {ai ? ` · ML: ${ai.ml.scheduleAlgorithm} risk model (${ai.ml.riskTrainingSamples} samples)` : ''}
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<PrintIcon />} disabled={rows.length === 0} onClick={() => printable.print({
          title: 'Equipment Register',
          subtitle: `${rows.length} units · ${critical} at high/critical risk · grouped by category`,
          cols: [{ label: 'Unit' }, { label: 'Category' }, { label: 'AI risk' }, { label: 'Condition' }, { label: 'Next service' }, { label: 'Action needed' }],
          rows: rows.map((r) => {
            const risk = risks[r.id]
            return [
              `${r.name}${r.equipmentNumber ? ` · ${r.equipmentNumber}` : ''}`,
              r.category,
              risk ? `${Math.round(risk.riskScore)} · ${risk.severity}` : 'unscored',
              `${r.conditionRating ?? '—'}/10`,
              dd(r.nextServiceDue),
              risk?.recommendedAction ?? '—',
            ]
          }),
          groupBy: 1,
          note: 'Asset register with AI-predicted risk from the maintenance engine.',
        })} sx={{ borderRadius: 2 }}>Print</Button>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={load} sx={{ borderRadius: 2 }}>Refresh</Button>
        {canWrite && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)} sx={{ borderRadius: 2, bgcolor: '#FF3D00', '&:hover': { bgcolor: '#C42A00' } }}>
            Add unit
          </Button>
        )}
      </Box>

      {err && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr('')}>{err}</Alert>}
      {anoms.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }} icon={<WarningAmberIcon />}>
          {anoms.length} service-anomaly{anoms.length > 1 ? 'ies' : 'y'} detected — {anoms.map((a) => a.description).slice(0, 2).join(' · ')}
        </Alert>
      )}

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2.5, bgcolor: '#ffffff', boxShadow: '0 10px 34px rgba(0,0,0,0.35)' }}>
        <Table size={isMobile ? 'small' : 'medium'}>
          <TableHead>
            <TableRow sx={{ '& th': { bgcolor: '#fafafc', fontWeight: 800, color: '#0f0f13', borderBottom: '1px solid #eef0f4' } }}>
              <TableCell>Unit</TableCell>
              <TableCell>Category</TableCell>
              <TableCell sx={{ minWidth: { xs: 0, sm: 150 } }}>AI risk</TableCell>
              <TableCell>Condition</TableCell>
              {!isMobile && <TableCell>Next service</TableCell>}
              <TableCell>Action needed</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={6} sx={{ textAlign: 'center', color: '#9ca3af', py: 4 }}>No equipment registered.</TableCell></TableRow>
            )}
            {rows.map((r) => {
              const risk = risks[r.id]
              return (
                <TableRow key={r.id} hover onClick={() => setSel(r)} sx={{ cursor: 'pointer', '&:hover': { bgcolor: '#fff3ea' } }}>
                  <TableCell>
                    <Typography sx={{ fontWeight: 700, color: '#0f0f13', fontSize: 14 }}>{r.name}</Typography>
                    <Typography variant="caption" sx={{ color: '#9ca3af' }}>{r.equipmentNumber}{r.make ? ` · ${r.make} ${r.model}` : ''}</Typography>
                    <Typography variant="caption" sx={{ color: '#FF3D00', fontWeight: 800, display: 'block' }}>
                      {r.customerNumber ?? (r.customerId ? `CUS-${String(r.customerId).padStart(6, '0')}` : 'No customer')}{r.customerName ? ` · ${r.customerName}` : ''}{r.siteName ? ` · ${r.siteName}` : ''}
                    </Typography>
                  </TableCell>
                  <TableCell><Chip size="small" label={r.category} sx={{ bgcolor: '#f1f5f9', color: '#374151', fontWeight: 700 }} /></TableCell>
                  <TableCell>
                    {risk ? (
                      <Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Chip size="small" sx={{ bgcolor: `${barColor(risk.severity)}18`, color: barColor(risk.severity), fontWeight: 800 }} label={`${Math.round(risk.riskScore)} · ${risk.severity}`} />
                        </Box>
                        <LinearProgress
                          variant="determinate"
                          value={risk.riskScore}
                          sx={{ mt: 0.75, height: 5, borderRadius: 3, bgcolor: '#eef0f4', '& .MuiLinearProgress-bar': { bgcolor: barColor(risk.severity) } }}
                        />
                      </Box>
                    ) : (
                      <Typography variant="caption" sx={{ color: '#9ca3af' }}>unscored</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {risk ? (
                      <Chip size="small" label={`${r.conditionRating}/10`} sx={{ bgcolor: `${r.conditionRating >= 8 ? '#2e7d32' : r.conditionRating >= 6 ? '#ff8f00' : '#d32f2f'}18`, color: r.conditionRating >= 8 ? '#2e7d32' : r.conditionRating >= 6 ? '#c77700' : '#d32f2f', fontWeight: 700 }} />
                    ) : <Typography variant="caption" sx={{ color: '#9ca3af' }}>{r.conditionRating}/10</Typography>}
                  </TableCell>
                  {!isMobile && <TableCell>
                    <Typography variant="caption" sx={{ color: '#6b7280' }}>
                      {r.nextServiceDue ? new Date(r.nextServiceDue).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </Typography>
                  </TableCell>}
                  <TableCell>
                    {risk ? (
                      <Typography variant="caption" sx={{ color: '#6b7280', fontWeight: 600 }}>{risk.recommendedAction}</Typography>
                    ) : <Typography variant="caption" sx={{ color: '#9ca3af' }}>—</Typography>}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>

      {ai && ai.riskClusters.length > 0 && (
        <Paper elevation={0} sx={{ mt: 2.5, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2.5, p: 2.5, bgcolor: '#ffffff', boxShadow: '0 10px 34px rgba(0,0,0,0.35)' }}>
          <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f0f13', display: 'flex', alignItems: 'center', gap: 1 }}>
            <AutoAwesomeIcon sx={{ color: '#FF3D00' }} /> Risk cohorts ({ai.ml.clusteringAlgorithm})
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 1.5 }}>
            {ai.riskClusters.map((c) => (
              <Chip key={c.label} label={`${c.label} · ${c.clusterCount} units · mean ${Math.round(c.meanRisk)}`} sx={{ bgcolor: `${barColor(c.label)}18`, color: barColor(c.label), fontWeight: 800, '& .MuiChip-label': { py: 1 } }} />
            ))}
          </Box>
        </Paper>
      )}

      <Dialog open={!!sel} onClose={() => setSel(null)} fullWidth maxWidth="md" fullScreen={isMobile} sx={{ '& .MuiPaper-root': { borderRadius: 3 } }}>
        {sel && (() => {
          const risk = risks[sel.id]
          const uanoms = anoms.filter((a) => a.entityId === sel.id)
          const savePdf = async () => {
            const { downloadAsPdf } = await import('../lib/docDownload')
            await downloadAsPdf(`<div class="ef-card">${equipCard(sel, risk)}</div>`, EQUIP_CSS, sel.equipmentNumber)
          }
          const saveDoc = async () => {
            const { downloadAsDoc } = await import('../lib/docDownload')
            await downloadAsDoc(`<div class="ef-card">${equipCard(sel, risk)}</div>`, EQUIP_CSS, sel.equipmentNumber)
          }
          const line: [string, string][] = [
            ['Name', sel.name],
            ['Equipment number', sel.equipmentNumber],
            ['Customer', `${sel.customerNumber ?? (sel.customerId ? `CUS-${String(sel.customerId).padStart(6, '0')}` : '—')}${sel.customerName ? ` · ${sel.customerName}` : ''}`],
            ['Site', sel.siteName ?? '—'],
            ['Category', sel.category],
            ['Make / model', [sel.make, sel.model].filter(Boolean).join(' / ') || '—'],
            ['Serial number', sel.serialNumber ?? '—'],
            ['Agent type', sel.agentType ?? '—'],
            ['Manufactured', dd(sel.manufactureDate)],
            ['Installed', dd(sel.installationDate)],
            ['Last inspection', dd(sel.lastInspectionDate)],
            ['Last service', dd(sel.lastServiceDate)],
            ['Next service due', dd(sel.nextServiceDue)],
            ['Life span', `${sel.lifeSpanMonths} months`],
            ['Service interval', `${sel.serviceIntervalMonths} months`],
            ['Condition rating', `${sel.conditionRating}/10`],
            ['Status', sel.status],
          ]
          return (
            <>
              <DialogTitle sx={{ fontWeight: 900, bgcolor: '#12121a', color: '#f2f2f7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {sel.equipmentNumber}
                <Box className="ef-no-print" sx={{ display: 'flex', gap: 0.5 }}>
                  {canWrite && <Button size="small" variant="outlined" onClick={() => openEdit(sel)} sx={{ borderRadius: 2, color: '#f2f2f7', borderColor: 'rgba(255,255,255,0.25)' }}>Edit</Button>}
                  {isAdmin && <Button size="small" variant="outlined" color="error" onClick={doDelete} sx={{ borderRadius: 2, color: '#ff8a80', borderColor: 'rgba(255,138,128,0.5)' }}>Delete</Button>}
                  <IconButton onClick={savePdf} className="ef-no-print" sx={{ color: '#f2f2f7' }} aria-label="Download PDF"><DownloadIcon /></IconButton>
                  <IconButton onClick={() => window.print()} className="ef-no-print" sx={{ color: '#f2f2f7' }} aria-label="Print"><PrintIcon /></IconButton>
                </Box>
              </DialogTitle>
              <DialogContent dividers id="print-card" className="ef-card" sx={{ color: '#0f0f13', bgcolor: '#ffffff' }}>
                <PrintLetterhead />
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
                  <Chip size="small" label={sel.category} sx={{ bgcolor: '#f1f5f9', color: '#374151', fontWeight: 800, border: '1px solid #e5e7eb' }} />
                  <Chip size="small" label={sel.status} sx={{ bgcolor: `${sel.status === 'Active' ? '#2e7d32' : '#d32f2f'}18`, color: sel.status === 'Active' ? '#2e7d32' : '#d32f2f', fontWeight: 800 }} />
                  {risk && <Chip size="small" label={`${risk.severity} risk · ${Math.round(risk.riskScore)}/100`} sx={{ bgcolor: `${barColor(risk.severity)}18`, color: barColor(risk.severity), fontWeight: 800 }} />}
                </Box>
                {risk && (
                  <Box sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                      <Typography sx={{ fontWeight: 800, color: '#0f0f13', fontSize: 14 }}>AI risk assessment</Typography>
                      <Typography sx={{ fontWeight: 800, color: barColor(risk.severity), fontSize: 14 }}>{Math.round(risk.riskScore)} / 100</Typography>
                    </Box>
                    <LinearProgress variant="determinate" value={risk.riskScore} sx={{ height: 8, borderRadius: 4, bgcolor: '#eef0f4', '& .MuiLinearProgress-bar': { bgcolor: barColor(risk.severity) } }} />
                    <Typography variant="body2" sx={{ color: '#374151', mt: 1 }}>
                      {risk.explanation}
                    </Typography>
                  </Box>
                )}
                {risk && risk.daysOverdueService > 0 && (
                  <Alert severity="error" sx={{ mb: 2 }}>{risk.daysOverdueService} days overdue for service.</Alert>
                )}
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: '0 16px' }}>
                  {line.map(([k, v]) => (
                    <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.55, borderBottom: '1px dashed #eef0f4' }}>
                      <Typography variant="caption" sx={{ color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k}</Typography>
                      <Typography variant="body2" sx={{ color: '#0f0f13', fontWeight: 600, textAlign: 'right' }}>{v}</Typography>
                    </Box>
                  ))}
                </Box>
                {risk && (
                  <Box sx={{ mt: 2, p: 2, borderRadius: 2, bgcolor: `${barColor(risk.severity)}12`, border: `1px solid ${barColor(risk.severity)}38` }}>
                    <Typography sx={{ fontWeight: 800, color: '#0f0f13', fontSize: 14, mb: 0.5 }}>Suggested action</Typography>
                    <Typography variant="body2" sx={{ color: '#0f0f13' }}>{risk.recommendedAction}</Typography>
                    <Typography variant="body2" sx={{ color: '#374151', mt: 0.5 }}>
                      Remaining useful life: {risk.remainingUsefulLifeMonths} months · Failure evidence {Math.round(risk.failureEvidenceScore)}/100
                    </Typography>
                  </Box>
                )}
                {uanoms.length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography sx={{ fontWeight: 800, color: '#0f0f13', fontSize: 14, mb: 1 }}>Open anomalies for this unit</Typography>
                    {uanoms.map((a, idx) => (
                      <Alert key={idx} severity={a.severity === 'Critical' || a.severity === 'High' ? 'error' : 'warning'} sx={{ mb: 1 }}>
                        {a.description}
                      </Alert>
                    ))}
                  </Box>
                )}
                <Box className="ef-no-print" sx={{ borderTop: '1px solid #eef0f4', mt: 2, pt: 1.5, display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="caption" sx={{ color: '#9ca3af' }}>Generated {new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</Typography>
                  <Typography variant="caption" sx={{ color: '#9ca3af' }}>Extreme Fire Design Inc</Typography>
                </Box>
              </DialogContent>
              <DialogActions className="ef-no-print" sx={{ px: 3, pb: 2, bgcolor: '#fafafc', flexWrap: 'wrap', gap: 1 }}>
                <Button variant="outlined" startIcon={<DownloadIcon />} onClick={savePdf} sx={{ borderRadius: 2, color: '#0f0f13', borderColor: '#e5e7eb' }}>Download PDF</Button>
                <Button variant="outlined" startIcon={<DownloadIcon />} onClick={saveDoc} sx={{ borderRadius: 2, color: '#0f0f13', borderColor: '#e5e7eb' }}>Download DOC</Button>
                <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()} sx={{ borderRadius: 2, bgcolor: '#FF3D00', '&:hover': { bgcolor: '#C42A00' } }}>Print / Save as PDF</Button>
              </DialogActions>
            </>
          )
        })()}
      </Dialog>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm" fullScreen={isMobile}>
        <DialogTitle sx={{ fontWeight: 800 }}>Register equipment</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gap: 2, mt: 1 }}>
            <TextField label="Name *" fullWidth value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} size="small" sx={lightFieldSx} />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 2 }}>
              <FormControl size="small" sx={lightFieldSx}><InputLabel>Category</InputLabel>
                <Select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as string })}>
                  {CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField label="Make" size="small" value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} sx={lightFieldSx} />
              <TextField label="Model" size="small" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} sx={lightFieldSx} />
            </Box>
            <Autocomplete
              freeSolo
              options={EXTINGUISHER_TYPES}
              value={form.agentType}
              onChange={(_, v) => setForm({ ...form, agentType: v ?? '' })}
              onInputChange={(_, value) => setForm((current) => ({ ...current, agentType: value }))}
              sx={lightFieldSx}
              renderInput={(params) => <TextField {...params} label="Agent / extinguisher type (pick or type your own)" size="small" sx={lightFieldSx} />}
            />
            <TextField label="Condition rating (1–10)" type="number" size="small" value={form.conditionRating} onChange={(e) => setForm({ ...form, conditionRating: e.target.value })} sx={lightFieldSx} />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
              <TextField label="Customer id (links to one customer ID)" type="number" size="small" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} sx={lightFieldSx} />
              <TextField label="Site id" type="number" size="small" value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })} sx={lightFieldSx} />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpen(false)} sx={{ borderRadius: 2 }}>Cancel</Button>
          <Button variant="contained" disabled={saving || !form.name.trim()} onClick={create} sx={{ borderRadius: 2, bgcolor: '#FF3D00', '&:hover': { bgcolor: '#C42A00' } }}>
            {saving ? 'Saving…' : 'Register'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!editEq} onClose={() => setEditEq(null)} fullWidth maxWidth="sm" fullScreen={isMobile}>
        <DialogTitle sx={{ fontWeight: 800 }}>Edit equipment</DialogTitle>
        <DialogContent>
          {err && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr('')}>{err}</Alert>}
          <Box sx={{ display: 'grid', gap: 2, mt: 1 }}>
            <TextField label="Name *" fullWidth value={editEq?.name ?? ''} onChange={(e) => setEditEq((f: any) => ({ ...f, name: e.target.value }))} size="small" sx={lightFieldSx} />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 2 }}>
              <FormControl size="small" sx={lightFieldSx}><InputLabel>Category</InputLabel>
                <Select label="Category" value={editEq?.category ?? ''} onChange={(e) => setEditEq((f: any) => ({ ...f, category: e.target.value as string }))}>
                  {CATEGORIES.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField label="Make" size="small" value={editEq?.make ?? ''} onChange={(e) => setEditEq((f: any) => ({ ...f, make: e.target.value }))} sx={lightFieldSx} />
              <TextField label="Model" size="small" value={editEq?.model ?? ''} onChange={(e) => setEditEq((f: any) => ({ ...f, model: e.target.value }))} sx={lightFieldSx} />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
              <TextField label="Serial number" size="small" value={editEq?.serialNumber ?? ''} onChange={(e) => setEditEq((f: any) => ({ ...f, serialNumber: e.target.value }))} sx={lightFieldSx} />
              <Autocomplete
                freeSolo
                options={EXTINGUISHER_TYPES}
                value={editEq?.agentType ?? ''}
                onChange={(_, v) => setEditEq((f: any) => ({ ...f, agentType: v ?? '' }))}
                onInputChange={(_, value) => setEditEq((f: any) => ({ ...f, agentType: value }))}
                sx={lightFieldSx}
                renderInput={(params) => <TextField {...params} label="Agent type (pick or type your own)" size="small" sx={lightFieldSx} />}
              />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 2 }}>
              <TextField label="Status" size="small" value={editEq?.status ?? ''} onChange={(e) => setEditEq((f: any) => ({ ...f, status: e.target.value }))} sx={lightFieldSx} />
              <TextField label="Condition (1–10)" type="number" size="small" value={editEq?.conditionRating ?? ''} onChange={(e) => setEditEq((f: any) => ({ ...f, conditionRating: e.target.value }))} sx={lightFieldSx} />
              <TextField label="Next service due" type="date" size="small" slotProps={{ inputLabel: { shrink: true } }} value={editEq?.nextServiceDue ?? ''} onChange={(e) => setEditEq((f: any) => ({ ...f, nextServiceDue: e.target.value }))} sx={lightFieldSx} />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 2 }}>
              <TextField label="Last service" type="date" size="small" slotProps={{ inputLabel: { shrink: true } }} value={editEq?.lastServiceDate ?? ''} onChange={(e) => setEditEq((f: any) => ({ ...f, lastServiceDate: e.target.value }))} sx={lightFieldSx} />
              <TextField label="Customer id" type="number" size="small" value={editEq?.customerId ?? ''} onChange={(e) => setEditEq((f: any) => ({ ...f, customerId: e.target.value }))} sx={lightFieldSx} />
              <TextField label="Site id" type="number" size="small" value={editEq?.siteId ?? ''} onChange={(e) => setEditEq((f: any) => ({ ...f, siteId: e.target.value }))} sx={lightFieldSx} />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditEq(null)} sx={{ borderRadius: 2 }}>Cancel</Button>
          <Button variant="contained" disabled={saving || !editEq?.name.trim()} onClick={saveEdit} sx={{ borderRadius: 2, bgcolor: '#FF3D00', '&:hover': { bgcolor: '#C42A00' } }}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogActions>
      </Dialog>

      {printable.node}
    </Box>
  )
}
