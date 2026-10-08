import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import PeopleAltIcon from '@mui/icons-material/PeopleAlt'
import PlaceIcon from '@mui/icons-material/Place'
import BuildIcon from '@mui/icons-material/Build'
import FolderOpenIcon from '@mui/icons-material/FolderOpen'
import TimelineIcon from '@mui/icons-material/Timeline'
import HistoryIcon from '@mui/icons-material/History'
import AssignmentIcon from '@mui/icons-material/Assignment'
import RequestQuoteIcon from '@mui/icons-material/RequestQuote'
import CallMergeIcon from '@mui/icons-material/CallMerge'
import DeleteIcon from '@mui/icons-material/Delete'
import DownloadIcon from '@mui/icons-material/Download'
import VisibilityIcon from '@mui/icons-material/Visibility'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import PushPinIcon from '@mui/icons-material/PushPin'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ScheduleIcon from '@mui/icons-material/Schedule'
import AlertOctagonIcon from '@mui/icons-material/NotificationsActive'
import { api } from '../api/client'
import PrintIcon from '@mui/icons-material/Print'
import CloseIcon from '@mui/icons-material/Close'
import { useTablePrint } from '../components/print'
import {
  COMM_CHANNELS,
  type Customer,
  DOC_TYPES,
  PRIORITY_COLORS,
  type Profile,
  SERVICE_COLORS,
  SITE_TYPES,
  STATUS_COLORS,
} from './customerTypes'

const darkText = { primary: '#0f0f13', secondary: '#6b7280' }
// Dark-theme IconButtons default to near-white — invisible on this white dialog.
const docIconSx = { color: '#4b5563', '&:hover': { color: '#FF3D00', bgcolor: '#FF3D0014' } }
const SERVICE_STATUS_COLORS: Record<string, string> = {
  Scheduled: '#0288d1',
  Completed: '#2e7d32',
  InProgress: '#ff8f00',
  Cancelled: '#6b7280',
}
const TYPE_COLORS: Record<string, string> = {
  Commercial: '#0288d1',
  Industrial: '#2e7d32',
  Institutional: '#ff8f00',
  Residential: '#7b1fa2',
  Government: '#FF3D00',
}
const TIMELINE_COLORS: Record<string, string> = {
  service: '#2e7d32',
  report: '#0288d1',
  communication: '#7b1fa2',
  document: '#f57c00',
  activity: '#6b7280',
}

function fmt(d?: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}
function toISO(d: string) {
  if (!d) return null
  return new Date(`${d}T00:00:00`).toISOString()
}
function daysTil(d?: string | null) {
  if (!d) return null
  const dt = new Date(d).getTime()
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.round((dt - now.getTime()) / 86400000)
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" sx={{ color: '#9ca3af', fontWeight: 700, display: 'block' }}>{label.toUpperCase()}</Typography>
      <Typography variant="body2" sx={{ color: darkText.primary, fontWeight: 600, mt: 0.25 }}>{value ?? '—'}</Typography>
    </Box>
  )
}

const PHONE_LINK_STYLE = { display: 'inline-flex', alignItems: 'center', gap: 0.5, color: '#1d4ed8', fontWeight: 600, fontSize: 13, textDecoration: 'underline', textUnderlineOffset: 2 }

