import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import {
   Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
   FormControl, FormHelperText, Grid, IconButton, InputLabel, MenuItem, Paper, Select, Switch, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
  useMediaQuery,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import RefreshIcon from '@mui/icons-material/Refresh'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import CloseIcon from '@mui/icons-material/Close'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import PrintIcon from '@mui/icons-material/Print'
import DownloadIcon from '@mui/icons-material/Download'
import { api } from '../api/client'
import CustomerIdField, { type CustomerMatch } from '../components/CustomerIdField'
import type { OperationJob, ScheduledAssignment, Technician, OperationEquipment, EngineOutput, JobTask, InventoryRow } from '../types/fireops'
import { darkFieldSx } from '../lib/fieldSx'
import { EXTINGUISHER_AGENT_TYPES, EXTINGUISHER_UNIT_TYPES, inferExtinguisherAgent, matchExtinguisherUnit } from '../lib/extinguishers'
import { JOBSTATUS_COLORS, PRIORITY_COLORS, JOB_TASK_TYPES } from '../types/fireops'
import { PRINT_LETTERHEAD_HTML, PrintLetterhead, useTablePrint } from '../components/print'

const JOB_TYPES = ['Inspection', 'Service', 'Refill', 'Maintenance', 'Installation']
const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent']
const todayInputDate = () => {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

// Calculate the next service cycle as a calendar month (not a fixed 180 days).
const addMonthsToInputDate = (date: string, months = 6) => {
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) return ''
  const targetMonth = new Date(year, month - 1 + months, 1)
  const lastDay = new Date(targetMonth.getFullYear(), targetMonth.getMonth() + 1, 0).getDate()
  return `${targetMonth.getFullYear()}-${String(targetMonth.getMonth() + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`
}

const agentFromUnitType = (agentType?: string | null, unitType?: string | null) =>
  inferExtinguisherAgent(unitType) || inferExtinguisherAgent(agentType) || agentType || ''

const darkFormControlSx = {
  '& .MuiInputBase-root': { bgcolor: '#0f0f13', borderRadius: 2 },
  '& .MuiInputLabel-root': { color: '#9aa0b0' },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#2a2a33' },
}

const darkSelectSx = {
  bgcolor: '#0f0f13',
  '& .MuiSelect-select': { color: '#ffffff' },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#2a2a33' },
}

/** One vertical column — no side-by-side fields, no horizontal scrolling. */

interface JobFormState {
  id: number | null
  customerId: number | null
  title: string
  jobType: string
  priority: string
  status: string
  plannedStart: string
  plannedEnd: string
  estimatedHours: string
  quotedAmount: string
  address: string
  email: string
  nextServiceDate: string
  notes: string
  worksDoneSatisfactorily: boolean
  siteId: string
  equipmentId: string
  agentType: string
  unitCount: string
  requiredSkills: string
  requiredCertifications: string
  customerNumber: string
  technicianId: string
  technicianName: string
}

const blankJobForm = (): JobFormState => ({
  id: null, customerId: null, title: '', jobType: 'Service', priority: 'Normal', status: 'Draft',
  plannedStart: '', plannedEnd: '', estimatedHours: '', quotedAmount: '', address: '', email: '',
  nextServiceDate: addMonthsToInputDate(todayInputDate()), notes: '', worksDoneSatisfactorily: false, siteId: '', equipmentId: '',
  agentType: 'ABC Dry Powder', unitCount: '1', requiredSkills: '', requiredCertifications: '',
  customerNumber: '', technicianId: '', technicianName: '',
})

const apiErrorMessage = (error: any, fallback: string) => {
  const data = error?.response?.data
  if (typeof data?.message === 'string') return data.message
  if (typeof data?.detail === 'string') return data.detail
  if (typeof data?.title === 'string') return data.title
  if (typeof data?.error === 'string') return data.error
  if (data?.errors && typeof data.errors === 'object') {
    const messages = Object.values(data.errors).flatMap((value) => Array.isArray(value) ? value : [value])
    if (messages.length > 0) return messages.join(' ')
  }
  if (typeof error?.message === 'string') return error.message
  return fallback
}

const pdf = (id?: number | null, prefix = 'CUS') => (id ? `${prefix}-${String(id).padStart(6, '0')}` : '—')
const customerIdOf = (job: OperationJob) => job.customerNumber ?? pdf(job.customerId)
const equipOf = (job: OperationJob) => {
  const units = (job as any).unitCount ? ` ×${(job as any).unitCount}` : ''
  if (job.equipmentName) return `${job.equipmentNumber ? `${job.equipmentNumber} · ` : ''}${job.equipmentName}${(job as any).agentType ? ` (${(job as any).agentType}${(job as any).agentAmountKg ? ` - ${(job as any).agentAmountKg}kg` : ''})` : ''}${units}`
  if ((job as any).agentType) return `${(job as any).agentType}${(job as any).agentAmountKg ? ` - ${(job as any).agentAmountKg}kg` : ''} (selected)${units}`
  return pdf(job.equipmentId, 'EQ') + units
}
const siteOf = (job: OperationJob) => job.siteName ?? pdf(job.siteId, 'SITE')
const fmtDT = (d?: string | null) => (d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')

const splitCsv = (s?: string | null) =>
  (s ?? '').split(',').map((x) => x.trim()).filter(Boolean)

/** Skill-match score 0–1: matched required skills / total required (exact case-insensitive). */
const skillMatch = (requiredCsv?: string | null, haveCsv?: string | null) => {
  const required = splitCsv(requiredCsv)
  if (required.length === 0) return { pct: 100, matched: [] as string[], missing: [] as string[], required }
  const have = new Set(splitCsv(haveCsv).map((s) => s.toLowerCase()))
  const matched = required.filter((r) => have.has(r.toLowerCase()))
  const missing = required.filter((r) => !have.has(r.toLowerCase()))
  return { pct: Math.round((matched.length / required.length) * 100), matched, missing, required }
}

const certMatch = (requiredCsv?: string | null, haveCsv?: string | null) => {
  const required = splitCsv(requiredCsv)
  if (required.length === 0) return { pct: 100, matched: [] as string[], missing: [] as string[] }
  const have = new Set(splitCsv(haveCsv).map((s) => s.toLowerCase()))
  const matched = required.filter((r) => have.has(r.toLowerCase()))
  const missing = required.filter((r) => !have.has(r.toLowerCase()))
  return { pct: Math.round((matched.length / required.length) * 100), matched, missing }
}

const taskUnitIds = (t: JobTask): number[] =>
  t.equipmentIdList ?? splitCsv(t.equipmentIds).map(Number).filter((n) => !Number.isNaN(n))

const taskLineText = (t: JobTask) => {
  const parts: string[] = []
  const units = taskUnitIds(t)
  if (units.length) parts.push(`Units: ${units.map((id) => `EQ-${String(id).padStart(6, '0')}`).join(', ')}`)
  if (t.agentType) parts.push(`Agent: ${t.agentType}`)
  if (t.unitType) parts.push(`Unit: ${t.unitType}`)
  if (t.storeItemName) parts.push(`Stores item: ${t.storeItemName}`)
  parts.push(`Qty ${t.quantity}`)
  if (t.unitPrice != null) parts.push(`@ US$${Number(t.unitPrice).toFixed(2)}`)
  parts.push(t.isCompleted ? 'Done' : 'Pending')
  return parts.join(' · ')
}

function JobCardDialog({ job, techs, canAssign, canEdit, isAdmin, onAssign, onEdit, onDelete, onEditSkills, onClose }: { job: OperationJob | null; techs: Technician[]; canAssign: boolean; canEdit: boolean; isAdmin: boolean; onAssign: (jobId: number, techId: string, techName: string) => Promise<void>; onEdit: (job: OperationJob) => void; onDelete: (job: OperationJob) => void; onEditSkills?: (job: OperationJob, requiredSkills: string, requiredCertifications: string) => Promise<void>; onClose: () => void }) {
  const isMobile = useMediaQuery('(max-width: 700px)')
  const [assignId, setAssignId] = useState('')
  const [assignName, setAssignName] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [reqSkills, setReqSkills] = useState('')
  const [reqCerts, setReqCerts] = useState('')
  const [skillsBusy, setSkillsBusy] = useState(false)
  const [skillsMsg, setSkillsMsg] = useState('')
  useEffect(() => { setAssignId(''); setAssignName(''); setSkillsOpen(false); setSkillsMsg('') }, [job?.id])
  useEffect(() => {
    if (job) { setReqSkills(job.requiredSkills ?? ''); setReqCerts(job.requiredCertifications ?? '') }
  }, [job?.id, job?.requiredSkills, job?.requiredCertifications])
  if (!job) return null
  const pickedTech = assignId.trim() && !Number.isNaN(Number(assignId)) ? techs.find((t) => t.id === Number(assignId)) : null
  const skillInfo = skillMatch(job.requiredSkills, pickedTech?.skills)
  const certInfo = certMatch(job.requiredCertifications, pickedTech?.certifications)
  const downloadable =
    PRINT_LETTERHEAD_HTML +
    `<div class="head"><div><h1>Extreme Fire Equipment &amp; Services</h1><p class="sub">Fire Protection · Maintenance · Life Safety Compliance</p></div>` +
    `<div class="num">${job.jobNumber}<br/><span class="sub">Job Card</span></div></div>` +
    `<div class="chips">${[job.status, job.priority, job.jobType].map((c) => `<span class="chip">${c}</span>`).join('')}</div>` +
     `<div class="grid"><div><h3 style="margin:0 0 8px">Details</h3><table class="details">` +
      [
        ['Title', job.title],
        ['Technician', job.technicianName ?? 'Unassigned'],
        ['Customer', `${customerIdOf(job)}${job.customerName ? ` · ${job.customerName}` : ''}`],
        ['Site', siteOf(job)],
        ['Equipment', equipOf(job) + (job.agentType ? ` (${job.agentType}${job.agentAmountKg ? ` - ${job.agentAmountKg}kg` : ''})` : '')],
        ['Source quotation', job.sourceQuotationNumber ?? '—'],
        ['Planned start', fmtDT(job.plannedStart)],
        ['Planned end', fmtDT(job.plannedEnd)],
        ['Completed', fmtDT(job.completedAt)],
      ].map(([k, v]) => `<tr><td class="k">${k}</td><td class="v">${v}</td></tr>`).join('') +
      `</table></div><div><h3 style="margin:0 0 8px">Contact</h3><table class="details">` +
      [
        ['Address', job.address ?? '—'],
        ['Phone', job.customerPhone ?? '—'],
        ['WhatsApp', job.customerWhatsApp ?? '—'],
        ['Email', job.customerEmail ?? job.email ?? '—'],
        ['Next service', job.nextServiceDate ? new Date(job.nextServiceDate).toLocaleDateString() : '—'],
      ].map(([k, v]) => `<tr><td class="k">${k}</td><td class="v">${v}</td></tr>`).join('') +
      `</table></div></div>` +
      `<div class="grid"><div><h3 style="margin:0 0 8px">Details</h3><table class="details">` +
      [
        ['Title', job.title],
        ['Technician', job.technicianName ?? 'Unassigned'],
        ['Customer', `${customerIdOf(job)}${job.customerName ? ` · ${job.customerName}` : ''}`],
        ['Site', siteOf(job)],
        ['Equipment', equipOf(job) + (job.agentType ? ` (${job.agentType}${job.agentAmountKg ? ` - ${job.agentAmountKg}kg` : ''})` : '')],
        ['Source quotation', job.sourceQuotationNumber ?? '—'],
        ['Planned start', fmtDT(job.plannedStart)],
        ['Planned end', fmtDT(job.plannedEnd)],
        ['Completed', fmtDT(job.completedAt)],
      ].map(([k, v]) => `<tr><td class="k">${k}</td><td class="v">${v}</td></tr>`).join('') +
     `</table></div><div><h3 style="margin:0 0 8px">Scope</h3><p class="notes">${(job.description ?? '—').split('\n').join('<br/>')}</p>` +
     `<h3 style="margin:12px 0 8px">Work plan</h3><table class="details">` +
     [
       ['Estimated hours', `${job.estimatedHours ?? '—'}h`],
       ['Required skills', job.requiredSkills || '—'],
       ['Certifications', job.requiredCertifications || '—'],
       ['Quoted amount', job.quotedAmount != null ? `US$${Number(job.quotedAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'],
       ['Notes', job.notes ?? '—'],
       ['Works done', job.worksDoneSatisfactorily ? 'Yes' : 'No'],
     ].map(([k, v]) => `<tr><td class="k">${k}</td><td class="v">${v}</td></tr>`).join('') +
     `</table></div></div>` +
    (job.tasks && job.tasks.length
      ? `<h3 style="margin:16px 0 8px">Task lines</h3><table class="details">` +
        job.tasks.map((t) => `<tr><td class="k">${t.taskType}</td><td class="v">${taskLineText(t)}</td></tr>`).join('') +
        `</table>`
      : '') +
    `<div class="foot"><span>Generated ${new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span><span>Extreme Fire Design Inc</span></div>`
  const inlineCss = `.ef-jobcard{font-family:Arial,Helvetica,sans-serif;color:#111827;background:#fff;max-width:760px;margin:0 auto;padding:24px}
.ef-jobcard .head{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #FF3D00;padding-bottom:12px;margin-bottom:14px}
.ef-jobcard h1{font-size:20px;margin:0}.ef-jobcard .sub{color:#6b7280;font-size:12px;margin:2px 0 0}
.ef-jobcard .num{font-size:20px;font-weight:800;color:#FF3D00;text-align:right;line-height:1.2}
.ef-jobcard .chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}
.ef-jobcard .chip{font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;border:1px solid #e5e7eb;background:#f8fafc}
.ef-jobcard .grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.ef-jobcard .details td{padding:4px 0;vertical-align:top}
.ef-jobcard .details td.k{color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.04em;padding-right:12px;white-space:nowrap;font-weight:600}
.ef-jobcard .details td.v{font-size:13px;color:#111827}
.ef-jobcard .notes{font-size:13px;white-space:normal;margin:0}
.ef-jobcard .foot{margin-top:20px;border-top:1px solid #e5e7eb;padding-top:10px;display:flex;justify-content:space-between;font-size:11px;color:#6b7280}
@media print{.ef-jobcard{max-width:100%;padding:0}}`

  const cardHtml = `<div class="ef-jobcard">${downloadable}</div>`
  const savePdf = async () => {
    const { downloadAsPdf } = await import('../lib/docDownload')
    await downloadAsPdf(cardHtml, inlineCss, job.jobNumber)
  }
  const saveDoc = async () => {
    const { downloadAsDoc } = await import('../lib/docDownload')
    await downloadAsDoc(cardHtml, inlineCss, job.jobNumber)
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md" fullScreen={isMobile} sx={{ '& .MuiPaper-root': { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 800, bgcolor: '#12121a', color: '#f2f2f7' }}>
        Full job card
        <IconButton onClick={onClose} className="ef-no-print" sx={{ position: 'absolute', right: 12, top: 12, color: '#9aa0b0' }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers id="print-jobcard" className="ef-jobcard" sx={{ color: '#0f0f13', bgcolor: '#ffffff' }}>
        <PrintLetterhead />
        <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', borderBottom: '3px solid #FF3D00', pb: 2, mb: 2 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 900, color: '#0f0f13' }}>Extreme Fire Equipment &amp; Services</Typography>
            <Typography variant="body2" sx={{ color: '#6b7280' }}>Fire Protection · Maintenance · Life Safety Compliance</Typography>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Typography variant="h6" sx={{ fontWeight: 800, color: '#FF3D00', lineHeight: 1.1 }}>{job.jobNumber}</Typography>
            <Typography variant="caption" sx={{ color: '#6b7280' }}>Job Card</Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          <Chip size="small" label={job.status} sx={{ bgcolor: `${JOBSTATUS_COLORS[job.status] ?? '#6b7280'}18`, color: JOBSTATUS_COLORS[job.status] ?? '#6b7280', fontWeight: 800 }} />
          <Chip size="small" label={job.priority} sx={{ bgcolor: `${PRIORITY_COLORS[job.priority] ?? '#0288d1'}18`, color: PRIORITY_COLORS[job.priority] ?? '#0288d1', fontWeight: 800 }} />
          <Chip size="small" label={job.jobType} sx={{ bgcolor: '#f1f5f9', color: '#374151', fontWeight: 800 }} />
        </Box>

         <Grid container spacing={3}>
           <Grid size={{ xs: 12, md: 6 }}>
             <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#0f0f13', mb: 0.5 }}>Details</Typography>
              {(
                [
                  ['Title', job.title],
                  ['Technician', job.technicianName ?? 'Unassigned'],
                  ['Customer', `${customerIdOf(job)}${job.customerName ? ` · ${job.customerName}` : ''}`],
                   ['Site', siteOf(job)],
                   ['Equipment', equipOf(job)],
                   ['Units to service', String((job as any).unitCount ?? 1)],
                   ['Planned start', fmtDT(job.plannedStart)],
                   ['Planned end', fmtDT(job.plannedEnd)],
                   ['Completed', fmtDT(job.completedAt)],
                 ] as [string, string][]
              ).map(([k, v]) => (
                <Row key={k} k={k} v={v} />
              ))}
              {job.sourceQuotationNumber && <Row k="Source quotation" v={job.sourceQuotationNumber} />}
             {job.address && <Row k="Address" v={job.address} />}
             {job.customerPhone && <Row k="Phone" v={job.customerPhone} />}
             {job.customerWhatsApp && <Row k="WhatsApp" v={job.customerWhatsApp} />}
             {(job.customerEmail || job.email) && <Row k="Email" v={(job.customerEmail ?? job.email) as string} />}
             {job.nextServiceDate && <Row k="Next service" v={new Date(job.nextServiceDate).toLocaleDateString()} />}
           </Grid>
           <Grid size={{ xs: 12, md: 6 }}>
             <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#0f0f13', mb: 0.5 }}>Scope &amp; work plan</Typography>
             <Typography variant="body2" sx={{ color: '#0f0f13', whiteSpace: 'pre-wrap', mb: 1 }}>{job.description || '—'}</Typography>
             {(
               [
                 ['Estimated hours', job.estimatedHours != null ? `${job.estimatedHours}h` : '—'],
                 ['Required skills', job.requiredSkills || '—'],
                 ['Certifications', job.requiredCertifications || '—'],
                 ['Quoted amount', job.quotedAmount != null ? `US$${Number(job.quotedAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'],
                 ['Notes', job.notes || '—'],
                 ['Works done', job.worksDoneSatisfactorily ? 'Yes' : 'No'],
                 ['Created', fmtDT(job.createdAt)],
               ] as [string, string][]
             ).map(([k, v]) => (
               <Row key={k} k={k} v={v} />
             ))}
           </Grid>
         </Grid>

         {job.tasks && job.tasks.length > 0 && (
           <Box sx={{ mt: 2 }}>
             <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#0f0f13', mb: 0.5 }}>Task lines</Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 800, color: '#0f0f13' }}>Type</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#0f0f13' }}>Agent / unit model</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#0f0f13' }}>Qty</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#0f0f13' }}>Value</TableCell>
                    <TableCell sx={{ fontWeight: 800, color: '#0f0f13' }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {job.tasks.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell sx={{ color: '#0f0f13', fontWeight: 600 }}>{t.taskType}</TableCell>
                      <TableCell sx={{ color: '#1f2937' }}>
                        {t.agentType ? `Agent: ${t.agentType}` : 'Agent: per selected unit'}{t.unitType ? ` · Unit: ${t.unitType}` : ''}{taskUnitIds(t).length ? ` · ${taskUnitIds(t).length} selected unit(s)` : ''}
                      </TableCell>
                      <TableCell sx={{ color: '#0f0f13' }}>{t.quantity}</TableCell>
                      <TableCell sx={{ color: '#0f0f13' }}>{t.lineValue != null ? `US$${Number(t.lineValue).toFixed(2)}` : t.unitPrice != null ? `@ US$${Number(t.unitPrice).toFixed(2)}` : '—'}</TableCell>
                      <TableCell>
                        <Chip size="small" label={t.isCompleted ? 'Done' : 'Pending'}
                          sx={{ bgcolor: t.isCompleted ? '#2e7d3218' : '#ff8a0018', color: t.isCompleted ? '#2e7d32' : '#ff8a00', fontWeight: 800, fontSize: 11 }} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
           </Box>
         )}

        <Box className="ef-no-print" sx={{ display: 'flex', justifyContent: 'space-between', mt: 2, pt: 1.5, borderTop: '1px solid #eef0f4' }}>
          <Typography variant="caption" sx={{ color: '#9ca3af' }}>
            Generated {new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
          </Typography>
          <Typography variant="caption" sx={{ color: '#9ca3af' }}>Extreme Fire Design Inc</Typography>
        </Box>
        {canAssign && (
          <Box className="ef-no-print" sx={{ mt: 2, pt: 1.5, borderTop: '1px solid #eef0f4' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#0f0f13', mb: 1 }}>
              Assign technician — currently {job.technicianName ?? 'Unassigned'}
            </Typography>

            <Box sx={{ mb: 1.5 }}>
              <Typography variant="caption" sx={{ color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Required skills for this job
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.5, alignItems: 'center' }}>
                {splitCsv(job.requiredSkills).length === 0 && splitCsv(job.requiredCertifications).length === 0 ? (
                  <Typography variant="caption" sx={{ color: '#9ca3af' }}>None set — add skills so auto-assign can match technicians.</Typography>
                ) : (
                  <>
                    {splitCsv(job.requiredSkills).map((s) => (
                      <Chip key={`s-${s}`} size="small" label={s} sx={{ bgcolor: '#FF3D0014', color: '#FF3D00', fontWeight: 700, fontSize: 11 }} />
                    ))}
                    {splitCsv(job.requiredCertifications).map((s) => (
                      <Chip key={`c-${s}`} size="small" label={`${s} (cert)`} sx={{ bgcolor: '#0288d114', color: '#0288d1', fontWeight: 700, fontSize: 11 }} />
                    ))}
                  </>
                )}
                <Button size="small" onClick={() => setSkillsOpen((v) => !v)} sx={{ borderRadius: 2, fontSize: 12, color: '#6b7280', textTransform: 'none' }}>
                  {skillsOpen ? 'Hide' : 'Edit required skills'}
                </Button>
              </Box>
              {skillsOpen && (
                <Box sx={{ mt: 1, display: 'grid', gap: 1, border: '1px solid #eef0f4', borderRadius: 2, p: 1.5, bgcolor: '#fafbfc' }}>
                  <TextField label="Required skills (comma-separated)" size="small" fullWidth
                    placeholder="e.g. Extinguisher, Detection"
                    value={reqSkills} onChange={(e) => setReqSkills(e.target.value)} />
                  <TextField label="Required certifications (comma-separated)" size="small" fullWidth
                    placeholder="e.g. FPA Zimbabwe"
                    value={reqCerts} onChange={(e) => setReqCerts(e.target.value)} />
                  {skillsMsg && (
                    <Typography variant="caption" sx={{ fontWeight: 700, color: skillsMsg.startsWith('Saved') ? '#2e7d32' : '#d32f2f' }}>{skillsMsg}</Typography>
                  )}
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button size="small" variant="contained" disabled={skillsBusy || !onEditSkills}
                      onClick={async () => {
                        if (!onEditSkills) return
                        setSkillsBusy(true); setSkillsMsg('')
                        try {
                          await onEditSkills(job, reqSkills.trim(), reqCerts.trim())
                          setSkillsMsg('Saved — required skills updated.')
                        } catch { setSkillsMsg('Could not save skills.') }
                        setSkillsBusy(false)
                      }}
                      sx={{ borderRadius: 2, bgcolor: '#FF3D00', '&:hover': { bgcolor: '#C42A00' } }}>
                      {skillsBusy ? 'Saving…' : 'Save skills'}
                    </Button>
                    <Button size="small" onClick={() => setSkillsOpen(false)} sx={{ color: '#6b7280' }}>Cancel</Button>
                  </Box>
                </Box>
              )}
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 1.5 }}>
              <FormControl size="small" fullWidth>
                <InputLabel>Pick technician</InputLabel>
                <Select label="Pick technician" value={assignId} onChange={(e) => { setAssignId(e.target.value as string); setAssignName('') }}>
                  <MenuItem value=""><em>— Select —</em></MenuItem>
                  {techs.map((t) => {
                    const sm = skillMatch(job.requiredSkills, t.skills)
                    const cm = certMatch(job.requiredCertifications, t.certifications)
                    const label = splitCsv(job.requiredSkills).length === 0
                      ? t.name
                      : `${t.name} · skills ${sm.pct}%${splitCsv(job.requiredCertifications).length ? ` · cert ${cm.pct}%` : ''}`
                    return <MenuItem key={t.id} value={String(t.id)}>{label} (ID {t.id})</MenuItem>
                  })}
                </Select>
              </FormControl>
              <TextField label="or Technician ID" size="small" value={assignId} onChange={(e) => { setAssignId(e.target.value); setAssignName('') }} placeholder="e.g. 3" />
              <TextField label="or Technician name" size="small" value={assignName} onChange={(e) => { setAssignName(e.target.value); setAssignId('') }} placeholder="e.g. Tendai Moyo" />
            </Box>

            {pickedTech && (
              <Box sx={{ mt: 1.5, border: '1px solid #eef0f4', borderRadius: 2, p: 1.5, bgcolor: '#fafbfc' }}>
                <Typography variant="caption" sx={{ color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Skill check — {pickedTech.name}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.75, alignItems: 'center' }}>
                  <Chip size="small"
                    label={`Skills ${skillInfo.pct}%`}
                    sx={{
                      fontWeight: 800, fontSize: 11,
                      bgcolor: skillInfo.pct === 100 ? '#2e7d3218' : skillInfo.pct >= 50 ? '#ff8a0018' : '#d32f2f18',
                      color: skillInfo.pct === 100 ? '#2e7d32' : skillInfo.pct >= 50 ? '#ff8a00' : '#d32f2f',
                    }} />
                  {splitCsv(job.requiredCertifications).length > 0 && (
                    <Chip size="small"
                      label={`Certs ${certInfo.pct}%`}
                      sx={{
                        fontWeight: 800, fontSize: 11,
                        bgcolor: certInfo.pct === 100 ? '#2e7d3218' : certInfo.pct >= 50 ? '#ff8a0018' : '#d32f2f18',
                        color: certInfo.pct === 100 ? '#2e7d32' : certInfo.pct >= 50 ? '#ff8a00' : '#d32f2f',
                      }} />
                  )}
                  {skillInfo.missing.map((s) => (
                    <Chip key={`miss-${s}`} size="small" label={`Missing: ${s}`} variant="outlined"
                      sx={{ borderColor: '#d32f2f55', color: '#d32f2f', fontWeight: 700, fontSize: 11 }} />
                  ))}
                  {skillInfo.missing.length === 0 && skillInfo.required.length > 0 && (
                    <Chip size="small" label="All required skills covered" sx={{ bgcolor: '#2e7d3218', color: '#2e7d32', fontWeight: 700, fontSize: 11 }} />
                  )}
                  <Typography variant="caption" sx={{ color: '#9ca3af', ml: 0.5 }}>
                    has: {pickedTech.skills || '—'}
                  </Typography>
                </Box>
              </Box>
            )}

            <Button
              variant="contained"
              size="small"
              disabled={assigning || (!assignId.trim() && !assignName.trim())}
              onClick={async () => { setAssigning(true); try { await onAssign(job.id, assignId.trim(), assignName.trim()) } finally { setAssigning(false) } }}
              sx={{ mt: 1.5, borderRadius: 2, bgcolor: '#FF3D00', '&:hover': { bgcolor: '#C42A00' } }}
            >
              {assigning ? 'Assigning…' : 'Assign to this job'}
            </Button>
          </Box>
        )}
      </DialogContent>
      <DialogActions className="ef-no-print" sx={{ px: 3, pb: 2, bgcolor: '#fafafc', flexWrap: 'wrap', gap: 1 }}>
        {canEdit && (
          <Button variant="outlined" onClick={() => onEdit(job)} sx={{ borderRadius: 2, color: '#0f0f13', borderColor: '#e5e7eb' }}>
            Edit job card
          </Button>
        )}
        {isAdmin && (
          <Button variant="outlined" color="error" onClick={() => onDelete(job)} sx={{ borderRadius: 2 }}>
            Delete (admin)
          </Button>
        )}
        <Button variant="outlined" startIcon={<DownloadIcon />} onClick={savePdf} sx={{ borderRadius: 2, color: '#0f0f13', borderColor: '#e5e7eb' }}>
          Download PDF
        </Button>
        <Button variant="outlined" startIcon={<DownloadIcon />} onClick={saveDoc} sx={{ borderRadius: 2, color: '#0f0f13', borderColor: '#e5e7eb' }}>
          Download DOC
        </Button>
        <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()} sx={{ borderRadius: 2, bgcolor: '#FF3D00', '&:hover': { bgcolor: '#C42A00' } }}>
          Print / Save as PDF
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, py: 0.35 }}>
      <Typography variant="caption" sx={{ color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', width: { xs: 'auto', sm: 150 }, flexShrink: 0 }}>{k}</Typography>
      <Typography variant="body2" sx={{ color: '#0f0f13', fontWeight: 600, wordBreak: 'break-word' }}>{v}</Typography>
    </Box>
  )
}

interface TaskDraft {
  key: string
  taskType: string
  equipmentIds: number[]
  inventoryItemId: string
  storeItemId: string
  quantity: string
  agentType: string
  unitType: string
  customAgentType: string
  customUnitType: string
  unitPrice: string
  isCompleted: boolean
  notes: string
}

const taskQtyLabel = (type: string) =>
  type === 'Service' ? 'To service'
    : type === 'Refill' ? 'To refill'
      : type === 'Inspection' ? 'To inspect'
        : type === 'Assessment' ? 'To assess'
        : type === 'Maintenance' ? 'To maintain'
          : type === 'Installation' ? 'To install'
            : 'Qty'

const emptyTask = (taskType: string): TaskDraft => ({
  key: newTaskKey(), taskType, equipmentIds: [], inventoryItemId: '',
  storeItemId: '',
  quantity: '1', agentType: '', unitType: '', customAgentType: '', customUnitType: '', unitPrice: '', isCompleted: false, notes: '',
})

let taskKeySeq = 0
const newTaskKey = () => `t${++taskKeySeq}`

const draftFromJobTask = (t: JobTask): TaskDraft => ({
  key: newTaskKey(),
  taskType: t.taskType,
  equipmentIds: t.equipmentIdList ?? splitCsv(t.equipmentIds).map(Number).filter((n) => !Number.isNaN(n)),
  inventoryItemId: t.inventoryItemId != null ? String(t.inventoryItemId) : '',
  storeItemId: t.storeItemId != null ? String(t.storeItemId) : '',
  quantity: t.quantity != null ? String(t.quantity) : '1',
  agentType: EXTINGUISHER_AGENT_TYPES.includes((agentFromUnitType(t.agentType, t.unitType) || 'Other') as any) ? agentFromUnitType(t.agentType, t.unitType) || 'Other' : 'Other',
  unitType: EXTINGUISHER_UNIT_TYPES.includes((t.unitType || matchExtinguisherUnit(t.agentType)) as any) ? t.unitType || matchExtinguisherUnit(t.agentType) : 'Other / custom unit',
  customAgentType: EXTINGUISHER_AGENT_TYPES.includes((agentFromUnitType(t.agentType, t.unitType) || 'Other') as any) ? '' : t.agentType ?? '',
  customUnitType: EXTINGUISHER_UNIT_TYPES.includes((t.unitType || matchExtinguisherUnit(t.agentType)) as any) ? '' : t.unitType || t.agentType || '',
  unitPrice: t.unitPrice != null ? String(t.unitPrice) : '',
  isCompleted: !!t.isCompleted,
  notes: t.notes ?? '',
})

const draftToPayload = (d: TaskDraft) => {
  const unitType = d.unitType === 'Other / custom unit' ? d.customUnitType.trim() : d.unitType
  const agentType = d.agentType === 'Other' ? d.customAgentType.trim() : d.agentType
  const m = unitType.match(/(\d+(?:\.\d+)?)\s*(kg|l|litre)/i)
  const isSupply = d.taskType === 'Supply'
  const isStoreSupply = d.taskType === 'Store supply'
  return {
    taskType: d.taskType,
    equipmentIds: !isSupply && !isStoreSupply && d.equipmentIds.length ? d.equipmentIds.join(',') : null,
    inventoryItemId: isSupply && d.inventoryItemId ? Number(d.inventoryItemId) : null,
    storeItemId: isStoreSupply && d.storeItemId ? Number(d.storeItemId) : null,
    quantity: d.quantity ? Number(d.quantity) : 1,
    agentType: agentType || null,
    unitType: unitType || null,
    agentAmountKg: m ? Number(m[1]) : null,
    unitPrice: (isSupply || isStoreSupply) && d.unitPrice ? Number(d.unitPrice) : null,
    isCompleted: d.isCompleted,
    notes: d.notes.trim() || null,
  }
}

function TaskEditor({ tasks, setTasks, equipList, inventory, storeItems, customerId, locked }: {
  tasks: TaskDraft[]
  setTasks: Dispatch<SetStateAction<TaskDraft[]>>
  equipList: OperationEquipment[]
  inventory: InventoryRow[]
  storeItems: { id: number; name: string; category: string; unit: string; currentStock: number; unitCost: number }[]
  customerId: number | null
  locked?: boolean
}) {
  const role = (localStorage.getItem('efesms_role') ?? '').toLowerCase()
  const dept = (localStorage.getItem('efesms_dept') ?? '').toLowerCase()
  const canIssueFromStores = ['admin', 'administrator', 'management', 'stores man'].includes(role)
    || ['administration', 'management', 'stores'].includes(dept)
  const availableTaskTypes = JOB_TASK_TYPES.filter((type) => type !== 'Store supply' || canIssueFromStores)
  const units = customerId != null ? equipList.filter((e) => e.customerId === customerId) : equipList
  const [newTaskType, setNewTaskType] = useState<string>('Service')
  const patch = (key: string, p: Partial<TaskDraft>) => setTasks((prev) => prev.map((t) => (t.key === key ? { ...t, ...p } : t)))
  const remove = (key: string) => setTasks((prev) => prev.filter((t) => t.key !== key))
  const add = () => setTasks((prev) => [...prev, emptyTask(newTaskType)])

  const changeType = (key: string, type: string) => setTasks((prev) => prev.map((task) => {
    if (task.key !== key) return task
    const stockLine = type === 'Supply' || type === 'Store supply'
    return stockLine
      ? { ...task, taskType: type, equipmentIds: [], inventoryItemId: '', storeItemId: '', unitPrice: '', agentType: '', unitType: '', customAgentType: '', customUnitType: '' }
      : { ...task, taskType: type, inventoryItemId: '', storeItemId: '', unitPrice: '', agentType: task.taskType === 'Supply' || task.taskType === 'Store supply' ? '' : task.agentType, unitType: task.taskType === 'Supply' || task.taskType === 'Store supply' ? '' : task.unitType, customAgentType: task.taskType === 'Supply' || task.taskType === 'Store supply' ? '' : task.customAgentType, customUnitType: task.taskType === 'Supply' || task.taskType === 'Store supply' ? '' : task.customUnitType }
  }))

  const pickItem = (key: string, id: string) => {
    const item = inventory.find((i) => String(i.id) === id)
    const agent = inferExtinguisherAgent(item?.name)
    const unit = matchExtinguisherUnit(item?.name)
    patch(key, {
      inventoryItemId: id,
      agentType: agent || 'Other',
      unitType: unit || 'Other / custom unit',
      customAgentType: agent ? '' : item?.category ?? '',
      customUnitType: unit ? '' : item?.name ?? '',
      unitPrice: item ? String(item.unitCost ?? '') : '',
    })
  }

  const unitTotal = tasks.reduce((sum, task) => sum + (Number(task.quantity) || 0), 0)

  return (
    <Box sx={{ border: '1px solid #2a2a33', borderRadius: 2.5, p: { xs: 1.25, sm: 2 }, bgcolor: '#0b0b10' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25 }}>
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 850, color: '#f2f2f7' }}>Work items</Typography>
            <Typography variant="caption" sx={{ color: '#9aa0b0' }}>Agent is the filling (DCP, CO₂, water, foam). Unit type is the extinguisher size/model (for example, 2.5kg DCP).</Typography>
        </Box>
        <Chip size="small" label={`${tasks.length} actions · ${unitTotal} units`} sx={{ bgcolor: '#FF3D0018', color: '#ff8a65', fontWeight: 800 }} />
      </Box>

      {!locked && (
        <Box sx={{ display: 'flex', gap: 1, mb: tasks.length ? 1.25 : 0, alignItems: 'center' }}>
          <FormControl size="small" sx={{ ...darkFormControlSx, flexGrow: 1 }}>
            <InputLabel>Add action</InputLabel>
            <Select label="Add action" value={newTaskType} onChange={(e) => setNewTaskType(e.target.value)} sx={darkSelectSx}>
              {availableTaskTypes.map((type) => <MenuItem key={type} value={type}>{type}</MenuItem>)}
            </Select>
          </FormControl>
          <Button variant="contained" startIcon={<AddIcon />} onClick={add}
            sx={{ minHeight: 40, borderRadius: 2, bgcolor: '#FF3D00', '&:hover': { bgcolor: '#C42A00' } }}>
            Add line
          </Button>
        </Box>
      )}

      {tasks.length === 0 ? (
        <Box sx={{ border: '1px dashed #3b3c49', borderRadius: 2, px: 1.5, py: 2, textAlign: 'center' }}>
          <Typography variant="body2" sx={{ color: '#c9cdd8', fontWeight: 700 }}>No work items added yet</Typography>
          <Typography variant="caption" sx={{ color: '#8d93a3' }}>Choose an action above, then add its units, quantity, and notes.</Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gap: 1 }}>
          {tasks.map((t, i) => {
            const item = inventory.find((x) => String(x.id) === t.inventoryItemId)
            const isSupply = t.taskType === 'Supply'
            const isStoreSupply = t.taskType === 'Store supply'
            const isAssessment = t.taskType === 'Assessment'
            const selectedUnits = t.equipmentIds.map((id) => units.find((unit) => unit.id === id)).filter(Boolean)
            const inferredAgents = selectedUnits.map((unit) => inferExtinguisherAgent(unit?.agentType || unit?.name))
            const inferredUnitTypes = selectedUnits.map((unit) => matchExtinguisherUnit(unit?.agentType) || matchExtinguisherUnit(unit?.name))
            const registeredDetailsComplete = t.equipmentIds.length > 0 && inferredAgents.every(Boolean) && inferredUnitTypes.every(Boolean)
            const displayAgent = t.agentType === 'Other' ? t.customAgentType : t.agentType
            const displayUnit = t.unitType === 'Other / custom unit' ? t.customUnitType : t.unitType
            return (
              <Box key={t.key} sx={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 2, p: { xs: 1, sm: 1.25 }, bgcolor: '#111118' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Chip size="small" label={`Line ${i + 1}`} sx={{ bgcolor: '#FF3D0020', color: '#ff8a65', fontWeight: 800 }} />
                  <Typography variant="body2" sx={{ color: '#f2f2f7', fontWeight: 750, flexGrow: 1 }}>
                    {t.taskType} · {[displayAgent, displayUnit].filter(Boolean).join(' / ') || 'Type not set'} · {t.equipmentIds.length ? `${t.equipmentIds.length} selected` : `${Number(t.quantity) || 0} units`}
                  </Typography>
                  <Chip size="small" label={t.isCompleted ? 'Complete' : 'Planned'} color={t.isCompleted ? 'success' : 'default'} variant="outlined" />
                  {!locked && <IconButton size="small" aria-label={`Remove line ${i + 1}`} onClick={() => remove(t.key)} sx={{ color: '#ff8a65' }}><CloseIcon fontSize="small" /></IconButton>}
                </Box>

                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(100px,.8fr) minmax(150px,1.2fr) minmax(70px,.6fr) minmax(110px,.9fr) minmax(140px,1.1fr)' }, gap: 1 }}>
                  <FormControl size="small" fullWidth sx={darkFormControlSx}>
                    <InputLabel>Action</InputLabel>
                    <Select label="Action" value={t.taskType} disabled={locked} onChange={(e) => changeType(t.key, e.target.value)} sx={darkSelectSx}>
                      {availableTaskTypes.map((type) => <MenuItem key={type} value={type}>{type}</MenuItem>)}
                    </Select>
                  </FormControl>

                  {isSupply ? (
                    <FormControl size="small" fullWidth sx={darkFormControlSx}>
                      <InputLabel>Stock item</InputLabel>
                      <Select label="Stock item" value={t.inventoryItemId} disabled={locked} onChange={(e) => pickItem(t.key, e.target.value as string)} sx={darkSelectSx}>
                        <MenuItem value=""><em>Choose stock item</em></MenuItem>
                        {inventory.map((stock) => <MenuItem key={stock.id} value={String(stock.id)}>{stock.name} · {stock.currentStock} in stock</MenuItem>)}
                      </Select>
                    </FormControl>
                  ) : isStoreSupply ? (
                    <FormControl size="small" fullWidth sx={darkFormControlSx}>
                      <InputLabel>Stores item</InputLabel>
                      <Select label="Stores item" value={t.storeItemId} disabled={locked} onChange={(e) => {
                        const id = e.target.value as string
                        const selected = storeItems.find((candidate) => String(candidate.id) === id)
                        patch(t.key, { storeItemId: id, unitPrice: selected ? String(selected.unitCost ?? 0) : '' })
                      }} sx={darkSelectSx}>
                        <MenuItem value=""><em>Choose installation material</em></MenuItem>
                        {storeItems.map((stock) => <MenuItem key={stock.id} value={String(stock.id)}>{stock.name} · {stock.currentStock} {stock.unit} in Stores</MenuItem>)}
                      </Select>
                    </FormControl>
                  ) : (
                    <FormControl size="small" fullWidth sx={darkFormControlSx}>
                      <InputLabel>Customer equipment</InputLabel>
                      <Select multiple label="Customer equipment"
                        value={t.equipmentIds.map(String)}
                        disabled={locked || customerId == null}
                        onChange={(e) => {
                          const raw = e.target.value
                          const values = (typeof raw === 'string' ? raw.split(',') : raw) as string[]
                          const ids = values.map(Number).filter((id) => Number.isInteger(id) && id > 0)
                          // Use an inferred agent only when every selected unit agrees;
                          // the API then records mixed-agent refills per actual asset.
                          const selectedUnits = ids.map((id) => units.find((unit) => unit.id === id)).filter(Boolean)
                          const selectedAgents = [...new Set(selectedUnits.map((unit) => inferExtinguisherAgent(unit?.agentType || unit?.name)).filter(Boolean))]
                          const selectedTypes = [...new Set(selectedUnits.map((unit) => matchExtinguisherUnit(unit?.agentType) || matchExtinguisherUnit(unit?.name)).filter(Boolean))]
                          const completeAgent = selectedAgents.length === 1 ? selectedAgents[0] : selectedAgents.length > 1 ? 'Mixed' : ''
                          const completeUnit = selectedTypes.length === 1 ? selectedTypes[0] : selectedTypes.length > 1 ? 'Mixed' : ''
                          patch(t.key, {
                            equipmentIds: ids,
                            quantity: ids.length ? String(ids.length) : t.quantity,
                            agentType: completeAgent === 'Mixed' ? '' : completeAgent || (ids.length ? 'Other' : t.agentType),
                            unitType: completeUnit === 'Mixed' ? '' : completeUnit || (ids.length ? 'Other / custom unit' : t.unitType),
                            customAgentType: completeAgent === 'Mixed' || !completeAgent ? '' : t.customAgentType,
                            customUnitType: completeUnit === 'Mixed' || !completeUnit ? '' : t.customUnitType,
                          })
                        }}
                        renderValue={(selected) => {
                          const values = selected as string[]
                          if (!values.length) return <em style={{ color: '#9aa0b0' }}>Choose tracked units, or leave blank for a bulk quantity</em>
                          return values.map((value) => {
                            const unit = units.find((candidate) => String(candidate.id) === value)
                            return unit ? `${unit.equipmentNumber} · ${unit.name}` : value
                          }).join(', ')
                        }}
                        sx={darkSelectSx}>
                        {units.map((unit) => <MenuItem key={unit.id} value={String(unit.id)}>{unit.equipmentNumber} · {unit.name}{unit.agentType ? ` (${unit.agentType})` : ' (type not recorded)'}</MenuItem>)}
                      </Select>
                    </FormControl>
                  )}

                  <TextField size="small" type="number" label={taskQtyLabel(t.taskType)} value={t.quantity}
                    disabled={locked || t.equipmentIds.length > 0}
                    slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 1, max: 1000 } }} fullWidth
                    helperText={t.equipmentIds.length ? 'Matches selected units' : undefined}
                    onChange={(e) => patch(t.key, { quantity: e.target.value })} sx={darkFieldSx} />

                  {!isAssessment && <><FormControl size="small" fullWidth sx={darkFormControlSx}>
                    <InputLabel>Agent type</InputLabel>
                    <Select label="Agent type" value={t.agentType} disabled={locked || registeredDetailsComplete} onChange={(e) => patch(t.key, { agentType: e.target.value, customAgentType: e.target.value === 'Other' ? t.customAgentType : '' })} sx={darkSelectSx}>
                      <MenuItem value=""><em>Choose agent</em></MenuItem>
                      {EXTINGUISHER_AGENT_TYPES.map((agent) => <MenuItem key={agent} value={agent}>{agent}</MenuItem>)}
                    </Select>
                    <FormHelperText sx={{ color: '#9aa0b0' }}>{registeredDetailsComplete ? new Set(inferredAgents).size > 1 ? 'Mixed agents are retained per selected unit' : 'Read from selected units' : 'Filling inside: DCP, CO₂, water, foam'}</FormHelperText>
                  </FormControl>

                  <FormControl size="small" fullWidth sx={darkFormControlSx}>
                    <InputLabel>Unit type</InputLabel>
                    <Select label="Unit type" value={t.unitType} disabled={locked || registeredDetailsComplete} onChange={(e) => {
                      const unitType = e.target.value
                      const inferred = inferExtinguisherAgent(unitType)
                      patch(t.key, { unitType, customUnitType: unitType === 'Other / custom unit' ? t.customUnitType : '', agentType: inferred || t.agentType })
                    }} sx={darkSelectSx}>
                      <MenuItem value=""><em>Choose unit size / model</em></MenuItem>
                      {EXTINGUISHER_UNIT_TYPES.map((unit) => <MenuItem key={unit} value={unit}>{unit}</MenuItem>)}
                    </Select>
                    <FormHelperText sx={{ color: '#9aa0b0' }}>{registeredDetailsComplete ? new Set(inferredUnitTypes).size > 1 ? 'Mixed unit types are retained per selected unit' : 'Read from selected units' : 'Capacity and model, e.g. 2.5kg DCP'}</FormHelperText>
                  </FormControl>

                  {t.agentType === 'Other' && <TextField size="small" label="Specify agent" value={t.customAgentType} disabled={locked} onChange={(e) => patch(t.key, { customAgentType: e.target.value })} sx={darkFieldSx} />}
                  {t.unitType === 'Other / custom unit' && <TextField size="small" label="Specify unit type" value={t.customUnitType} disabled={locked} onChange={(e) => patch(t.key, { customUnitType: e.target.value })} sx={darkFieldSx} />}</>}

                  {(isSupply || isStoreSupply) && (
                    <TextField size="small" type="number" label="Unit price (US$)" value={t.unitPrice} disabled={locked}
                      slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 0 } }} fullWidth
                      onChange={(e) => patch(t.key, { unitPrice: e.target.value })} sx={darkFieldSx} />
                  )}
                </Box>

                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'auto minmax(180px,1fr)' }, gap: 1, alignItems: 'center', mt: 1 }}>
                  <FormControl size="small" sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 0.5 }}>
                    <Switch size="small" checked={t.isCompleted} disabled={locked} onChange={(e) => patch(t.key, { isCompleted: e.target.checked })} />
                    <Typography variant="body2" sx={{ color: '#c9cdd8', fontWeight: 650 }}>Work completed</Typography>
                  </FormControl>
                  <TextField size="small" label="Work notes" placeholder={item ? `Details for ${item.name}` : 'Optional details for this action'} value={t.notes} disabled={locked} fullWidth
                    onChange={(e) => patch(t.key, { notes: e.target.value })} sx={darkFieldSx} />
                </Box>
              </Box>
            )
          })}
        </Box>
      )}
    </Box>
  )
}