export default function CustomerProfileDialog({ customer, open, onClose, onEdit, onChanged, isAdmin = false, allCustomers = [] }: {
  customer: Customer
  open: boolean
  onClose: () => void
  onEdit?: (c: Customer) => void
  onChanged: () => void
  isAdmin?: boolean
  allCustomers?: Customer[]
}) {
  const isMobile = useMediaQuery('(max-width: 700px)')
  const [tab, setTab] = useState(0)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(false)
  const [timeline, setTimeline] = useState<{ date: string; type: string; title: string; details?: string | null; refId?: number | null }[]>([])
  const [jobs, setJobs] = useState<{ id: number; jobNumber: string; title: string; jobType: string; status: string; priority: string; plannedStart?: string | null; quotedAmount?: number | null }[]>([])
  const [quotes, setQuotes] = useState<{ id: number; quotationNumber: string; title: string; status: string; total: number; expiryDate: string }[]>([])
  const [mergeOpen, setMergeOpen] = useState(false)
  const [mergeTargetId, setMergeTargetId] = useState<number | ''>('')
  const [mergeReason, setMergeReason] = useState('')
  const [mergeMsg, setMergeMsg] = useState('')
  const fileInput = useRef<HTMLInputElement | null>(null)
  const [docFile, setDocFile] = useState<File | null>(null)
  const [docName, setDocName] = useState('')
  const [docType, setDocType] = useState('ServiceReport')
  const [docMsg, setDocMsg] = useState('')
  const [saving, setSaving] = useState('')
  const [extractingId, setExtractingId] = useState<number | ''>('')
  const [extractOut, setExtractOut] = useState<{
    companyName?: string | null; invoiceNo?: string | null; amount?: string | null;
    date?: string | null; vatNo?: string | null;
    matches: { customerId: number; companyName: string; score: number }[];
  } | null>(null)
  const [confirmingId, setConfirmingId] = useState<number | ''>('')
  const [docBusy, setDocBusy] = useState<number | ''>('')
  const [docErr, setDocErr] = useState('')
  const [preview, setPreview] = useState<{ id: number; name: string; filePath?: string | null; url: string; kind: 'image' | 'pdf' | 'text' | 'unsupported'; text?: string } | null>(null)
  

  const load = useCallback(async () => {
    if (!open) return
    setLoading(true)
    try {
      const [{ data: p }, { data: tl }, { data: j }, { data: q }] = await Promise.all([
        api.get<Profile>(`/customers/${customer.id}`),
        api.get(`/customers/${customer.id}/timeline`),
        api.get(`/customers/${customer.id}/jobs`),
        api.get(`/customers/${customer.id}/quotations`),
      ])
      setProfile(p)
      setTimeline(tl)
      setJobs(j ?? [])
      setQuotes(q ?? [])
    } catch {
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }, [open, customer.id])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  // ---- nested forms state ----
  const [siteForm, setSiteForm] = useState({ name: '', siteType: 'HeadOffice', address: '', city: '', contactPerson: '', phone: '', isPrimary: false })
  const [noteForm, setNoteForm] = useState('')
  const [commForm, setCommForm] = useState({ channel: 'WhatsApp', direction: 'Outgoing', subject: '', message: '', followUpDate: '' })
  const [serviceForm, setServiceForm] = useState({ serviceDate: '', status: 'Completed', unitsServiced: '0', stickersUsed: '0', equipmentServiced: '0', technician: '', certificateNo: '' })

  const post = async (url: string, body: unknown) => {
    setSaving(url)
    try {
      await api.post(url, body)
      await load()
      onChanged()
    } catch {
      /* toast handled by parent? keep silent */
    } finally {
      setSaving('')
    }
  }
  const docFileName = (d: { name: string; filePath?: string | null }) => {
    const ext = (d.filePath ?? '').match(/\.[a-z0-9]+$/i)?.[0] ?? ''
    return ext && !d.name.toLowerCase().endsWith(ext.toLowerCase()) ? `${d.name}${ext}` : d.name
  }
  const fetchDocBlob = (id: number, inline: boolean) =>
    api.get(`/customers/${c.id}/documents/${id}/download${inline ? '?inline=true' : ''}`, { responseType: 'blob' })
  const downloadDoc = async (d: { id: number; name: string; filePath?: string | null }) => {
    setDocBusy(d.id); setDocErr('')
    try {
      const { data } = await fetchDocBlob(d.id, false)
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url; a.download = docFileName(d)
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setDocErr('Download failed — the file may no longer exist.')
    } finally { setDocBusy('') }
  }
  // Minimal zip walker: pull word/document.xml out of a .docx and strip tags.
  const extractDocxText = async (blob: Blob): Promise<string | null> => {
    try {
      const buf = await blob.arrayBuffer()
      const view = new DataView(buf)
      const bytes = new Uint8Array(buf)
      let eo = -1
      for (let i = bytes.length - 22; i >= 0 && i >= bytes.length - 65558; i--) {
        if (view.getUint32(i, true) === 0x06054b50) { eo = i; break }
      }
      if (eo < 0) return null
      const count = view.getUint16(eo + 10, true)
      let p = view.getUint32(eo + 16, true)
      for (let i = 0; i < count; i++) {
        if (view.getUint32(p, true) !== 0x02014b50) break
        const method = view.getUint16(p + 10, true)
        const compSize = view.getUint32(p + 20, true)
        const nameLen = view.getUint16(p + 28, true)
        const extraLen = view.getUint16(p + 30, true)
        const commentLen = view.getUint16(p + 32, true)
        const localOff = view.getUint32(p + 42, true)
        const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen)).replace(/\\/g, '/')
        if (name === 'word/document.xml') {
          const start = localOff + 30 + view.getUint16(localOff + 26, true) + view.getUint16(localOff + 28, true)
          const slice = bytes.subarray(start, start + compSize)
          let out: Uint8Array
          if (method === 0) out = slice
          else if (method === 8) {
            const stream = new Blob([slice]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
            out = new Uint8Array(await new Response(stream).arrayBuffer())
          } else return null
          return new TextDecoder().decode(out)
            .replace(/<w:tab[^>]*\/>/g, '\t')
            .replace(/<w:br[^>]*\/>/g, '\n')
            .replace(/<\/w:p>/g, '\n')
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
            .replace(/\n{3,}/g, '\n\n')
            .trim() || null
        }
        p += 46 + nameLen + extraLen + commentLen
      }
      return null
    } catch { return null }
  }
  const closePreview = () => {
    if (preview?.url) URL.revokeObjectURL(preview.url)
    setPreview(null)
  }
  const viewDoc = async (d: { id: number; name: string; filePath?: string | null }) => {
    const ext = (d.filePath ?? '').match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase() ?? ''
    const kind = /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(ext) ? 'image'
      : ext === '.pdf' ? 'pdf'
      : /\.(txt|csv|json|log|md|xml|html?|css|js|ts)$/.test(ext) ? 'text'
      : ext === '.docx' ? 'docx'
      : 'none'
    setDocBusy(d.id); setDocErr('')
    try {
      const { data } = await fetchDocBlob(d.id, true)
      const url = URL.createObjectURL(data)
      const base = { id: d.id, name: docFileName(d), filePath: d.filePath, url }
      if (kind === 'image') setPreview({ ...base, kind: 'image' })
      else if (kind === 'pdf') setPreview({ ...base, kind: 'pdf' })
      else if (kind === 'text') setPreview({ ...base, kind: 'text', text: await data.text() })
      else if (kind === 'docx') {
        const text = await extractDocxText(data)
        setPreview(text ? { ...base, kind: 'text', text } : { ...base, kind: 'unsupported' })
      } else setPreview({ ...base, kind: 'unsupported' })
    } catch {
      setDocErr('Could not open the file — try downloading it instead.')
    } finally { setDocBusy('') }
  }
  const extractDoc = async (d: { id: number; name: string; docType: string; notes?: string | null }) => {
    setExtractingId(d.id)
    setExtractOut(null)
    setConfirmingId('')
    try {
      const fd = new FormData()
      fd.append('Name', d.name)
      fd.append('DocType', d.docType)
      fd.append('Notes', d.notes ?? d.name)
      const { data } = await api.post(`/customers/${c.id}/documents/extract`, fd)
      setExtractOut(data)
    } finally {
      setExtractingId('')
    }
  }
  const confirmMatch = async (d: { id: number }, customerId: number) => {
    setConfirmingId(d.id)
    try {
      await api.patch(`/customers/${c.id}/documents/${d.id}`, {
        Notes: JSON.stringify({ ext: extractOut, matchedCustomerId: customerId, confirmedAt: new Date().toISOString() }),
      })
      await load()
      onChanged()
      setExtractOut(null)
    } finally {
      setConfirmingId('')
    }
  }
  const del = async (url: string) => {
    if (!window.confirm(`Delete this ${url.split('/').slice(-2)[0]}?`)) return
    setSaving(url)
    try {
      await api.delete(url)
      await load()
      onChanged()
    } finally {
      setSaving('')
    }
  }

  const c = profile?.customer ?? customer
  const svc = SERVICE_COLORS[c.serviceStatus]
  const days = daysTil(c.nextServiceDate)

  const busy = (marker: string) => saving === marker

  const printable = useTablePrint()

  const doMerge = async () => {
    if (mergeTargetId === '' || !mergeTargetId) { setMergeMsg('Choose the master record this customer should merge into.'); return }
    if (!mergeReason.trim()) { setMergeMsg('A reason is required — it is saved in the audit log.'); return }
    setSaving('merge')
    try {
      const { data } = await api.post('/customers/merge', { masterId: mergeTargetId, duplicateId: c.id, reason: mergeReason.trim() })
      setMergeMsg(data?.conflicts?.length ? `Merged — review needed: ${data.conflicts.join(' | ')}` : 'Records merged successfully.')
      setTimeout(() => {
        setMergeOpen(false)
        setMergeMsg('')
        setMergeTargetId('')
        setMergeReason('')
        onClose()
      }, 900)
    } catch (err: any) {
      setMergeMsg(err?.response?.data?.message ?? 'Merge failed.')
    } finally {
      setSaving('')
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth fullScreen={isMobile}>
      {profile === null && loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress /></Box>
      ) : (
        <>
          <Box sx={{ bgcolor: isMobile ? '#12121a' : '#ffffff', borderBottom: '1px solid #eef0f4' }}>
            <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1.5, color: isMobile ? '#f2f2f7' : 'inherit', pb: 1.5 }}>
              <Avatar sx={{ bgcolor: '#ff8a0014', color: '#ff8a00', fontWeight: 700 }}>{c.name.charAt(0).toUpperCase()}</Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Typography sx={{ fontWeight: 800, fontSize: 18 }} noWrap>{c.name}</Typography>
                  <Chip label={c.customerId} size="small" variant="outlined" sx={{ fontFamily: 'monospace', fontWeight: 700, color: isMobile ? '#9aa0b0' : '#0288d1', borderColor: '#0288d155' }} />
                </Box>
                <Typography variant="caption" sx={{ color: isMobile ? '#9aa0b0' : '#6b7280' }}>{c.customerType} · {c.status}</Typography>
              </Box>
              <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
                <Chip label={svc.label} size="small" sx={{ bgcolor: `${svc.color}18`, color: svc.color, fontWeight: 700, display: { xs: 'none', sm: 'inline-flex' } }} />
                {isAdmin && <Button size="small" variant="outlined" color="error" startIcon={<CallMergeIcon fontSize="small" />} onClick={() => setMergeOpen(true)} sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>Merge</Button>}
                {onEdit && <Button size="small" variant="outlined" onClick={() => onEdit(c)} sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>Edit</Button>}
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<PrintIcon />}
                  onClick={() => printable.print({
                    title: `Customer — ${c.name}`,
                    subtitle: `${c.customerType} · ${c.status}`,
                    cols: [{ label: 'Field' }, { label: 'Value' }],
                    rows: [
                      [c.name, c.customerId],
                      [c.customerType, c.status],
                      [c.email || '—', c.phone || '—'],
                      [c.serviceStatus || '—', c.customerId],
                    ],
                  })}
                  sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
                >
                  Print / PDF
                </Button>
                <IconButton onClick={onClose} sx={{ display: { xs: 'flex', sm: 'none' }, color: isMobile ? '#f2f2f7' : 'inherit' }}>
                  <CloseIcon />
                </IconButton>
              </Box>
            </DialogTitle>
            <Tabs value={tab} onChange={(_, v) => setTab(v)} variant={isMobile ? 'scrollable' : 'fullWidth'} scrollButtons="auto" sx={{ px: 1.5, '& .MuiTab-root': { textTransform: 'none', fontWeight: 700, minHeight: 44 } }}>
              <Tab icon={<InfoOutlinedIcon />} iconPosition="start" label="Overview" />
              <Tab icon={<PeopleAltIcon />} iconPosition="start" label="Contacts & Comms" />
              <Tab icon={<PlaceIcon />} iconPosition="start" label={`Sites (${profile?.sites.length ?? 0})`} />
              <Tab icon={<BuildIcon />} iconPosition="start" label={`Services (${profile?.services.length ?? 0})`} />
              <Tab icon={<FolderOpenIcon />} iconPosition="start" label={`Docs (${profile?.documents.length ?? 0})`} />
              <Tab icon={<TimelineIcon />} iconPosition="start" label="Timeline" />
              <Tab icon={<HistoryIcon />} iconPosition="start" label={`Audit (${profile?.fieldAudits.length ?? 0})`} />
              <Tab icon={<AssignmentIcon />} iconPosition="start" label={`Jobs (${jobs.length})`} />
              <Tab icon={<RequestQuoteIcon />} iconPosition="start" label={`Quotes (${quotes.length})`} />
            </Tabs>
          </Box>

          <DialogContent dividers sx={{ bgcolor: isMobile ? '#ffffff' : '#ffffff' }}>
            {tab === 0 && (
              <Box>
                {/* reminder status banner */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, mb: 2, borderRadius: 2, bgcolor: `${svc.color}12`, border: `1px solid ${svc.color}44` }}>
                  {c.serviceStatus === 'Overdue' ? <AlertOctagonIcon sx={{ color: svc.color }} /> : c.serviceStatus === 'UpToDate' ? <CheckCircleIcon sx={{ color: svc.color }} /> : <ScheduleIcon sx={{ color: svc.color }} />}
                  <Box sx={{ flexGrow: 1 }}>
                    <Typography sx={{ fontWeight: 800, color: svc.color }}>Service reminder: {svc.label}</Typography>
                    <Typography variant="body2" sx={{ color: darkText.secondary }}>
                      {days === null ? 'No service schedule yet — set a frequency or log the first service.' : days < 0 ? `Overdue by ${-days} day${-days === 1 ? '' : 's'} (was due ${fmt(c.nextServiceDate)})` : days === 0 ? 'Due today!' : `Next service ${fmt(c.nextServiceDate)} · in ${days} day${days === 1 ? '' : 's'}`}
                    </Typography>
                  </Box>
                </Box>

                {/* record completion — master record health */}
                {c.completion != null && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, mb: 2, borderRadius: 2, bgcolor: c.completion.percent >= 80 ? '#2e7d3212' : '#ff8f0012', border: `1px solid ${c.completion.percent >= 80 ? '#2e7d3244' : '#ff8f0044'}` }}>
                    <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                      <CircularProgress variant="determinate" value={c.completion.percent} size={52} sx={{ color: c.completion.percent >= 80 ? '#2e7d32' : '#f57c00' }} />
                      <Box sx={{ top: 0, left: 0, bottom: 0, right: 0, position: 'absolute', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography variant="caption" sx={{ fontWeight: 800 }}>{c.completion.percent}%</Typography>
                      </Box>
                    </Box>
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography sx={{ fontWeight: 800 }}>Master record {c.completion.percent >= 80 ? 'complete' : 'nearly complete'}</Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1 }}>
                        {c.completion.sections.map((s) => (
                          <Tooltip key={s.key} title={`Owned by ${s.owner}${s.done ? ' — done' : ' — missing details'}`}>
                            <Chip size="small" label={`${s.label}${s.done ? ' ✓' : ''}`} sx={{ bgcolor: s.done ? '#2e7d3214' : '#f1f5f9', color: s.done ? '#2e7d32' : '#6b7280', fontWeight: 700, fontSize: 11 }} />
                          </Tooltip>
                        ))}
                      </Box>
                    </Box>
                  </Box>
                )}

                <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
                  <InfoRow label="Customer ID" value={<Chip label={c.customerId} size="small" variant="outlined" sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#0288d1', borderColor: '#0288d155' }} />} />
                  <InfoRow label="Customer type" value={<Chip label={c.customerType} size="small" sx={{ bgcolor: `${TYPE_COLORS[c.customerType] ?? '#f1f5f9'}18`, color: TYPE_COLORS[c.customerType] ?? '#334155', fontWeight: 600 }} />} />
                  <InfoRow label="Priority" value={<Chip label={c.priority} size="small" sx={{ bgcolor: `${PRIORITY_COLORS[c.priority]}18`, color: PRIORITY_COLORS[c.priority], fontWeight: 700 }} />} />
                  <InfoRow label="Status" value={<Chip label={c.status} size="small" sx={{ bgcolor: `${STATUS_COLORS[c.status]}18`, color: STATUS_COLORS[c.status], fontWeight: 700 }} />} />
                  <InfoRow label="Phone" value={c.phone} />
                  <InfoRow label="WhatsApp" value={c.whatsapp} />
                  <InfoRow label="Email" value={c.email} />
                  <InfoRow label="Preferred contact" value={c.preferredContact} />
                  <InfoRow label="Account manager" value={c.accountManager} />
                  <InfoRow label="Category" value={c.category} />
                  <InfoRow label="Customer since" value={fmt(c.customerSince)} />
                  <InfoRow label="Service frequency" value={c.serviceFrequencyMonths ? `Every ${c.serviceFrequencyMonths} months` : '—'} />
                  <InfoRow label="Last service" value={fmt(c.lastServiceDate)} />
                  <InfoRow label="Alternative name" value={c.alternativeName} />
                  <InfoRow label="VAT number" value={c.vatNumber} />
                  <InfoRow label="TIN number" value={c.tinNumber} />
                  <InfoRow label="Registration no." value={c.registrationNumber} />
                  <InfoRow label="Payment terms" value={c.paymentTerms} />
                  <InfoRow label="Credit information" value={c.creditInfo} />
                  <InfoRow label="Billing address" value={c.billingAddress} />
                  <InfoRow label="Contract ref" value={c.contractRef} />
                  <InfoRow label="Contract period" value={`${fmt(c.contractStartDate)} → ${fmt(c.contractEndDate)}`} />
                  <InfoRow label="Contract value" value={c.contractValue != null ? `US$${Number(c.contractValue).toLocaleString()}` : '—'} />
                  <InfoRow label="Contract status" value={<Chip label={c.contractStatus ?? 'None'} size="small" sx={{ bgcolor: (c.contractStatus === 'Active' ? '#2e7d32' : c.contractStatus === 'Expired' || c.contractStatus === 'Terminated' ? '#d32f2f' : '#6b7280') + '18', color: c.contractStatus === 'Active' ? '#2e7d32' : c.contractStatus === 'Expired' || c.contractStatus === 'Terminated' ? '#d32f2f' : '#6b7280', fontWeight: 700 }} />} />
                </Box>

                {(c.specialRequirements || c.notes || c.website) && (
                  <Box sx={{ mt: 2, p: 1.5, bgcolor: '#f8fafc', border: '1px solid #eef0f4', borderRadius: 1.5 }}>
                    {c.specialRequirements && (
                      <Box sx={{ mb: c.notes ? 1 : 0 }}>
                        <Typography variant="caption" sx={{ color: '#c4441c', fontWeight: 800 }}>SPECIAL REQUIREMENTS</Typography>
                        <Typography variant="body2" sx={{ color: darkText.primary, mt: 0.25 }}>{c.specialRequirements}</Typography>
                      </Box>
                    )}
                    {c.notes && (
                      <Box>
                        <Typography variant="caption" sx={{ color: darkText.secondary, fontWeight: 700 }}>NOTES</Typography>
                        <Typography variant="body2" sx={{ color: darkText.primary, mt: 0.25 }}>{c.notes}</Typography>
                      </Box>
                    )}
                  </Box>
                )}

                {/* flexible notes */}
                <Typography variant="h6" sx={{ mt: 3, mb: 1, color: darkText.primary, fontSize: 15 }}>Notes ({profile?.notesList.length ?? 0})</Typography>
                <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
                  <TextField size="small" fullWidth placeholder="e.g. Customer prefers servicing on Fridays…" value={noteForm}
                    onChange={(e) => setNoteForm(e.target.value)} sx={inputLightSx} />
                  <Button variant="contained" disabled={!noteForm.trim() || busy('note')} onClick={() => { post(`/customers/${c.id}/notes`, { content: noteForm.trim(), createdBy: 'admin' }); setNoteForm('') }}>
                    Add
                  </Button>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {(profile?.notesList.length ?? 0) === 0 && <Typography variant="body2" sx={{ color: darkText.secondary }}>No notes on file.</Typography>}
                  {profile?.notesList.map((n) => (
                    <Box key={n.id} sx={{ border: '1px solid #eef0f4', borderRadius: 1.5, p: 1.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {n.pinned && <PushPinIcon sx={{ fontSize: 16, color: '#FF3D00' }} />}
                        <Typography variant="body2" sx={{ color: darkText.primary, flexGrow: 1 }}>{n.content}</Typography>
                        <Typography variant="caption" sx={{ color: '#9ca3af' }}>{fmt(n.createdAt)}{n.createdBy ? ` · ${n.createdBy}` : ''}</Typography>
                        <IconButton size="small" onClick={() => del(`/customers/${c.id}/notes/${n.id}`)}><DeleteIcon fontSize="small" /></IconButton>
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {tab === 1 && (
              <Box>
                <Typography variant="h6" sx={{ mb: 1, color: darkText.primary, fontSize: 15 }}>Contacts ({profile?.customer.contacts.length ?? 0})</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 3 }}>
                  {profile?.customer.contacts.map((k) => (
                    <Box key={k.id ?? k.name} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, border: '1px solid #eef0f4', borderRadius: 1.5, p: 1.5 }}>
                      <Box sx={{ minWidth: 160 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{k.name}</Typography>
                        <Typography variant="caption" sx={{ color: darkText.secondary }}>{k.role ?? '—'}</Typography>
                      </Box>
                      <a href={`tel:${k.phone}`} style={{ ...PHONE_LINK_STYLE }}>{k.phone}</a>
                      {k.email && <a href={`mailto:${k.email}`} style={{ ...PHONE_LINK_STYLE }}>{k.email}</a>}
                      {k.isPrimary && <Chip label="Primary" size="small" sx={{ bgcolor: '#FF3D0014', color: '#FF3D00', fontSize: 11, height: 20, fontWeight: 700 }} />}
                    </Box>
                  ))}
                </Box>

                <Typography variant="h6" sx={{ mb: 1, color: darkText.primary, fontSize: 15 }}>Add communication</Typography>
                <Box sx={{ display: 'flex', gap: 1, flexDirection: 'column', mb: 1 }}>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <FormControl size="small" sx={{ minWidth: 140 }}>
                      <InputLabel>Channel</InputLabel>
                      <Select label="Channel" value={commForm.channel} onChange={(e) => setCommForm((f) => ({ ...f, channel: e.target.value }))}>{COMM_CHANNELS.map((x) => <MenuItem key={x} value={x}>{x}</MenuItem>)}</Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 140 }}>
                      <InputLabel>Direction</InputLabel>
                      <Select label="Direction" value={commForm.direction} onChange={(e) => setCommForm((f) => ({ ...f, direction: e.target.value }))}><MenuItem value="Outgoing">Outgoing</MenuItem><MenuItem value="Incoming">Incoming</MenuItem></Select>
                    </FormControl>
                    <TextField size="small" sx={{ flexGrow: 1, minWidth: 160 }} label="Subject" value={commForm.subject} onChange={(e) => setCommForm((f) => ({ ...f, subject: e.target.value }))} />
                  </Box>
                  <TextField size="small" multiline minRows={2} label="Message / notes" value={commForm.message} onChange={(e) => setCommForm((f) => ({ ...f, message: e.target.value }))} />
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                    <TextField size="small" type="date" label="Follow-up date" value={commForm.followUpDate} onChange={(e) => setCommForm((f) => ({ ...f, followUpDate: e.target.value }))} sx={{ width: 170 }} />
                    <Button variant="contained" onClick={() => { post(`/customers/${c.id}/communications`, { ...commForm, message: commForm.message, followUpDate: toISO(commForm.followUpDate), sentAt: new Date().toISOString(), createdBy: 'admin' }); setCommForm({ channel: 'WhatsApp', direction: 'Outgoing', subject: '', message: '', followUpDate: '' }) }} disabled={busy('comm')}>
                      Log communication
                    </Button>
                  </Box>
                </Box>

                <Typography variant="h6" sx={{ mt: 3, mb: 1, color: darkText.primary, fontSize: 15 }}>Communication history ({profile?.communications.length ?? 0})</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {(profile?.communications.length ?? 0) === 0 && <Typography variant="body2" sx={{ color: darkText.secondary }}>Nothing logged yet.</Typography>}
                  {profile?.communications.map((x) => (
                    <Box key={x.id} sx={{ border: '1px solid #eef0f4', borderRadius: 1.5, p: 1.5 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Chip label={`${x.direction} ${x.channel}`} size="small" sx={{ bgcolor: x.direction === 'Incoming' ? '#7b1fa214' : '#0288d114', color: x.direction === 'Incoming' ? '#7b1fa2' : '#0288d1', fontWeight: 700 }} />
                        <Typography sx={{ fontWeight: 700, fontSize: 14, flexGrow: 1 }}>{x.subject ?? 'No subject'}</Typography>
                        <Typography variant="caption" sx={{ color: '#9ca3af' }}>{fmt(x.sentAt)}</Typography>
                        {x.customerResponded && <Chip label="Responded" size="small" sx={{ bgcolor: '#2e7d3214', color: '#2e7d32', fontWeight: 700 }} />}
                      </Box>
                      {x.message && <Typography variant="body2" sx={{ color: darkText.secondary, mt: 0.5 }}>{x.message}</Typography>}
                      {(x.responseNotes || x.followUpDate) && (
                        <Typography variant="caption" sx={{ color: darkText.secondary, display: 'block', mt: 0.5 }}>
                          {x.responseNotes}{x.followUpDate ? ` · Follow up ${fmt(x.followUpDate)}` : ''}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {tab === 2 && (
              <Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 3 }}>
                  {profile?.sites.map((s) => (
                    <Box key={s.id} sx={{ border: '1px solid #eef0f4', borderRadius: 2, p: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <PlaceIcon sx={{ color: '#ffb300' }} />
                        <Typography sx={{ fontWeight: 800, color: darkText.primary }}>{s.name}</Typography>
                        {s.isPrimary && <Chip label="Primary" size="small" sx={{ bgcolor: '#FF3D0014', color: '#FF3D00', fontSize: 11, height: 20, fontWeight: 700 }} />}
                        <Box sx={{ ml: 'auto' }}>
                          <IconButton size="small" onClick={() => del(`/customers/${c.id}/sites/${s.id}`)}><DeleteIcon fontSize="small" /></IconButton>
                        </Box>
                      </Box>
                      <Typography variant="caption" sx={{ color: darkText.secondary, display: 'block', mt: 0.5 }}>{s.siteType}{s.city ? ` · ${s.city}` : ''}</Typography>
                      {s.address && <Typography variant="body2" sx={{ color: darkText.primary, mt: 0.5 }}>{s.address}</Typography>}
                      {(s.contactPerson || s.phone) && <Typography variant="body2" sx={{ color: darkText.secondary, mt: 0.5 }}>{s.contactPerson}{s.phone ? ` · ${s.phone}` : ''}</Typography>}
                    </Box>
                  ))}
                  {(profile?.sites.length ?? 0) === 0 && <Typography variant="body2" sx={{ color: darkText.secondary }}>No sites yet — add one below.</Typography>}
                </Box>

                <Typography variant="h6" sx={{ mb: 1, color: darkText.primary, fontSize: 15 }}>Add site</Typography>
                <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' } }}>
                  <TextField size="small" label="Site name *" value={siteForm.name} onChange={(e) => setSiteForm((f) => ({ ...f, name: e.target.value }))} sx={inputLightSx} />
                  <FormControl size="small">
                    <InputLabel>Type</InputLabel>
                    <Select label="Type" value={siteForm.siteType} onChange={(e) => setSiteForm((f) => ({ ...f, siteType: e.target.value }))}>{SITE_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}</Select>
                  </FormControl>
                  <TextField size="small" label="City" value={siteForm.city} onChange={(e) => setSiteForm((f) => ({ ...f, city: e.target.value }))} sx={inputLightSx} />
                  <TextField size="small" label="Address" value={siteForm.address} onChange={(e) => setSiteForm((f) => ({ ...f, address: e.target.value }))} sx={inputLightSx} />
                  <TextField size="small" label="Contact person" value={siteForm.contactPerson} onChange={(e) => setSiteForm((f) => ({ ...f, contactPerson: e.target.value }))} sx={inputLightSx} />
                  <TextField size="small" label="Phone" value={siteForm.phone} onChange={(e) => setSiteForm((f) => ({ ...f, phone: e.target.value }))} sx={inputLightSx} />
                </Box>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 1.5 }}>
                  <FormControl size="small" sx={{ minWidth: 130 }}>
                    <InputLabel>Primary</InputLabel>
                    <Select label="Primary" value={siteForm.isPrimary ? 'primary' : 'extra'} onChange={(e) => setSiteForm((f) => ({ ...f, isPrimary: e.target.value === 'primary' }))}><MenuItem value="primary">Primary</MenuItem><MenuItem value="extra">Secondary</MenuItem></Select>
                  </FormControl>
                  <Button variant="contained" disabled={!siteForm.name.trim() || busy('site')} onClick={() => { post(`/customers/${c.id}/sites`, siteForm); setSiteForm({ name: '', siteType: 'HeadOffice', address: '', city: '', contactPerson: '', phone: '', isPrimary: false }) }}>
                    Add site
                  </Button>
                </Box>
              </Box>
            )}

            {tab === 3 && (
              <Box>
                <Box sx={{ display: 'flex', gap: 1, flexDirection: 'column', mb: 3 }}>
                  <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr 1fr' } }}>
                    <TextField size="small" type="date" label="Service date *" value={serviceForm.serviceDate} onChange={(e) => setServiceForm((f) => ({ ...f, serviceDate: e.target.value }))} sx={inputLightSx} />
                    <FormControl size="small">
                      <InputLabel>Status</InputLabel>
                      <Select label="Status" value={serviceForm.status} onChange={(e) => setServiceForm((f) => ({ ...f, status: e.target.value }))}><MenuItem value="Completed">Completed</MenuItem><MenuItem value="InProgress">In progress</MenuItem><MenuItem value="Scheduled">Scheduled</MenuItem></Select>
                    </FormControl>
                    <TextField size="small" type="number" label="Units serviced" value={serviceForm.unitsServiced} onChange={(e) => setServiceForm((f) => ({ ...f, unitsServiced: e.target.value }))} sx={inputLightSx} />
                    <TextField size="small" type="number" label="Stickers used" value={serviceForm.stickersUsed} onChange={(e) => setServiceForm((f) => ({ ...f, stickersUsed: e.target.value }))} sx={inputLightSx} />
                    <TextField size="small" type="number" label="Equipment serviced" value={serviceForm.equipmentServiced} onChange={(e) => setServiceForm((f) => ({ ...f, equipmentServiced: e.target.value }))} sx={inputLightSx} />
                    <TextField size="small" label="Technician" value={serviceForm.technician} onChange={(e) => setServiceForm((f) => ({ ...f, technician: e.target.value }))} sx={inputLightSx} />
                    <TextField size="small" label="Certificate no." value={serviceForm.certificateNo} onChange={(e) => setServiceForm((f) => ({ ...f, certificateNo: e.target.value }))} sx={inputLightSx} />
                  </Box>
                  <Box>
                    <Button variant="contained" disabled={!serviceForm.serviceDate || busy('service')}
                      onClick={() => {
                        post(`/customers/${c.id}/services`, { serviceDate: toISO(serviceForm.serviceDate), status: serviceForm.status, unitsServiced: Number(serviceForm.unitsServiced) || 0, stickersUsed: Number(serviceForm.stickersUsed) || 0, equipmentServiced: Number(serviceForm.equipmentServiced) || 0, equipmentReplaced: 0, equipmentAdded: 0, equipmentRemoved: 0, technician: serviceForm.technician, certificateNo: serviceForm.certificateNo, defectsFound: '', recommendations: '', notes: '' })
                        setServiceForm({ serviceDate: '', status: 'Completed', unitsServiced: '0', stickersUsed: '0', equipmentServiced: '0', technician: '', certificateNo: '' })
                      }}>
                      Log service (updates reminder schedule)
                    </Button>
                  </Box>
                </Box>

                <Typography variant="h6" sx={{ mb: 1, color: darkText.primary, fontSize: 15 }}>Service history ({profile?.services.length ?? 0})</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {(profile?.services.length ?? 0) === 0 && <Typography variant="body2" sx={{ color: darkText.secondary }}>No services yet.</Typography>}
                  {profile?.services.map((s) => (
                    <Box key={s.id} sx={{ border: '1px solid #eef0f4', borderRadius: 2, p: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Chip label={s.status} size="small" sx={{ bgcolor: `${SERVICE_STATUS_COLORS[s.status]}18`, color: SERVICE_STATUS_COLORS[s.status], fontWeight: 700 }} />
                        <Typography sx={{ fontWeight: 800, color: darkText.primary }}>{fmt(s.serviceDate)}</Typography>
                        {s.technician && <Typography variant="caption" sx={{ color: darkText.secondary }}>Tech: {s.technician}</Typography>}
                        {s.certificateNo && <Chip label={`Cert ${s.certificateNo}`} size="small" variant="outlined" sx={{ color: '#0288d1', borderColor: '#0288d155', fontWeight: 600 }} />}
                        <Box sx={{ ml: 'auto' }}>
                          <IconButton size="small" onClick={() => del(`/customers/${c.id}/services/${s.id}`)}><DeleteIcon fontSize="small" /></IconButton>
                        </Box>
                      </Box>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 1 }}>
                        {[
                          ['Units', s.unitsServiced], ['Stickers', s.stickersUsed], ['Serviced', s.equipmentServiced], ['Replaced', s.equipmentReplaced], ['Added', s.equipmentAdded], ['Removed', s.equipmentRemoved],
                        ].map(([k, v]) => (
                          <Box key={k as string}>
                            <Typography variant="caption" sx={{ color: '#9ca3af', fontWeight: 700, display: 'block' }}>{String(k).toUpperCase()}</Typography>
                            <Typography sx={{ fontWeight: 800, color: darkText.primary }}>{v}</Typography>
                          </Box>
                        ))}
                      </Box>
                      {s.materialsUsed && <Typography variant="body2" sx={{ color: darkText.secondary, mt: 1 }}>Materials: {s.materialsUsed}</Typography>}
                      {s.defectsFound && <Typography variant="body2" sx={{ color: '#c4441c', mt: 0.5 }}>Defects: {s.defectsFound}</Typography>}
                      {s.recommendations && <Typography variant="body2" sx={{ color: '#0288d1', mt: 0.5 }}>Recommendations: {s.recommendations}</Typography>}
                      {s.notes && <Typography variant="body2" sx={{ color: darkText.secondary, mt: 0.5 }}>{s.notes}</Typography>}
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {tab === 4 && (
              <Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 3 }}>
                  {profile?.documents.map((d) => (
                    <Box key={d.id} sx={{ border: '1px solid #eef0f4', borderRadius: 2, p: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <FolderOpenIcon sx={{ color: '#f57c00' }} />
                        <Typography sx={{ fontWeight: 700, color: darkText.primary, flexGrow: 1 }}>{d.name}</Typography>
                        <Chip label={d.docType} size="small" sx={{ bgcolor: '#f1f5f9', color: '#334155', fontWeight: 600 }} />
                        {d.sizeBytes && <Typography variant="caption" sx={{ color: '#9ca3af' }}>{(d.sizeBytes / 1024).toFixed(1)} KB</Typography>}
                        {d.filePath && (
                          <>
                            <Tooltip title="View"><IconButton size="small" sx={docIconSx} onClick={() => viewDoc(d)} disabled={docBusy === d.id}><VisibilityIcon fontSize="small" /></IconButton></Tooltip>
                            <Tooltip title="Download"><IconButton size="small" sx={docIconSx} onClick={() => downloadDoc(d)} disabled={docBusy === d.id}><DownloadIcon fontSize="small" /></IconButton></Tooltip>
                          </>
                        )}
                        <IconButton size="small" sx={docIconSx} onClick={() => extractDoc(d)} disabled={extractingId === d.id} title="Extract & auto-match"><AutoAwesomeIcon fontSize="small" /></IconButton>
                        <IconButton size="small" sx={docIconSx} onClick={() => del(`/customers/${c.id}/documents/${d.id}`)}><DeleteIcon fontSize="small" /></IconButton>
                      </Box>
                      <Typography variant="caption" sx={{ color: '#9ca3af' }}>{fmt(d.uploadedAt)}{d.uploadedBy ? ` · ${d.uploadedBy}` : ''}</Typography>
                      {extractingId === d.id && <CircularProgress size={16} sx={{ mt: 1, color: '#f57c00' }} />}
                      {extractOut && extractingId === '' && confirmingId !== d.id && (
                        <Box sx={{ mt: 1.5, border: '1px solid #ff8a0033', borderRadius: 2, bgcolor: '#ff8a0008', p: 1.5 }}>
                          <Typography variant="subtitle2" sx={{ color: '#ff8a00', fontWeight: 800, mb: 0.75 }}>Extracted & auto-matched</Typography>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1 }}>
                            {extractOut.companyName && <Chip size="small" label={`Supplier: ${extractOut.companyName}`} sx={{ bgcolor: '#ffffff', fontWeight: 700 }} />}
                            {extractOut.invoiceNo && <Chip size="small" label={`Inv ${extractOut.invoiceNo}`} sx={{ bgcolor: '#ffffff', fontWeight: 600 }} />}
                            {extractOut.amount && <Chip size="small" label={extractOut.amount} sx={{ bgcolor: '#ffffff', fontWeight: 600 }} />}
                            {extractOut.date && <Chip size="small" label={extractOut.date} sx={{ bgcolor: '#ffffff', fontWeight: 600 }} />}
                            {extractOut.vatNo && <Chip size="small" label={`VAT ${extractOut.vatNo}`} sx={{ bgcolor: '#ffffff', fontWeight: 600 }} />}
                            {extractOut.invoiceNo && extractOut.amount && (
                              <Button size="small" variant="contained" disabled={confirmingId === d.id} onClick={() => confirmMatch(d, extractOut.matches?.[0]?.customerId ?? 0)} sx={{ bgcolor: '#ff8a00', '&:hover': { bgcolor: '#f57c00' } }}>
                                {confirmingId === d.id ? 'Linking…' : 'Link supplier'}
                              </Button>
                            )}
                          </Box>
                          {!!extractOut.matches?.length && (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                              {extractOut.matches.slice(0, 3).map((m) => (
                                <Box key={m.customerId} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <CheckCircleIcon sx={{ color: '#2e7d32', fontSize: 15 }} />
                                  <Typography variant="caption" sx={{ color: darkText.primary, fontWeight: 600 }}>{m.companyName}</Typography>
                                  <Typography variant="caption" sx={{ color: '#9ca3af' }}>match {m.score}%</Typography>
                                </Box>
                              ))}
                            </Box>
                          )}
                        </Box>
                      )}
                    </Box>
                  ))}
                  {(profile?.documents.length ?? 0) === 0 && <Typography variant="body2" sx={{ color: darkText.secondary }}>No documents yet — upload below.</Typography>}
                  {docErr && <Typography variant="caption" sx={{ color: '#d32f2f', fontWeight: 700 }}>{docErr}</Typography>}
                </Box>

                <Typography variant="h6" sx={{ mb: 1, color: darkText.primary, fontSize: 15 }}>Upload document</Typography>
                <Box
                  component="form"
                  sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}
                  onSubmit={(e) => {
                    e.preventDefault()
                    const fd = new FormData()
                    const f = fileInput.current?.files?.[0]
                    if (f) fd.append('File', f)
                    fd.append('Name', docName || f?.name || 'Document')
                    fd.append('DocType', docType)
                    fd.append('UploadedBy', 'admin')
                    setSaving('doc')
                    setDocMsg('')
                    api.post(`/customers/${c.id}/documents`, fd).then(async () => {
                      await load()
                      onChanged()
                      setDocName('')
                      setDocType('ServiceReport')
                      setDocFile(null)
                      if (fileInput.current) fileInput.current.value = ''
                      setDocMsg('Uploaded.')
                    }).catch((x: any) => {
                      setDocMsg(x?.response?.data?.message ?? x?.response?.data?.title ?? 'Document upload failed — check the file and try again.')
                    }).finally(() => setSaving(''))
                  }}
                >
                  <Button variant="outlined" component="label" sx={{ borderColor: '#e5e7eb', color: darkText.primary }}>
                    {docFile ? docFile.name : 'Choose file…'}
                    <input ref={fileInput} hidden type="file" onChange={(e) => setDocFile(e.target.files?.[0] ?? null)} />
                  </Button>
                  <TextField size="small" label="Name" value={docName} onChange={(e) => setDocName(e.target.value)} sx={{ width: 180 }} />
                  <FormControl size="small" sx={{ minWidth: 150 }}>
                    <InputLabel>Type</InputLabel>
                    <Select label="Type" value={docType} onChange={(e) => setDocType(e.target.value)}>{DOC_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}</Select>
                  </FormControl>
                  <Button type="submit" variant="contained" disabled={busy('doc')}>Upload</Button>
                </Box>
                {docMsg && (
                  <Typography variant="caption" sx={{ display: 'block', mt: 1, color: docMsg === 'Uploaded.' ? '#2e7d32' : '#d32f2f', fontWeight: 700 }}>
                    {docMsg}
                  </Typography>
                )}
              </Box>
            )}

            {tab === 5 && (
              <Box>
                <Typography variant="h6" sx={{ mt: 1, mb: 2, color: darkText.primary, fontSize: 15 }}>Everything that's ever happened for {c.customerId}</Typography>
                <Box sx={{ position: 'relative', pl: 3, '&::before': { content: '""', position: 'absolute', left: 7, top: 4, bottom: 4, width: 2, bgcolor: '#f0f2f6' } }}>
                  {timeline.length === 0 && <Typography variant="body2" sx={{ color: darkText.secondary }}>No activity yet.</Typography>}
                  {timeline.map((e, i) => (
                    <Box key={`${e.type}-${e.refId}-${i}`} sx={{ position: 'relative', mb: 2 }}>
                      <Box sx={{ position: 'absolute', left: -26, top: 5, width: 14, height: 14, borderRadius: '50%', bgcolor: TIMELINE_COLORS[e.type] ?? '#6b7280', border: '2px solid #ffffff', boxShadow: '0 0 0 2px #eef0f4' }} />
                      <Typography variant="caption" sx={{ color: '#9ca3af', fontWeight: 700 }}>{fmt(e.date)}</Typography>
                      <Typography sx={{ fontWeight: 700, color: darkText.primary, fontSize: 14 }}>{e.title}</Typography>
                      {e.details && <Typography variant="body2" sx={{ color: darkText.secondary }}>{e.details}</Typography>}
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {tab === 6 && (
              <Box>
                <Typography variant="body2" sx={{ color: darkText.secondary, mb: 2 }}>
                  Field-level audit trail — who changed what, when, and why. The customer ID never changes; merges and overrides are recorded here.
                </Typography>
                {(profile?.fieldAudits.length ?? 0) === 0 && <Typography variant="body2" sx={{ color: darkText.secondary }}>No field changes recorded yet.</Typography>}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {profile?.fieldAudits.map((a) => (
                    <Box key={a.id} sx={{ border: '1px solid #eef0f4', borderRadius: 2, p: 1.5 }}>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                        <Chip size="small" label={a.field} sx={{ bgcolor: '#12121a', color: '#fff', fontFamily: 'monospace', fontWeight: 700, fontSize: 11 }} />
                        <Typography variant="caption" sx={{ color: '#9ca3af', fontWeight: 700 }}>{fmt(a.createdAt)} · {a.userName} · {a.role}/{a.department}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                        {a.before != null && (
                          <Box sx={{ bgcolor: '#fee2e2', color: '#b91c1c', px: 1, py: 0.5, borderRadius: 1, fontSize: 12, fontWeight: 600, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{a.before}</Box>
                        )}
                        {a.after != null && (
                          <Box sx={{ bgcolor: '#dcfce7', color: '#15803d', px: 1, py: 0.5, borderRadius: 1, fontSize: 12, fontWeight: 600, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{a.after}</Box>
                        )}
                      </Box>
                      {a.reason && <Typography variant="caption" sx={{ color: '#6b7280', display: 'block', mt: 0.75 }}>Reason: {a.reason}</Typography>}
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {tab === 7 && (
              <Box>
                <Typography variant="body2" sx={{ color: darkText.secondary, mb: 2 }}>
                  Every job card filed under {c.customerId} — one customer, one ID.
                </Typography>
                {jobs.length === 0 && <Typography variant="body2" sx={{ color: darkText.secondary }}>No jobs filed under this customer yet.</Typography>}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {jobs.map((j) => (
                    <Box key={j.id} sx={{ border: '1px solid #eef0f4', borderRadius: 2, p: 1.5, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                      <Typography sx={{ fontWeight: 800, color: '#FF3D00', fontSize: 13, fontFamily: 'monospace' }}>{j.jobNumber}</Typography>
                      <Typography sx={{ fontWeight: 700, color: darkText.primary, fontSize: 14, flexGrow: 1 }}>{j.title}</Typography>
                      <Chip size="small" label={j.status} sx={{ fontWeight: 700 }} />
                      <Typography variant="caption" sx={{ color: '#9ca3af' }}>{fmt(j.plannedStart)}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {tab === 8 && (
              <Box>
                <Typography variant="body2" sx={{ color: darkText.secondary, mb: 2 }}>
                  Every quotation filed under {c.customerId} — one customer, one ID.
                </Typography>
                {quotes.length === 0 && <Typography variant="body2" sx={{ color: darkText.secondary }}>No quotations filed under this customer yet.</Typography>}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {quotes.map((q) => (
                    <Box key={q.id} sx={{ border: '1px solid #eef0f4', borderRadius: 2, p: 1.5, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                      <Typography sx={{ fontWeight: 800, color: '#FF3D00', fontSize: 13, fontFamily: 'monospace' }}>{q.quotationNumber}</Typography>
                      <Typography sx={{ fontWeight: 700, color: darkText.primary, fontSize: 14, flexGrow: 1 }}>{q.title}</Typography>
                      <Chip size="small" label={q.status} sx={{ fontWeight: 700 }} />
                      <Typography variant="body2" sx={{ fontWeight: 800, color: '#035a3f' }}>
                        US${Number(q.total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </DialogContent>

          <DialogActions sx={{ px: 3, py: 1.5 }}>
            <Typography variant="caption" sx={{ color: '#9ca3af', flexGrow: 1 }}>
              {c.mergedIntoCustomerId ? `MERGED INTO ${c.mergedIntoCustomerId} — edit the master record instead.` : 'Customer ID is permanent.'}
            </Typography>
          </DialogActions>

          {/* admin merge */}
          <Dialog open={mergeOpen} onClose={() => setMergeOpen(false)} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1 }}>
              <CallMergeIcon fontSize="small" sx={{ color: '#d32f2f' }} /> Merge {c.customerId} into another record
            </DialogTitle>
            <DialogContent dividers>
              <Alert severity="warning" sx={{ mb: 2 }}>
                This permanently closes {c.customerId} ({c.name}). Contacts, sites, notes, services, documents and audit history move to the master record. The customer ID is never reused.
              </Alert>
              <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                <InputLabel>Master record (keeps its ID)</InputLabel>
                <Select label="Master record (keeps its ID)" value={mergeTargetId} onChange={(e) => setMergeTargetId(e.target.value as number)}>
                  {allCustomers.filter((x) => x.id !== c.id && !x.mergedIntoCustomerId).map((x) => (
                    <MenuItem key={x.id} value={x.id}>{x.customerId} · {x.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField label="Reason * (saved in audit log)" value={mergeReason} onChange={(e) => setMergeReason(e.target.value)} fullWidth size="small" multiline minRows={2} />
              {mergeMsg && <Alert severity={mergeMsg.startsWith('Merged') || mergeMsg.includes('successfully') ? 'success' : 'error'} sx={{ mt: 1.5 }}>{mergeMsg}</Alert>}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setMergeOpen(false)} disabled={saving === 'merge'}>Cancel</Button>
              <Button variant="contained" color="error" onClick={doMerge} disabled={saving === 'merge'}>
                {saving === 'merge' ? 'Merging…' : 'Merge records'}
              </Button>
            </DialogActions>
          </Dialog>

          {/* document preview — no popup, rendered in-app */}
          <Dialog open={!!preview} onClose={closePreview} maxWidth="md" fullWidth>
            <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 1, color: '#0f0f13' }}>
              <FolderOpenIcon fontSize="small" sx={{ color: '#f57c00' }} />
              <Typography component="span" sx={{ fontWeight: 800, flexGrow: 1, fontSize: 16, wordBreak: 'break-all' }}>{preview?.name}</Typography>
              <IconButton size="small" sx={docIconSx} onClick={closePreview}><CloseIcon fontSize="small" /></IconButton>
            </DialogTitle>
            <DialogContent dividers sx={{ bgcolor: '#ffffff', minHeight: 280 }}>
              {preview?.kind === 'image' && (
                <Box component="img" src={preview.url} alt={preview.name} sx={{ display: 'block', maxWidth: '100%', maxHeight: '65vh', objectFit: 'contain', mx: 'auto' }} />
              )}
              {preview?.kind === 'pdf' && (
                <Box component="iframe" src={preview.url} title={preview.name} sx={{ width: '100%', height: '65vh', border: 'none', borderRadius: 1 }} />
              )}
              {preview?.kind === 'text' && (
                <Box component="pre" sx={{ m: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13, lineHeight: 1.6, color: '#0f0f13', fontFamily: '"Inter", monospace' }}>
                  {preview.text}
                </Box>
              )}
              {preview?.kind === 'unsupported' && (
                <Alert severity="info" sx={{ color: '#0f0f13' }}>
                  No inline preview for this file type — use Download to open it locally.
                </Alert>
              )}
            </DialogContent>
            <DialogActions sx={{ bgcolor: '#ffffff' }}>
              <Button startIcon={<DownloadIcon />} onClick={() => preview && downloadDoc(preview)} disabled={docBusy !== ''} sx={{ color: '#0f0f13', borderColor: '#e5e7eb' }} variant="outlined">
                Download
              </Button>
              <Button onClick={closePreview} sx={{ color: '#6b7280' }}>Close</Button>
            </DialogActions>
          </Dialog>
        </>
      )}
      {printable.node}
    </Dialog>
  )
}

const inputLightSx = {
  '& .MuiOutlinedInput-root': { bgcolor: '#ffffff' },
  '& .MuiInputBase-input': { color: '#0f0f13' },
  '& .MuiInputLabel-root': { color: '#6b7280' },
  '& .MuiInputLabel-root.Mui-focused': { color: '#FF3D00' },
  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e5e7eb' },
  '& .MuiSvgIcon-root': { color: '#6b7280' },
}