function JobFormDialog({
  open, mode, form, setForm, customerMatch, setCustomerMatch, tasks, setTasks,
  equipList, inventory, storeItems, siteList, techs, saving, err, isMobile, onClose, onSubmit, clearErr,
}: {
  open: boolean
  mode: 'create' | 'edit'
  form: JobFormState
  setForm: Dispatch<SetStateAction<JobFormState>>
  customerMatch: CustomerMatch | null
  setCustomerMatch: Dispatch<SetStateAction<CustomerMatch | null>>
  tasks: TaskDraft[]
  setTasks: Dispatch<SetStateAction<TaskDraft[]>>
  equipList: OperationEquipment[]
  inventory: InventoryRow[]
  storeItems: { id: number; name: string; category: string; unit: string; currentStock: number; unitCost: number }[]
  siteList: any[]
  techs: Technician[]
  saving: boolean
  err: string
  isMobile: boolean
  onClose: () => void
  onSubmit: () => void
  clearErr: () => void
}) {
  const isEdit = mode === 'edit'
  const linkedCustomerId = isEdit ? form.customerId : customerMatch?.id ?? null
  const customerSites = linkedCustomerId == null ? [] : siteList.filter((site) => Number(site.customerId) === linkedCustomerId)
  const locked = isEdit && ['Completed', 'Closed'].includes(form.status)
  const set = (p: Partial<JobFormState>) => setForm((f) => ({ ...f, ...p }))
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" fullScreen={isMobile}>
      <DialogTitle sx={{ fontWeight: 850, pb: 0.5 }}>{isEdit ? 'Edit job card' : 'Create job card'}</DialogTitle>
      <DialogContent sx={{ pt: 1.5 }}>
        {err && <Alert severity="error" sx={{ mb: 1.5 }} onClose={clearErr}>{err}</Alert>}

        <Box sx={{ display: 'grid', gap: 1.5 }}>
          <Box sx={{ display: 'grid', gap: 1 }}>
            <Typography variant="overline" sx={{ color: '#FF8A65', fontWeight: 850, letterSpacing: '.08em' }}>Customer and job</Typography>
            {!isEdit && <CustomerIdField value={form.customerNumber} match={customerMatch} onChange={(value) => {
              if (customerMatch && value !== customerMatch.customerId) {
                // Clear tracked units when the selected customer changes, so saved work cannot point at another customer's assets.
                setTasks((prev) => prev.map((task) => ({ ...task, equipmentIds: [], agentType: task.taskType === 'Supply' ? task.agentType : '' })))
                set({ siteId: '' })
              }
              set({ customerNumber: value })
            }} onMatch={setCustomerMatch} sx={darkFieldSx} />}
            {!isEdit && customerMatch && (
              <Paper variant="outlined" sx={{ px: 1.25, py: 1, borderRadius: 2, bgcolor: '#15151e', borderColor: '#42A5F555' }}>
                <Typography variant="body2" sx={{ color: '#f2f2f7', fontWeight: 800 }}>{customerMatch.customerId} · {customerMatch.name}</Typography>
                <Typography variant="caption" sx={{ color: '#b0b4c1' }}>
                  {[customerMatch.phone, customerMatch.whatsApp && `WhatsApp ${customerMatch.whatsApp}`, customerMatch.email, customerMatch.address].filter(Boolean).join(' · ') || 'Contact details linked from customer register'}
                </Typography>
              </Paper>
            )}
            {isEdit && <Chip size="small" label={`${form.customerNumber || 'Linked customer'} · contact details stay linked to this customer`} sx={{ width: 'fit-content', bgcolor: '#42A5F51a', color: '#90caf9', fontWeight: 800 }} />}

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0,2fr) repeat(2,minmax(130px,1fr))' }, gap: 1 }}>
              <TextField label="Job title *" fullWidth value={form.title} onChange={(e) => set({ title: e.target.value })} size="small" sx={darkFieldSx} />
              <FormControl size="small" fullWidth sx={darkFormControlSx}>
                <InputLabel>Job category</InputLabel>
                <Select label="Job category" value={form.jobType} onChange={(e) => set({ jobType: e.target.value })} sx={darkSelectSx}>
                  {JOB_TYPES.map((type) => <MenuItem key={type} value={type}>{type}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small" fullWidth sx={darkFormControlSx}>
                <InputLabel>Priority</InputLabel>
                <Select label="Priority" value={form.priority} onChange={(e) => set({ priority: e.target.value })} sx={darkSelectSx}>
                  {PRIORITIES.map((priority) => <MenuItem key={priority} value={priority}>{priority}</MenuItem>)}
                </Select>
              </FormControl>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0,1.5fr) minmax(160px,1fr)' }, gap: 1 }}>
              <FormControl size="small" fullWidth sx={darkFormControlSx}>
                <InputLabel>Customer site</InputLabel>
                <Select label="Customer site" value={form.siteId} onChange={(e) => set({ siteId: e.target.value as string })} sx={darkSelectSx}>
                  <MenuItem value=""><em>No specific site</em></MenuItem>
                  {customerSites.map((site) => <MenuItem key={site.id} value={String(site.id)}>{site.name}{site.address ? ` · ${site.address}` : ''}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField label="Planned start" type="date" size="small" fullWidth slotProps={{ inputLabel: { shrink: true } }} value={form.plannedStart} onChange={(e) => {
                const plannedStart = e.target.value
                set({ plannedStart, nextServiceDate: addMonthsToInputDate(plannedStart || todayInputDate()) })
              }} sx={darkFieldSx} />
            </Box>
            <TextField label="Next service date *" type="date" size="small" fullWidth required slotProps={{ inputLabel: { shrink: true } }} value={form.nextServiceDate} onChange={(e) => set({ nextServiceDate: e.target.value })} helperText="Required. The default service cycle is six months after the planned service date." sx={darkFieldSx} />
          </Box>

          <TaskEditor tasks={tasks} setTasks={setTasks} equipList={equipList} inventory={inventory} storeItems={storeItems} customerId={linkedCustomerId} locked={locked} />

          <Accordion disableGutters elevation={0} sx={{ border: '1px solid #2a2a33', borderRadius: '10px !important', bgcolor: '#111118', '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: '#b0b4c1' }} />} sx={{ minHeight: 44, '& .MuiAccordionSummary-content': { my: 1 } }}>
              <Typography variant="body2" sx={{ color: '#d8dae2', fontWeight: 750 }}>More job details <Typography component="span" variant="caption" sx={{ color: '#8d93a3', ml: 0.75 }}>optional</Typography></Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                {isEdit && (
                  <FormControl size="small" fullWidth sx={darkFormControlSx}>
                    <InputLabel>Status</InputLabel>
                    <Select label="Status" value={form.status} onChange={(e) => set({ status: e.target.value })} sx={darkSelectSx}>
                      {['Draft', 'Assigned', 'Scheduled', 'InProgress', 'Completed', 'Closed', 'Cancelled'].map((status) => <MenuItem key={status} value={status}>{status}</MenuItem>)}
                    </Select>
                  </FormControl>
                )}
                {isEdit && <TextField label="Planned end" type="date" size="small" fullWidth slotProps={{ inputLabel: { shrink: true } }} value={form.plannedEnd} onChange={(e) => set({ plannedEnd: e.target.value })} sx={darkFieldSx} />}
                <TextField label="Estimated hours" type="number" size="small" fullWidth value={form.estimatedHours} onChange={(e) => set({ estimatedHours: e.target.value })} sx={darkFieldSx} />
                {isEdit && <TextField label="Quoted amount (US$)" type="number" size="small" fullWidth value={form.quotedAmount} onChange={(e) => set({ quotedAmount: e.target.value })} sx={darkFieldSx} />}
                {!isEdit && (
                  <FormControl size="small" fullWidth sx={darkFormControlSx}>
                    <InputLabel>Technician</InputLabel>
                    <Select label="Technician" value={form.technicianId} onChange={(e) => set({ technicianId: e.target.value as string, technicianName: '' })} sx={darkSelectSx}>
                      <MenuItem value=""><em>Unassigned</em></MenuItem>
                      {techs.map((tech) => <MenuItem key={tech.id} value={String(tech.id)}>{tech.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                )}
                <TextField label="Required skills" size="small" fullWidth placeholder="e.g. Extinguisher, Detection" value={form.requiredSkills} onChange={(e) => set({ requiredSkills: e.target.value })} sx={darkFieldSx} />
                <TextField label="Required certifications" size="small" fullWidth placeholder="e.g. FPA Zimbabwe" value={form.requiredCertifications} onChange={(e) => set({ requiredCertifications: e.target.value })} sx={darkFieldSx} />
                {isEdit && <TextField label="Address" size="small" fullWidth value={form.address} onChange={(e) => set({ address: e.target.value })} sx={darkFieldSx} />}
                {isEdit && <TextField label="Email" size="small" type="email" fullWidth value={form.email} onChange={(e) => set({ email: e.target.value })} sx={darkFieldSx} />}
                {isEdit && tasks.length === 0 && (
                  <>
                    <FormControl size="small" fullWidth sx={darkFormControlSx}>
                      <InputLabel>Legacy equipment</InputLabel>
                      <Select label="Legacy equipment" value={form.equipmentId} onChange={(e) => set({ equipmentId: e.target.value as string })} sx={darkSelectSx}>
                        <MenuItem value=""><em>No specific unit</em></MenuItem>
                        {equipList.filter((unit) => unit.customerId === linkedCustomerId).map((unit) => <MenuItem key={unit.id} value={String(unit.id)}>{unit.equipmentNumber} · {unit.name}</MenuItem>)}
                      </Select>
                    </FormControl>
                    <TextField label="Legacy unit count" type="number" size="small" fullWidth value={form.unitCount} onChange={(e) => set({ unitCount: e.target.value })} sx={darkFieldSx} />
                  </>
                )}
                {isEdit && tasks.length === 0 && <TextField label="Legacy agent type" size="small" fullWidth value={form.agentType} onChange={(e) => set({ agentType: e.target.value })} sx={darkFieldSx} />}
                <TextField label="Job notes" multiline minRows={2} size="small" fullWidth value={form.notes} onChange={(e) => set({ notes: e.target.value })} sx={{ ...darkFieldSx, gridColumn: { sm: '1 / -1' } }} />
                <FormControl size="small" sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 0.5 }}>
                  <Switch checked={form.worksDoneSatisfactorily} onChange={(e) => set({ worksDoneSatisfactorily: e.target.checked })} />
                  <Typography variant="body2" sx={{ color: '#c9cdd8', fontWeight: 650 }}>Works done satisfactorily</Typography>
                </FormControl>
              </Box>
              {splitCsv(form.requiredSkills).length > 0 && (
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
                  {splitCsv(form.requiredSkills).map((skill) => <Chip key={skill} size="small" label={skill} sx={{ bgcolor: '#FF3D0014', color: '#FF8A65', fontWeight: 700, fontSize: 11 }} />)}
                  {techs.map((tech) => {
                    const match = skillMatch(form.requiredSkills, tech.skills)
                    return match.pct > 0 ? <Chip key={`match-${tech.id}`} size="small" variant="outlined" label={`${tech.name}: ${match.pct}%`} sx={{ borderColor: match.pct === 100 ? '#2e7d3255' : '#ff8a0055', color: match.pct === 100 ? '#4ade80' : '#ffb74d', fontWeight: 700, fontSize: 11 }} /> : null
                  })}
                </Box>
              )}
            </AccordionDetails>
          </Accordion>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 1.5, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <Typography variant="caption" sx={{ color: '#9aa0b0', flexGrow: 1 }}>{tasks.length} work line{tasks.length === 1 ? '' : 's'} · each line records its own units and quantity</Typography>
        <Button onClick={onClose} sx={{ borderRadius: 2 }}>Cancel</Button>
        <Button variant="contained" disabled={saving || !form.title.trim() || !form.nextServiceDate || (!isEdit && (!customerMatch || tasks.length === 0))} onClick={onSubmit} sx={{ borderRadius: 2, bgcolor: '#FF3D00', '&:hover': { bgcolor: '#C42A00' } }}>
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create job'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default function JobsPage() {
  const isMobile = useMediaQuery('(max-width: 700px)')
  const [jobs, setJobs] = useState<OperationJob[]>([])
  const [techs, setTechs] = useState<Technician[]>([])
  const [equipList, setEquipList] = useState<OperationEquipment[]>([])
  const [siteList, setSiteList] = useState<any[]>([])
  const [assignments, setAssignments] = useState<Record<number, ScheduledAssignment>>({})
  const [ai, setAi] = useState<EngineOutput | null>(null)
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [active, setActive] = useState<OperationJob | null>(null)
   const [form, setForm] = useState<JobFormState>(blankJobForm())
   const [customerMatch, setCustomerMatch] = useState<CustomerMatch | null>(null)
   const [tasks, setTasks] = useState<TaskDraft[]>([])
   const [inventory, setInventory] = useState<InventoryRow[]>([])
  const [storeItems, setStoreItems] = useState<{ id: number; name: string; category: string; unit: string; currentStock: number; unitCost: number }[]>([])
  const [query, setQuery] = useState('')
  const [autoBusy, setAutoBusy] = useState(false)
  const printable = useTablePrint()

  const role = localStorage.getItem('efesms_role') ?? ''
  const dept = localStorage.getItem('efesms_dept') ?? ''
  const canWrite = ['admin', 'administrator', 'management', 'technician', 'contracts manager', 'stores man'].includes((role || '').toLowerCase()) ||
    ['technical', 'operations', 'administration', 'contracts', 'stores'].includes((dept || '').toLowerCase())
  const isAdmin = ['admin', 'administrator'].includes((role || '').toLowerCase())
  const [delJob, setDelJob] = useState<OperationJob | null>(null)
  const [delConfirm, setDelConfirm] = useState('')
  const [delBusy, setDelBusy] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [t, j, e, s, inv, stores] = await Promise.all([
        api.get<Technician[]>('/operations/technicians'),
        api.get<OperationJob[]>('/operations/jobs'),
        api.get<OperationEquipment[]>('/operations/equipment').catch(() => ({ data: [] as OperationEquipment[] })),
        api.get<any[]>('/sites').catch(() => ({ data: [] as any[] })),
        api.get<InventoryRow[]>('/operations/inventory').catch(() => ({ data: [] as InventoryRow[] })),
        api.get<{ id: number; name: string; category: string; unit: string; currentStock: number; unitCost: number }[]>('/operations/store-items').catch(() => ({ data: [] as any[] })),
      ])
      setTechs(t.data)
      setJobs(j.data)
      setEquipList(e.data ?? [])
      setSiteList(s.data ?? [])
      setInventory(inv.data ?? [])
      setStoreItems(stores.data ?? [])
    } catch (e) { setErr('Failed to load job cards') }
    try {
      const a = await api.post<EngineOutput>('/operations/analyze/full', {})
      setAi(a.data)
      const map: Record<number, ScheduledAssignment> = {}
      a.data.assignments.forEach((x) => { map[x.jobId] = x })
      setAssignments(map)
    } catch (e) { /* analysis optional */ }
    setLoading(false)
  }

   useEffect(() => { load() }, [])

   useEffect(() => {
     if (formMode === 'create' && customerMatch) {
       setForm(prev => ({
         ...prev,
         address: customerMatch.address ?? '',
         email: customerMatch.email ?? '',
         nextServiceDate: customerMatch.nextServiceDate ? new Date(customerMatch.nextServiceDate).toISOString().slice(0, 10) : addMonthsToInputDate(prev.plannedStart || todayInputDate()),
       }))
     }
   }, [customerMatch, formMode])

   const assign = async (jobId: number, technicianId: string, technicianName = '') => {     const techId = technicianId.trim() ? Number(technicianId.trim()) : null
     if ((techId == null || Number.isNaN(techId)) && !technicianName.trim()) {
       setErr('Pick a technician, or type a technician ID or name.')
       return
     }
     try {
       await api.post(`/operations/jobs/${jobId}/assign`, {
         technicianId: techId,
         technicianName: technicianName.trim() ? technicianName.trim() : null,
       })
       const j = await api.get<OperationJob[]>('/operations/jobs')
       setJobs(j.data)
       const fresh = j.data.find((x) => x.id === jobId)
       if (fresh) setActive(fresh)
       setOkMsg('Technician assigned.')
       setTimeout(() => setOkMsg(''), 4000)
     } catch (e: any) { setErr(apiErrorMessage(e, 'Assignment failed')) }
   }

   const saveJobSkills = async (job: OperationJob, requiredSkills: string, requiredCertifications: string) => {
     await api.put(`/operations/jobs/${job.id}`, {
       title: job.title,
       jobType: job.jobType,
       priority: job.priority,
       status: job.status,
       plannedStart: job.plannedStart ? new Date(job.plannedStart).toISOString() : null,
       plannedEnd: job.plannedEnd ? new Date(job.plannedEnd).toISOString() : null,
       estimatedHours: job.estimatedHours ?? null,
       quotedAmount: job.quotedAmount ?? null,
       address: job.address ?? null,
       email: job.email ?? null,
       nextServiceDate: job.nextServiceDate ? new Date(job.nextServiceDate).toISOString() : null,
       notes: job.notes ?? null,
       worksDoneSatisfactorily: job.worksDoneSatisfactorily ?? false,
       siteId: job.siteId ?? null,
       equipmentId: job.equipmentId ?? null,
       requiredSkills: requiredSkills || null,
       requiredCertifications: requiredCertifications || null,
     })
     const j = await api.get<OperationJob[]>('/operations/jobs')
     setJobs(j.data)
     const fresh = j.data.find((x) => x.id === job.id)
     if (fresh) setActive(fresh)
   }

   const autoAssign = async () => {
     setAutoBusy(true); setErr(''); setOkMsg('')
     try {
       const { data } = await api.post<{ algorithm: string; applied: number; assignments: unknown[] }>(
         '/operations/jobs/auto-assign', { onlyUnassigned: true })
       await load()
       setOkMsg(data.applied > 0
         ? `Auto-assigned ${data.applied} job(s) by skills using ${data.algorithm}.`
         : 'No unassigned jobs needed auto-assign (or no matching technicians).')
       setTimeout(() => setOkMsg(''), 6000)
     } catch (e: any) { setErr(apiErrorMessage(e, 'Auto-assign failed')) }
     setAutoBusy(false)
   }

  const toDateInput = (d?: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : '')

  const formFromJob = (j: OperationJob): JobFormState => ({
    id: j.id,
    customerId: j.customerId ?? null,
    title: j.title ?? '',
    jobType: j.jobType ?? 'Service',
    priority: j.priority ?? 'Normal',
    status: j.status ?? 'Draft',
    plannedStart: toDateInput(j.plannedStart),
    plannedEnd: toDateInput(j.plannedEnd),
    estimatedHours: j.estimatedHours != null ? String(j.estimatedHours) : '',
    quotedAmount: j.quotedAmount != null ? String(j.quotedAmount) : '',
    address: j.address ?? '',
    email: j.email ?? '',
    nextServiceDate: toDateInput(j.nextServiceDate) || addMonthsToInputDate(toDateInput(j.plannedStart) || todayInputDate()),
    notes: j.notes ?? '',
    worksDoneSatisfactorily: !!j.worksDoneSatisfactorily,
    siteId: j.siteId != null ? String(j.siteId) : '',
    equipmentId: j.equipmentId != null ? String(j.equipmentId) : '',
    agentType: (j as any).agentType ?? '',
    unitCount: (j as any).unitCount != null ? String((j as any).unitCount) : '1',
    requiredSkills: j.requiredSkills ?? '',
    requiredCertifications: j.requiredCertifications ?? '',
    customerNumber: j.customerNumber ?? '', technicianId: '', technicianName: '',
  })

  const closeForm = () => {
    setFormOpen(false)
    setCustomerMatch(null)
    setTasks([])
    setErr('')
  }

  const openCreate = () => {
    setActive(null)
    setForm(blankJobForm())
    setCustomerMatch(null)
    setTasks([])
    setErr('')
    setFormMode('create')
    setFormOpen(true)
  }

  const openEdit = (j: OperationJob) => {
    setActive(null)
    setForm(formFromJob(j))
    setCustomerMatch(null)
    setTasks((j.tasks ?? []).map(draftFromJobTask))
    setErr('')
    setFormMode('edit')
    setFormOpen(true)
  }

  const submit = async () => {
    const title = form.title.trim()
    if (!title) { setErr('Job title is required.'); return }
    if (!form.nextServiceDate) { setErr('Next service date is required.'); return }
    if (formMode === 'create') {
      if (!form.customerNumber.trim() || !customerMatch) {
        setErr('Select an existing customer ID before creating a job. Create a customer in Customers first if needed.')
        return
      }
      if (!tasks.length) {
        setErr('Add at least one work item so its action, equipment or agent type, quantity, and notes can be recorded on this job.')
        return
      }
      if (form.estimatedHours && (Number.isNaN(Number(form.estimatedHours)) || Number(form.estimatedHours) <= 0)) {
        setErr('Estimated hours must be greater than zero.')
        return
      }
    }
    const missingWorkType = tasks.find((task) => {
      const agent = (task.agentType === 'Other' ? task.customAgentType : task.agentType).trim()
      const unitType = (task.unitType === 'Other / custom unit' ? task.customUnitType : task.unitType).trim()
      const selectedUnits = task.equipmentIds.map((id) => equipList.find((unit) => unit.id === id))
      const registeredDetailsComplete = selectedUnits.length > 0 && selectedUnits.every((unit) =>
        !!inferExtinguisherAgent(unit?.agentType || unit?.name) && !!(matchExtinguisherUnit(unit?.agentType) || matchExtinguisherUnit(unit?.name)))
      return !registeredDetailsComplete && (!agent || !unitType)
    })
    if (missingWorkType) {
      setErr('Choose both Agent type and Unit type on each work line. Agent means the filling (DCP, CO₂, water, foam); Unit type means the extinguisher size/model (for example, 2.5kg DCP).')
      return
    }
    setSaving(true)
    setErr('')
    try {
      const taskPayload = tasks.length ? tasks.map(draftToPayload) : null
      const agentAmountKg = (() => { const m = form.agentType.match(/(\d+(?:\.\d+)?)\s*(kg|l|litre)/i); return m ? Number(m[1]) : null })()
      if (formMode === 'create') {
        await api.post('/operations/jobs', {
          jobType: form.jobType,
          priority: form.priority,
          title,
          customerId: customerMatch!.id,
          customerNumber: customerMatch!.customerId,
          assignedTechnicianId: form.technicianId.trim() ? Number(form.technicianId.trim()) : null,
          technicianName: form.technicianName.trim() ? form.technicianName.trim() : null,
          siteId: form.siteId ? Number(form.siteId) : null,
          equipmentId: form.equipmentId ? Number(form.equipmentId) : null,
          agentType: form.agentType.trim() ? form.agentType.trim() : null,
          agentAmountKg,
          unitCount: form.unitCount ? Number(form.unitCount) : 1,
          plannedStart: form.plannedStart ? new Date(form.plannedStart).toISOString() : null,
          estimatedHours: form.estimatedHours ? Number(form.estimatedHours) : null,
          address: form.address.trim() || null,
          email: form.email.trim() || null,
          nextServiceDate: form.nextServiceDate ? new Date(form.nextServiceDate).toISOString() : null,
          worksDoneSatisfactorily: form.worksDoneSatisfactorily,
          requiredSkills: form.requiredSkills.trim() || null,
          requiredCertifications: form.requiredCertifications.trim() || null,
          tasks: taskPayload,
        })
      } else {
        await api.put(`/operations/jobs/${form.id}`, {
          title,
          jobType: form.jobType,
          priority: form.priority,
          status: form.status,
          plannedStart: form.plannedStart ? new Date(form.plannedStart).toISOString() : null,
          plannedEnd: form.plannedEnd ? new Date(form.plannedEnd).toISOString() : null,
          estimatedHours: form.estimatedHours ? Number(form.estimatedHours) : null,
          quotedAmount: form.quotedAmount ? Number(form.quotedAmount) : null,
          address: form.address.trim() || null,
          email: form.email.trim() || null,
          nextServiceDate: form.nextServiceDate ? new Date(form.nextServiceDate).toISOString() : null,
          notes: form.notes,
          worksDoneSatisfactorily: form.worksDoneSatisfactorily,
          siteId: form.siteId ? Number(form.siteId) : null,
          equipmentId: form.equipmentId ? Number(form.equipmentId) : null,
          agentType: form.agentType.trim() ? form.agentType.trim() : null,
          agentAmountKg,
          unitCount: form.unitCount ? Number(form.unitCount) : 1,
          requiredSkills: form.requiredSkills.trim() || null,
          requiredCertifications: form.requiredCertifications.trim() || null,
          tasks: taskPayload,
        })
      }
      closeForm()
      await load()
    } catch (e: any) {
      setErr(apiErrorMessage(e, formMode === 'create' ? 'Could not create job' : 'Could not save job'))
    }
    setSaving(false)
  }

  const doDelete = async () => {
    if (!delJob) return
    setDelBusy(true)
    setErr('')
    try {
      await api.delete(`/operations/jobs/${delJob.id}`)
      setDelJob(null)
      setDelConfirm('')
      setActive(null)
      await load()
    } catch (e: any) { setErr(apiErrorMessage(e, 'Could not delete job — admins only.')) }
    setDelBusy(false)
  }

  const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—')

  // Recognise jobs by job number, title, customer, technician, equipment, status or source quote.
  const visible = jobs.filter((j) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return [j.jobNumber, j.title, customerIdOf(j), j.customerName ?? '', j.status, j.priority, j.jobType,
      j.technicianName ?? '', equipOf(j), siteOf(j), j.sourceQuotationNumber ?? '']
      .some((v) => (v ?? '').toLowerCase().includes(q))
  })

  return (
    <Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h4" sx={{ fontWeight: 900, color: '#f2f2f7', letterSpacing: '-0.02em' }}>Job Cards</Typography>
          <Typography variant="body2" sx={{ color: '#6b7280' }}>
            {loading ? 'Loading…' : `${jobs.length} jobs · ${Object.keys(assignments).length} AI-scheduled`}
            {ai ? ` · confidence ${Math.round(ai.overallConfidence * 100)}%` : ''}
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<PrintIcon />} disabled={visible.length === 0} onClick={() => printable.print({
          title: 'Job Cards',
          subtitle: `${visible.length} jobs · ${Object.keys(assignments).length} AI-scheduled · grouped by status`,
          cols: [{ label: 'Job' }, { label: 'No' }, { label: 'Customer' }, { label: 'Type' }, { label: 'Priority' }, { label: 'Status' }, { label: 'Technician' }, { label: 'Start' }, { label: 'Hours', align: 'r' }],
          rows: visible.map((j) => {
            const a = assignments[j.id]
            return [
              j.title,
              j.jobNumber,
              customerIdOf(j),
              j.jobType,
              j.priority,
              j.status,
              a?.technicianName ?? j.technicianName ?? 'Unassigned',
              fmt(j.plannedStart),
              j.estimatedHours != null ? `${j.estimatedHours}h` : '—',
            ]
          }),
          groupBy: 4,
          note: `Assignment confidence ${ai ? Math.round(ai.overallConfidence * 100) : 0}% · ${ai?.engineVersion ?? ''}`.trim(),
        })} sx={{ borderRadius: 2 }}>Print</Button>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={load} sx={{ borderRadius: 2 }}>Refresh</Button>
        {canWrite && (
          <Button variant="outlined" startIcon={<AutoAwesomeIcon />} disabled={autoBusy || techs.length === 0}
            onClick={() => void autoAssign()} sx={{ borderRadius: 2, color: '#FF3D00', borderColor: '#FF3D0055', '&:hover': { borderColor: '#FF3D00', bgcolor: '#FF3D0010' } }}>
            {autoBusy ? 'Assigning…' : 'Auto-assign by skills'}
          </Button>
        )}
        {canWrite && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate} sx={{ borderRadius: 2, bgcolor: '#FF3D00', '&:hover': { bgcolor: '#C42A00' } }}>
            New job
          </Button>
        )}
      </Box>

      {okMsg && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setOkMsg('')}>{okMsg}</Alert>}
      {err && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr('')}>{err}</Alert>}
      <TextField
        label="Search by job, customer, technician, equipment, status, or quote"
        fullWidth
        size="small"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        sx={{ mb: 2, ...darkFieldSx }}
      />
      {ai && ai.ml.scheduleAlgorithm === 'GeneticScheduler' && (
        <Alert severity="info" sx={{ mb: 2 }} icon={<AutoAwesomeIcon fontSize="inherit" />}>
          {ai.ml.scheduleAlgorithm} assigned {Object.keys(assignments).length} jobs to {techs.length} technicians · {ai.engineVersion} — click any row for the full job card.
        </Alert>
      )}

      {isMobile && <Typography variant="caption" sx={{ display: 'block', mb: 0.75, color: 'text.secondary' }}>Scroll horizontally to see all job details.</Typography>}
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2.5, bgcolor: 'background.paper', overflowX: 'auto' }}>
        <Table size={isMobile ? 'small' : 'medium'} sx={{ minWidth: 760, '& th, & td': { whiteSpace: 'nowrap' } }}>
          <TableHead>
            <TableRow sx={{ '& th': { bgcolor: 'background.paper', fontWeight: 800, borderBottom: '1px solid rgba(255,255,255,0.12)' } }}>
              <TableCell>Job</TableCell>
              <TableCell>Priority</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>AI assignment</TableCell>
              <TableCell>Start</TableCell>
              {!isMobile && <TableCell>Hours</TableCell>}
              {canWrite && <TableCell align="right">Action</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {visible.length === 0 && (
              <TableRow><TableCell colSpan={7} sx={{ textAlign: 'center', color: '#9ca3af', py: 4 }}>{jobs.length === 0 ? 'No job cards yet.' : 'No jobs match this customer ID or search.'}</TableCell></TableRow>
            )}
            {visible.map((j) => {
              const a = assignments[j.id]
              return (
                <TableRow
                  key={j.id}
                  hover
                  onClick={() => setActive(j)}
                  sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                >
                  <TableCell>
                    <Typography sx={{ fontWeight: 700, color: '#0f0f13', fontSize: 14 }}>{j.title}</Typography>
                    <Typography variant="caption" sx={{ color: '#9ca3af' }}>{j.jobNumber} · {j.jobType}</Typography>
                    <Typography variant="caption" sx={{ color: '#FF3D00', fontWeight: 800, display: 'block' }}>{customerIdOf(j)}{j.customerName ? ` · ${j.customerName}` : ''}</Typography>
                  </TableCell>
                  <TableCell><Chip size="small" sx={{ bgcolor: `${PRIORITY_COLORS[j.priority]}18`, color: PRIORITY_COLORS[j.priority], fontWeight: 700 }} label={j.priority} /></TableCell>
                  <TableCell><Chip size="small" sx={{ bgcolor: `${JOBSTATUS_COLORS[j.status]}18`, color: JOBSTATUS_COLORS[j.status], fontWeight: 700 }} label={j.status} /></TableCell>
                  <TableCell>
                    {a && a.technicianName ? (
                      <Chip size="small" icon={<AutoAwesomeIcon sx={{ fontSize: 14 }} />} label={`${a.technicianName} · ${a.score}%`} sx={{ bgcolor: '#FF3D0014', color: '#FF3D00', fontWeight: 700 }} />
                    ) : (
                      <Typography variant="caption" sx={{ color: '#9ca3af' }}>—</Typography>
                    )}
                  </TableCell>
                  <TableCell><Typography variant="caption" sx={{ color: '#6b7280' }}>{fmt(j.plannedStart)}</Typography></TableCell>
                  {!isMobile && <TableCell><Typography variant="caption" sx={{ color: '#6b7280' }}>{j.estimatedHours ?? '—'}h</Typography></TableCell>}
                  {canWrite && (
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
                        {!j.technicianId && techs.length > 0 ? (
                          <Select
                            size="small"
                            value=""
                            displayEmpty
                            onChange={(e) => assign(j.id, String(e.target.value))}
                            sx={{ minWidth: 180, '& .MuiSelect-select': { py: 0.75, fontSize: 13 } }}
                          >
                            <MenuItem value="" disabled>Assign tech…</MenuItem>
                            {techs.map((t) => {
                              const sm = skillMatch(j.requiredSkills, t.skills)
                              const showSkills = splitCsv(j.requiredSkills).length > 0
                              return (
                                <MenuItem key={t.id} value={t.id}>
                                  {t.name}
                                  {showSkills ? ` · skills ${sm.pct}%` : ''}
                                  {a && a.technicianId === t.id ? ` · AI ${a.score}%` : ''}
                                </MenuItem>
                              )
                            })}
                          </Select>
                        ) : (
                          <Typography variant="caption" sx={{ color: '#0288d1', fontWeight: 700 }}>{j.technicianName}</Typography>
                        )}
                        <Button size="small" variant="outlined" onClick={() => openEdit(j)} sx={{ borderRadius: 2, minWidth: 0, px: 1.5 }}>Edit</Button>
                        {isAdmin && (
                          <Button size="small" variant="outlined" color="error" onClick={() => { setDelJob(j); setDelConfirm('') }} sx={{ borderRadius: 2, minWidth: 0, px: 1.5 }}>Delete</Button>
                        )}
                      </Box>
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <JobCardDialog job={active} techs={techs} canAssign={canWrite} canEdit={canWrite} isAdmin={isAdmin} onAssign={assign} onEdit={openEdit} onDelete={(j) => { setDelJob(j); setDelConfirm('') }} onEditSkills={saveJobSkills} onClose={() => setActive(null)} />

      <JobFormDialog
        open={formOpen}
        mode={formMode}
        form={form}
        setForm={setForm}
        customerMatch={customerMatch}
        setCustomerMatch={setCustomerMatch}
        tasks={tasks}
        setTasks={setTasks}
        equipList={equipList}
        inventory={inventory}
        storeItems={storeItems}
        siteList={siteList}
        techs={techs}
        saving={saving}
        err={err}
        isMobile={isMobile}
        onClose={closeForm}
        onSubmit={submit}
        clearErr={() => setErr('')}
      />

      <Dialog open={!!delJob} onClose={() => !delBusy && setDelJob(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Delete job card? (admin)</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Permanently delete <b>{delJob?.jobNumber}</b> — {delJob?.title}? The deletion is recorded with your name on the customer's activity trail.
          </Typography>
          <TextField
            autoFocus
            size="small"
            fullWidth
            placeholder={`Type "${delJob?.jobNumber ?? ''}" to confirm`}
            value={delConfirm}
            onChange={(e) => setDelConfirm(e.target.value)}
            sx={{ mt: 1, '& input': { fontWeight: 700 } }}
          />
        </DialogContent>
        <DialogActions>
          <Button size="small" onClick={() => { setDelJob(null); setDelConfirm('') }}>Cancel</Button>
          <Button
            size="small"
            color="error"
            variant="contained"
            disabled={delConfirm.trim() !== (delJob?.jobNumber ?? '') || delBusy}
            onClick={doDelete}
          >
            {delBusy ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {printable.node}
    </Box>
  )
}
