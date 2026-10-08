import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControl, Grid, IconButton, InputLabel, MenuItem, Paper, Select, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
  useMediaQuery,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import RefreshIcon from '@mui/icons-material/Refresh'
import CloseIcon from '@mui/icons-material/Close'
import PrintIcon from '@mui/icons-material/Print'
import DownloadIcon from '@mui/icons-material/Download'
import DeleteIcon from '@mui/icons-material/Delete'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import { api } from '../api/client'
import CustomerIdField, { type CustomerMatch } from '../components/CustomerIdField'
import { lightFieldSx } from '../lib/fieldSx'
import { PRINT_LETTERHEAD_HTML, useTablePrint } from '../components/print'

const STATUSES = ['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired']
const STATUS_COLORS: Record<string, string> = {
  Draft: '#6b7280',
  Sent: '#0288d1',
  Accepted: '#2e7d32',
  Rejected: '#d32f2f',
  Expired: '#ff8f00',
}

interface QuoteLine {
  id?: number
  description: string
  quantity: number
  unitPrice: number
  lineTotal?: number
}

interface Quote {
  id: number
  quotationNumber: string
  customerId?: number | null
  customerNumber?: string | null
  customerName?: string | null
  siteId?: number | null
  title: string
  quoteDate: string
  expiryDate: string
  discountPercent: number
  taxPercent: number
  terms?: string | null
  status: string
  convertedJobId?: number | null
  convertedJobNumber?: string | null
  notes?: string | null
  lineCount: number
  subtotal: number
  discount: number
  tax: number
  total: number
  lines?: QuoteLine[]
  files?: QFile[]
  customerAddress?: string | null
  customerVat?: string | null
  customerTin?: string | null
  customerContact?: string | null
  customerEmailSnapshot?: string | null
  currency?: string | null
  companyVatNo?: string | null
  companyTinNo?: string | null
  bankName?: string | null
  bankBranch?: string | null
  bankAccountName?: string | null
  bankAccountNumber?: string | null
  bankAccountNumberZwg?: string | null
  documentRef?: string | null
  paymentTerms?: string | null
  validityText?: string | null
}

const apiErrorMessage = (error: any, fallback: string) => {
  const data = error?.response?.data
  if (typeof data?.message === 'string') return data.message
  if (typeof data?.detail === 'string') return data.detail
  if (typeof data?.title === 'string') return data.title
  if (typeof data?.error === 'string') return data.error
  if (typeof error?.message === 'string') return error.message
  return fallback
}

const money = (n?: number | null) => (n != null ? `US$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-')
const fmtD = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '-')
const toDateInput = (d: Date) => d.toISOString().slice(0, 10)

interface QFile {
  id: number
  name: string
  filePath?: string | null
  sizeBytes?: number | null
  uploadedAt: string
  uploadedBy?: string | null
}

interface QuoteExtractLine {
  description?: string | null
  quantity?: number | null
  unitPrice?: number | null
  amount?: number | null
}

interface QuoteExtract {
  quoteNumber?: string | null
  quoteDate?: string | null
  expiryDate?: string | null
  subtotal?: number | null
  discountPercent?: number | null
  discountAmount?: number | null
  taxPercent?: number | null
  taxAmount?: number | null
  total?: number | null
  vatNumber?: string | null
  tinNumber?: string | null
  title?: string | null
  customerName?: string | null
  matchedCustomerId?: number | null
  matchedCustomerNumber?: string | null
  matchScore?: number | null
  preview?: string | null
  documentCustomerName?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  lines?: QuoteExtractLine[] | null
  isConfidentMatch?: boolean
  companyName?: string | null
  attention?: string | null
  project?: string | null
  currency?: string | null
  paymentTerms?: string | null
  documentRef?: string | null
  customerAddress?: string | null
  customerVat?: string | null
  customerTin?: string | null
  customerContact?: string | null
  companyVatNo?: string | null
  companyTinNo?: string | null
  bankName?: string | null
  bankBranch?: string | null
  bankAccountName?: string | null
  bankAccountNumber?: string | null
  bankAccountNumberZwg?: string | null
  validityText?: string | null
  fields?: Record<string, string> | null
  storedFileId?: number | null
}

const QUOTE_CSS = `.ef-quote{font-family:Arial,Helvetica,sans-serif;color:#111827;background:#fff;max-width:760px;margin:0 auto;padding:24px}
.ef-quote .head{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #FF3D00;padding-bottom:12px;margin-bottom:14px}
.ef-quote h1{font-size:20px;margin:0}.ef-quote .sub{color:#6b7280;font-size:12px;margin:2px 0 0}
.ef-quote .num{font-size:20px;font-weight:800;color:#FF3D00;text-align:right;line-height:1.2}
.ef-quote .chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}
.ef-quote .chip{font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;border:1px solid #e5e7eb;background:#f8fafc}
.ef-quote table.lines{width:100%;border-collapse:collapse;margin:12px 0}
.ef-quote table.lines th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;text-align:left;padding:6px 8px;border-bottom:2px solid #e5e7eb}
.ef-quote table.lines td{font-size:13px;padding:6px 8px;border-bottom:1px solid #f0f2f6}
.ef-quote table.lines td.r,.ef-quote table.lines th.r{text-align:right}
.ef-quote .totals{width:280px;margin-left:auto}
.ef-quote .totals .row{display:flex;justify-content:space-between;padding:3px 0;font-size:13px}
.ef-quote .totals .grand{border-top:2px solid #FF3D00;margin-top:6px;padding-top:8px;font-weight:800;font-size:15px}
.ef-quote .notes{font-size:13px;white-space:pre-wrap;margin:8px 0 0}
.ef-quote .foot{margin-top:20px;border-top:1px solid #e5e7eb;padding-top:10px;display:flex;justify-content:space-between;font-size:11px;color:#6b7280}
@media print{.ef-quote{max-width:100%;padding:0}}`

const quoteCard = (q: Quote) => {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return (
    PRINT_LETTERHEAD_HTML +
    `<div class="head"><div><h1>Extreme Fire Equipment &amp; Services</h1><p class="sub">Quotation - Fire Protection &amp; Maintenance</p></div>` +
    `<div class="num">${esc(q.quotationNumber)}<br/><span class="sub">Quotation</span></div></div>` +
    `<div class="chips">${[q.status, fmtD(q.quoteDate), `Valid to ${fmtD(q.expiryDate)}`].map((c) => `<span class="chip">${esc(String(c))}</span>`).join('')}</div>` +
    `<table class="details" style="width:100%"><tr>` +
    `<td style="vertical-align:top;width:50%"><h3 style="margin:0 0 6px;font-size:13px">Customer</h3>` +
    `<p style="margin:0;font-size:13px"><strong>${esc(q.customerNumber ?? '-')}</strong>${q.customerName ? `<br/>${esc(q.customerName)}` : ''}</p></td>` +
    `<td style="vertical-align:top;width:50%"><h3 style="margin:0 0 6px;font-size:13px">Details</h3>` +
    `<p style="margin:0;font-size:13px">${esc(q.title)}<br/>Quote date: ${fmtD(q.quoteDate)}<br/>Expiry: ${fmtD(q.expiryDate)}</p></td>` +
    `</tr></table>` +
    `<table class="lines"><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Total</th></tr></thead><tbody>` +
    (q.lines ?? []).map((l) => `<tr><td>${esc(l.description)}</td><td class="r">${l.quantity}</td><td class="r">${money(l.unitPrice)}</td><td class="r">${money(l.lineTotal ?? l.quantity * l.unitPrice)}</td></tr>`).join('') +
    `</tbody></table>` +
    `<div class="totals">` +
    `<div class="row"><span>Subtotal</span><span>${money(q.subtotal)}</span></div>` +
    `<div class="row"><span>Discount (${q.discountPercent}%)</span><span>${money(q.discount)}</span></div>` +
    `<div class="row"><span>VAT (${q.taxPercent}%)</span><span>${money(q.tax)}</span></div>` +
    `<div class="row grand"><span>Total</span><span>${money(q.total)}</span></div>` +
    `</div>` +
    (q.terms ? `<p class="notes">${esc(q.terms)}</p>` : '') +
    `<div class="foot"><span>Generated ${new Date().toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span><span>Extreme Fire Design Inc</span></div>`
  )
}

export default function QuotationsPage() {
  const isMobile = useMediaQuery('(max-width: 700px)')
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [active, setActive] = useState<Quote | null>(null)
  const [acting, setActing] = useState(false)
  const printable = useTablePrint()

  const [qFiles, setQFiles] = useState<QFile[]>([])
  const [fileBusy, setFileBusy] = useState('')
  const [fileErr, setFileErr] = useState('')
  const [extracted, setExtracted] = useState<QuoteExtract | null>(null)
  // @ts-ignore unused ref kept for future file input
  const qFileInput = useRef<HTMLInputElement>(null)
  const [prefillFile, setPrefillFile] = useState<File | null>(null)
  const [prefillBusy, setPrefillBusy] = useState(false)
  const [prefillExtracted, setPrefillExtracted] = useState<QuoteExtract | null>(null)
  const [prefillMsg, setPrefillMsg] = useState('')

  const [form, setForm] = useState({
    title: '', customerNumber: '', customerName: '', customerPhone: '', customerEmail: '', customerAddress: '', customerVat: '', customerTin: '', customerContact: '',
    siteId: '',
    quoteDate: toDateInput(new Date()), expiryDate: toDateInput(new Date(Date.now() + 30 * 864e5)),
    discountPercent: '', taxPercent: '15.5', terms: '', notes: '',
    documentRef: '', currency: 'USD', paymentTerms: '', validityText: '',
    companyVatNo: '', companyTinNo: '', bankName: '', bankBranch: '', bankAccountName: '', bankAccountNumber: '', bankAccountNumberZwg: '',
  })
  const [customerMatch, setCustomerMatch] = useState<CustomerMatch | null>(null)
  const [lines, setLines] = useState<QuoteLine[]>([{ description: '', quantity: 1, unitPrice: 0 }])

  const role = localStorage.getItem('efesms_role') ?? ''
  const dept = localStorage.getItem('efesms_dept') ?? ''
  const canWrite = ['admin', 'administrator', 'management', 'technician', 'contracts manager', 'stores man'].includes((role || '').toLowerCase()) ||
    ['technical', 'operations', 'administration', 'contracts', 'stores'].includes((dept || '').toLowerCase())
  const isAdmin = ['admin', 'administrator'].includes((role || '').toLowerCase())

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.get<Quote[]>('/operations/quotations')
      setQuotes(r.data)
    } catch { setErr('Failed to load quotations') }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openDetail = async (q: Quote) => {
    setExtracted(null)
    setFileErr('')
    setQFiles([])
    try {
      const r = await api.get<Quote>(`/operations/quotations/${q.id}`)
      setActive(r.data)
      setQFiles((r.data as any).files ?? [])
    } catch {
      setActive(q)
    }
  }

  const loadFiles = async (quoteId: number) => {
    try {
      const r = await api.get<QFile[]>(`/operations/quotations/${quoteId}/files`)
      setQFiles(r.data)
    } catch { /* non-fatal */ }
  }

  const uploadQFile = async (file: File) => {
    if (!active) return
    setFileBusy('upload'); setFileErr('')
    try {
      const fd = new FormData()
      fd.append('File', file)
      fd.append('UploadedBy', localStorage.getItem('efesms_name') ?? 'user')
      await api.post(`/operations/quotations/${active.id}/files`, fd)
      await loadFiles(active.id)
    } catch (e: any) {
      setFileErr(apiErrorMessage(e, 'Upload failed'))
    }
    setFileBusy('')
  }

  const downloadQFile = async (f: QFile) => {
    if (!active) return
    setFileBusy(`d${f.id}`); setFileErr('')
    try {
      const { data } = await api.get(`/operations/quotations/${active.id}/files/${f.id}/download`, { responseType: 'blob' })
      const ext = (f.filePath ?? '').match(/\.[a-z0-9]+$/i)?.[0] ?? ''
      const fname = ext && !f.name.toLowerCase().endsWith(ext.toLowerCase()) ? `${f.name}${ext}` : f.name
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url; a.download = fname
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setFileErr(apiErrorMessage(e, 'Download failed'))
    }
    setFileBusy('')
  }

  const deleteQFile = async (f: QFile) => {
    if (!active) return
    setFileBusy(`x${f.id}`); setFileErr('')
    try {
      await api.delete(`/operations/quotations/${active.id}/files/${f.id}`)
      await loadFiles(active.id)
    } catch (e: any) {
      setFileErr(apiErrorMessage(e, 'Delete failed'))
    }
    setFileBusy('')
  }

  const deleteQuotation = async () => {
    if (!active) return
    if (!window.confirm(`Delete quotation ${active.quotationNumber}? This cannot be undone.`)) return
    setFileBusy('delQ'); setErr('')
    try {
      await api.delete(`/operations/quotations/${active.id}`)
      setActive(null); await load()
    } catch (e: any) { setErr(apiErrorMessage(e, 'Delete failed — admin only.')) }
    setFileBusy('')
  }

  const extractQFile = async (f: QFile) => {
    if (!active) return
    setFileBusy(`e${f.id}`); setFileErr(''); setExtracted(null)
    try {
      const r = await api.post(`/operations/quotations/${active.id}/files/${f.id}/extract`)
      setExtracted(r.data)
    } catch (e: any) {
      setFileErr(apiErrorMessage(e, 'Extract failed'))
    }
    setFileBusy('')
  }

  const applyExtracted = async () => {
    if (!active || !extracted) return
    setFileBusy('apply'); setFileErr('')
    try {
      const payload: Record<string, unknown> = {
        title: extracted.title ?? active.title,
        quoteDate: extracted.quoteDate ? new Date(extracted.quoteDate).toISOString() : undefined,
        expiryDate: extracted.expiryDate ? new Date(extracted.expiryDate).toISOString() : undefined,
        discountPercent: extracted.discountPercent ?? undefined,
        taxPercent: extracted.taxPercent ?? undefined,
        notes: extracted.total != null
          ? `Document${extracted.quoteNumber ? ` - ref ${extracted.quoteNumber}` : ''} - Total${extracted.total}`
          : active.notes ?? undefined,
      }
      // Only link an existing customer on a confident match - never a weak/wrong hit.
      if (extracted.isConfidentMatch && extracted.matchedCustomerNumber) {
        payload.customerNumber = extracted.matchedCustomerNumber
        payload.customerId = extracted.matchedCustomerId ?? null
      }
      if (extracted.lines && extracted.lines.length > 0) {
        payload.lines = extracted.lines
          .filter((l) => (l.description ?? '').trim() && (l.quantity ?? 0) > 0 && (l.unitPrice ?? 0) >= 0)
          .map((l) => ({ description: (l.description ?? '').trim(), quantity: Number(l.quantity) || 1, unitPrice: Number(l.unitPrice) || 0 }))
        if ((payload.lines as unknown[]).length === 0) delete payload.lines
      }
      await api.put(`/operations/quotations/${active.id}`, payload)
      const r = await api.get<Quote>(`/operations/quotations/${active.id}`)
      setActive(r.data)
      setExtracted(null)
    } catch (e: any) {
      setFileErr(apiErrorMessage(e, 'Could not apply - only Draft quotations can be updated.'))
    }
    setFileBusy('')
  }

  const handlePrefillFile = async (file: File) => {
    setPrefillFile(file)
    setPrefillExtracted(null)
    setPrefillMsg('')
    setPrefillBusy(true)
    try {
      const fd = new FormData()
      fd.append('File', file)
      const r = await api.post('/operations/quotations/extract', fd)
      setPrefillExtracted(r.data)
      setPrefillMsg('')
    } catch (e: any) {
      setPrefillMsg(apiErrorMessage(e, 'Could not read this file - PDF, DOCX or TXT only.'))
    }
    setPrefillBusy(false)
  }

  const extractToForm = (e: QuoteExtract) => {
    setForm((f) => ({
      ...f,
      title: e.title ?? f.title,
      quoteDate: e.quoteDate ?? f.quoteDate,
      expiryDate: e.expiryDate ?? f.expiryDate,
      discountPercent: e.discountPercent != null ? String(e.discountPercent) : f.discountPercent,
      taxPercent: e.taxPercent != null ? String(e.taxPercent) : f.taxPercent,
      customerPhone: e.phone ?? f.customerPhone,
      customerEmail: (e.email ?? (e as any).customerEmail ?? f.customerEmail) as string,
      customerAddress: (e.customerAddress ?? e.address ?? f.customerAddress) as string,
      customerVat: (e.customerVat ?? f.customerVat) as string,
      customerTin: (e.customerTin ?? f.customerTin) as string,
      customerContact: (e.customerContact ?? f.customerContact) as string,
      currency: (e.currency ?? f.currency) as string,
      companyVatNo: (e.companyVatNo ?? e.vatNumber ?? f.companyVatNo) as string,
      companyTinNo: (e.companyTinNo ?? e.tinNumber ?? f.companyTinNo) as string,
      bankName: (e.bankName ?? f.bankName) as string,
      bankBranch: (e.bankBranch ?? f.bankBranch) as string,
      bankAccountName: (e.bankAccountName ?? f.bankAccountName) as string,
      bankAccountNumber: (e.bankAccountNumber ?? (e.fields as any)?.bankAccountNumber ?? f.bankAccountNumber) as string,
      bankAccountNumberZwg: (e.bankAccountNumberZwg ?? (e.fields as any)?.bankAccountNumberZwg ?? f.bankAccountNumberZwg) as string,
      documentRef: (e.documentRef ?? e.quoteNumber ?? f.documentRef) as string,
      paymentTerms: (e.paymentTerms ?? f.paymentTerms) as string,
      validityText: (e.validityText ?? f.validityText) as string,
      customerName: '',
      customerNumber: '',
      notes: e.total != null
        ? `Document${e.quoteNumber ? ` - ref ${e.quoteNumber}` : ''} - total ${e.currency ?? 'USD'} ${e.total}`
        : f.notes,
    }))
    setCustomerMatch(null)
    if (e.isConfidentMatch && e.matchedCustomerNumber && e.matchedCustomerId) {
      setCustomerMatch({ id: e.matchedCustomerId, customerId: e.matchedCustomerNumber, name: e.customerName ?? '' })
      setForm((f) => ({ ...f, customerNumber: e.matchedCustomerNumber!, customerName: '', customerPhone: e.phone ?? f.customerPhone }))
    } else {
      // No confident match - use the name from the document so create makes a NEW customer.
      const newName = (e.documentCustomerName ?? e.customerName ?? '').trim()
      if (newName) setForm((f) => ({ ...f, customerName: newName, customerNumber: '' }))
      // Also prefill other customer fields from document when creating new customer
      const addr = (e.customerAddress ?? e.address ?? '').trim()
      if (addr) setForm((f2) => ({ ...f2, customerAddress: addr }))
      const cVat = (e.customerVat ?? '').trim()
      if (cVat) setForm((f2) => ({ ...f2, customerVat: cVat }))
      const cTin = (e.customerTin ?? '').trim()
      if (cTin) setForm((f2) => ({ ...f2, customerTin: cTin }))
      const cContact = (e.customerContact ?? '').trim()
      if (cContact) setForm((f2) => ({ ...f2, customerContact: cContact }))
      const cEmail = (e.email ?? (e as any).customerEmail ?? '').trim()
      if (cEmail) setForm((f2) => ({ ...f2, customerEmail: cEmail }))
    }
    if (e.lines && e.lines.length > 0) {
      const usable = e.lines.filter((l) => (l.description ?? '').trim())
      if (usable.length > 0) {
        setLines(usable.map((l) => ({
          description: (l.description ?? '').trim(),
          quantity: Number(l.quantity) || 1,
          unitPrice: Number(l.unitPrice) || 0,
        })))
      }
    }
  }

  const applyPrefill = () => {
    const e = prefillExtracted
    if (!e) return
    extractToForm(e)
    setPrefillMsg(e.isConfidentMatch
      ? `Applied to form - matched existing customer ${e.matchedCustomerNumber}.`
      : 'Applied to form - no existing customer match; will create a new customer from the document name.')
  }

  // One click: create the quotation (and attach the file) straight from the document.
  // @ts-ignore unused helper kept for one-click flow
  const createFromExtract = async () => {
    const e = prefillExtracted
    if (!e) return
    extractToForm(e)
    setSaving(true)
    setErr('')
    setPrefillMsg('')
    try {
      const extractedLines = (e.lines ?? []).filter((l) => (l.description ?? '').trim() && (Number(l.quantity) || 0) > 0)
      const bodyLines = extractedLines.length > 0
        ? extractedLines.map((l) => ({
            description: (l.description ?? '').trim(),
            quantity: Number(l.quantity) || 1,
            unitPrice: Number(l.unitPrice) || 0,
          }))
        : [{ description: (e.title ?? 'As per quoted document').trim(), quantity: 1, unitPrice: Number(e.subtotal ?? e.total ?? 0) || 1 }]
      const title = (e.title ?? prefillFile?.name ?? 'Quotation from document').trim()
      const customerNumber = e.isConfidentMatch && e.matchedCustomerNumber ? e.matchedCustomerNumber : null
      const customerName = customerNumber ? null : ((e.documentCustomerName ?? e.customerName ?? '').trim() || null)
      const r = await api.post('/operations/quotations', {
        title,
        customerId: e.isConfidentMatch ? (e.matchedCustomerId ?? null) : null,
        customerNumber,
        customerName,
        customerPhone: e.phone?.trim() || null,
        customerEmail: (e.email ?? (e as any).customerEmail)?.trim() || null,
        customerAddress: (e.customerAddress ?? e.address)?.trim() || null,
        customerVat: (e.customerVat ?? '').trim() || null,
        customerTin: (e.customerTin ?? '').trim() || null,
        customerContact: (e.customerContact ?? '').trim() || null,
        currency: e.currency?.trim() || null,
        companyVatNo: (e.companyVatNo ?? e.vatNumber)?.trim() || null,
        companyTinNo: (e.companyTinNo ?? e.tinNumber)?.trim() || null,
        bankName: e.bankName?.trim() || null,
        bankBranch: e.bankBranch?.trim() || null,
        bankAccountName: e.bankAccountName?.trim() || null,
        bankAccountNumber: (e.bankAccountNumber ?? (e.fields as any)?.bankAccountNumber)?.trim() || null,
        bankAccountNumberZwg: (e.bankAccountNumberZwg ?? (e.fields as any)?.bankAccountNumberZwg)?.trim() || null,
        documentRef: (e.documentRef ?? e.quoteNumber)?.trim() || null,
        paymentTerms: e.paymentTerms?.trim() || null,
        validityText: e.validityText?.trim() || null,
        siteId: null,
        quoteDate: e.quoteDate ? new Date(e.quoteDate).toISOString() : new Date().toISOString(),
        expiryDate: e.expiryDate ? new Date(e.expiryDate).toISOString() : new Date(Date.now() + 30 * 864e5).toISOString(),
        discountPercent: e.discountPercent ?? 0,
        taxPercent: e.taxPercent ?? 15.5,
        terms: null,
        notes: e.total != null
          ? `Created from document${e.quoteNumber ? ` - ref ${e.quoteNumber}` : ''} - total ${e.currency ?? 'USD'} ${e.total}`
          : 'Auto-created from uploaded document',
        lines: bodyLines,
      })
      if (r.data?.id) {
        await attachInboxFile(r.data.id, e.storedFileId)
      }
      setOpen(false)
      setForm({
        title: '', customerNumber: '', customerName: '', customerPhone: '', customerEmail: '', customerAddress: '', customerVat: '', customerTin: '', customerContact: '', siteId: '',
        quoteDate: toDateInput(new Date()), expiryDate: toDateInput(new Date(Date.now() + 30 * 864e5)),
        discountPercent: '', taxPercent: '15.5', terms: '', notes: '',
        documentRef: '', currency: 'USD', paymentTerms: '', validityText: '',
        companyVatNo: '', companyTinNo: '', bankName: '', bankBranch: '', bankAccountName: '', bankAccountNumber: '', bankAccountNumberZwg: '',
      })
      setCustomerMatch(null)
      setLines([{ description: '', quantity: 1, unitPrice: 0 }])
      setPrefillFile(null)
      setPrefillExtracted(null)
      setPrefillMsg('')
      await load()
      if (r.data?.id) {
        const fresh = await api.get<Quote>(`/operations/quotations/${r.data.id}`).catch(() => null)
        if (fresh?.data) setActive(fresh.data)
      }
    } catch (e2: any) {
      setErr(apiErrorMessage(e2, 'Could not create quotation from document'))
    }
    setSaving(false)
  }

  const attachInboxFile = async (quoteId: number, inboxFileId?: number | null) => {
    if (inboxFileId) {
      try {
        await api.post(`/operations/quotations/${quoteId}/files/attach-inbox`, { inboxFileId })
        return
      } catch { /* fall through to re-upload */ }
    }
    if (prefillFile) {
      const fd = new FormData()
      fd.append('File', prefillFile)
      fd.append('UploadedBy', localStorage.getItem('efesms_name') ?? 'user')
      await api.post(`/operations/quotations/${quoteId}/files`, fd).catch(() => { /* best-effort */ })
    }
  }

  const extractChips = (e: QuoteExtract) => (
    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', my: 1 }}>
      {e.quoteNumber && <Chip size="small" label={`Quote ${e.quoteNumber}`} sx={{ bgcolor: '#f1f5f9', color: '#374151', fontWeight: 600 }} />}
      {e.quoteDate && <Chip size="small" label={fmtD(e.quoteDate)} sx={{ bgcolor: '#f1f5f9', color: '#374151', fontWeight: 600 }} />}
      {e.expiryDate && <Chip size="small" label={`Valid to ${fmtD(e.expiryDate)}`} sx={{ bgcolor: '#f1f5f9', color: '#374151', fontWeight: 600 }} />}
      {e.currency && <Chip size="small" label={e.currency} sx={{ bgcolor: '#f1f5f9', color: '#374151', fontWeight: 600 }} />}
      {e.subtotal != null && <Chip size="small" label={`Subtotal ${money(e.subtotal)}`} sx={{ bgcolor: '#f1f5f9', color: '#374151', fontWeight: 600 }} />}
      {e.taxAmount != null && <Chip size="small" label={`VAT ${money(e.taxAmount)}`} sx={{ bgcolor: '#f1f5f9', color: '#374151', fontWeight: 600 }} />}
      {e.total != null && <Chip size="small" label={`Total ${money(e.total)}`} sx={{ bgcolor: '#f1f5f9', color: '#111827', fontWeight: 700 }} />}
      {(e.companyVatNo ?? e.vatNumber) && <Chip size="small" label={`VAT No. ${e.companyVatNo ?? e.vatNumber}`} variant="outlined" sx={{ color: '#374151', borderColor: '#e5e7eb', fontWeight: 600 }} />}
      {e.isConfidentMatch && e.matchedCustomerNumber ? (
        <Chip size="small" label={`Existing customer ${e.matchedCustomerNumber}`} sx={{ bgcolor: '#e8f5e9', color: '#1b5e20', fontWeight: 700 }} />
      ) : (e.documentCustomerName ?? e.customerName) ? (
        <Chip size="small" label={`New customer will be created: ${e.documentCustomerName ?? e.customerName}`} sx={{ bgcolor: '#fff3e0', color: '#e65100', fontWeight: 700 }} />
      ) : null}
    </Box>
  )

  const extractLinesTable = (e: QuoteExtract) => {
    if (!e.lines || e.lines.length === 0) return null
    return (
      <TableContainer sx={{ mt: 1, maxHeight: 180, border: '1px solid #eef0f4', borderRadius: 1 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 800 }}>Description</TableCell>
              <TableCell align="right" sx={{ fontWeight: 800 }}>Qty</TableCell>
              <TableCell align="right" sx={{ fontWeight: 800 }}>Unit</TableCell>
              <TableCell align="right" sx={{ fontWeight: 800 }}>Amount</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {e.lines.map((l, i) => (
              <TableRow key={i}>
                <TableCell>{l.description}</TableCell>
                <TableCell align="right">{l.quantity ?? 1}</TableCell>
                <TableCell align="right">{money(l.unitPrice)}</TableCell>
                <TableCell align="right">{money(l.amount ?? (l.quantity ?? 1) * (l.unitPrice ?? 0))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    )
  }

  const extractFieldsTable = (e: QuoteExtract) => {
    const entries = Object.entries(e.fields ?? {})
    if (entries.length === 0) return null
    return (
      <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 0.5 }}>
        {entries.map(([k, v]) => (
          <Typography key={k} variant="caption" sx={{ color: '#6b7280', wordBreak: 'break-word' }}>
            <strong style={{ color: '#0f0f13' }}>{k}</strong>: {v}
          </Typography>
        ))}
      </Box>
    )
  }

  const preview = useMemo(() => {
    const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0)
    const disc = subtotal * ((Number(form.discountPercent) || 0) / 100)
    const taxable = subtotal - disc
    const tax = taxable * ((Number(form.taxPercent) || 0) / 100)
    return { subtotal, disc, tax, total: taxable + tax }
  }, [lines, form.discountPercent, form.taxPercent])

  const linesValid = lines.length > 0 && lines.every((l) => l.description.trim() && Number(l.quantity) > 0 && Number(l.unitPrice) >= 0)

  const create = async () => {
    if (!form.title.trim()) { setErr('Quotation title is required.'); return }
    if (!linesValid) { setErr('Every line needs a description, quantity above zero, and a price.'); return }
    if (form.customerNumber.trim() && !customerMatch) {
      setErr(`Customer ${form.customerNumber.trim()} does not exist. Pick a suggestion or clear it to auto-generate.`)
      return
    }
    setSaving(true)
    setErr('')
    try {
      const r = await api.post('/operations/quotations', {
        title: form.title.trim(),
        customerId: null,
        customerNumber: form.customerNumber.trim() ? form.customerNumber.trim().toUpperCase() : null,
        customerName: form.customerName.trim() || null,
        customerPhone: form.customerPhone.trim() || null,
        customerEmail: form.customerEmail.trim() || null,
        customerAddress: form.customerAddress.trim() || null,
        customerVat: form.customerVat.trim() || null,
        customerTin: form.customerTin.trim() || null,
        customerContact: form.customerContact.trim() || null,
        currency: form.currency.trim() || null,
        companyVatNo: form.companyVatNo.trim() || null,
        companyTinNo: form.companyTinNo.trim() || null,
        bankName: form.bankName.trim() || null,
        bankBranch: form.bankBranch.trim() || null,
        bankAccountName: form.bankAccountName.trim() || null,
        bankAccountNumber: form.bankAccountNumber.trim() || null,
        bankAccountNumberZwg: form.bankAccountNumberZwg.trim() || null,
        documentRef: form.documentRef.trim() || null,
        paymentTerms: form.paymentTerms.trim() || null,
        validityText: form.validityText.trim() || null,
        siteId: form.siteId ? Number(form.siteId) : null,
        quoteDate: form.quoteDate ? new Date(form.quoteDate).toISOString() : null,
        expiryDate: form.expiryDate ? new Date(form.expiryDate).toISOString() : null,
        discountPercent: form.discountPercent === '' ? 0 : Number(form.discountPercent),
        taxPercent: form.taxPercent === '' ? 15.5 : Number(form.taxPercent),
        terms: form.terms.trim() || null,
        notes: form.notes.trim() || null,
        lines: lines.map((l) => ({ description: l.description.trim(), quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })),
      })
      if (r.data?.id) {
        const e = prefillExtracted
        await attachInboxFile(r.data.id, e?.storedFileId)
      }
      setOpen(false)
      setForm({
        title: '', customerNumber: '', customerName: '', customerPhone: '', customerEmail: '', customerAddress: '', customerVat: '', customerTin: '', customerContact: '', siteId: '',
        quoteDate: toDateInput(new Date()), expiryDate: toDateInput(new Date(Date.now() + 30 * 864e5)),
        discountPercent: '', taxPercent: '15.5', terms: '', notes: '',
        documentRef: '', currency: 'USD', paymentTerms: '', validityText: '',
        companyVatNo: '', companyTinNo: '', bankName: '', bankBranch: '', bankAccountName: '', bankAccountNumber: '', bankAccountNumberZwg: '',
      })
      setCustomerMatch(null)
      setLines([{ description: '', quantity: 1, unitPrice: 0 }])
      setPrefillFile(null)
      setPrefillExtracted(null)
      setPrefillMsg('')
      await load()
    } catch (e: any) {
      setErr(apiErrorMessage(e, 'Could not create quotation'))
    }
    setSaving(false)
  }

  const act = async (id: number, action: 'send' | 'accept' | 'reject') => {
    setActing(true)
    setErr('')
    try {
      const r = await api.post(`/operations/quotations/${id}/${action}`, {})
      setActive((a) => (a && a.id === id ? { ...a, status: r.data.status, convertedJobId: r.data.jobId ?? a.convertedJobId, convertedJobNumber: r.data.jobNumber ?? a.convertedJobNumber } : a))
      await load()
    } catch (e: any) {
      setErr(apiErrorMessage(e, `Could not ${action} quotation`))
    }
    setActing(false)
  }

  const visible = quotes.filter((q) => {
    if (statusFilter && q.status !== statusFilter) return false
    const s = query.trim().toLowerCase()
    if (!s) return true
    return [q.quotationNumber, q.title, q.customerNumber ?? '', q.customerName ?? '']
      .some((v) => (v ?? '').toLowerCase().includes(s))
  })

  return (
    <Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h4" sx={{ fontWeight: 900, color: '#f2f2f7', letterSpacing: '-0.02em' }}>Quotations</Typography>
          <Typography variant="body2" sx={{ color: '#6b7280' }}>
            {loading ? 'Loading-' : `${quotes.length} quotes - draft - sent - accepted - job`}
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<PrintIcon />} disabled={visible.length === 0} onClick={() => printable.print({
          title: 'Quotations',
          subtitle: `${visible.length} quotes`,
          cols: [{ label: 'Quote' }, { label: 'Customer' }, { label: 'Date' }, { label: 'Expiry' }, { label: 'Status' }, { label: 'Total', align: 'r' }],
          rows: visible.map((q) => [q.quotationNumber, q.customerNumber ?? '-', fmtD(q.quoteDate), fmtD(q.expiryDate), q.status, money(q.total)]),
          groupBy: 4,
        })} sx={{ borderRadius: 2 }}>Print</Button>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={load} sx={{ borderRadius: 2 }}>Refresh</Button>
        {canWrite && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)} sx={{ borderRadius: 2, bgcolor: '#FF3D00', '&:hover': { bgcolor: '#C42A00' } }}>
            New quotation
          </Button>
        )}
      </Box>

      {err && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr('')}>{err}</Alert>}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <TextField
          label="Search by quote, customer ID, or customer"
          size="small"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          sx={{ flexGrow: 1, minWidth: 220, ...lightFieldSx }}
        />
        <FormControl size="small" sx={{ minWidth: 150, ...lightFieldSx, bgcolor: '#ffffff', borderRadius: 2, '& .MuiSelect-select': { color: '#0f0f13' } }}>
          <InputLabel>Status</InputLabel>
          <Select label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} sx={{ '& .MuiSelect-select': { color: '#0f0f13' } }}>
            <MenuItem value="">All</MenuItem>
            {STATUSES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      {isMobile && <Typography variant="caption" sx={{ display: 'block', mb: 0.75, color: 'text.secondary' }}>Scroll horizontally to see all quotation details.</Typography>}
      <TableContainer component={Paper} elevation={0} sx={{ overflowX: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2.5, bgcolor: '#ffffff', boxShadow: '0 10px 34px rgba(0,0,0,0.35)' }}>
        <Table size={isMobile ? 'small' : 'medium'} sx={{ minWidth: isMobile ? 720 : 'auto', '& th, & td': { whiteSpace: 'nowrap' } }}>
          <TableHead>
            <TableRow sx={{ '& th': { bgcolor: '#fafafc', fontWeight: 800, color: '#0f0f13', borderBottom: '1px solid #eef0f4' } }}>
              <TableCell>Quote</TableCell>
              <TableCell>Status</TableCell>
              {!isMobile && <TableCell>Expiry</TableCell>}
              <TableCell align="right">Total</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visible.length === 0 && (
              <TableRow><TableCell colSpan={4} sx={{ textAlign: 'center', color: '#374151', py: 4 }}>{quotes.length === 0 ? 'No quotations yet.' : 'No quotes match this search.'}</TableCell></TableRow>
            )}
            {visible.map((q) => (
              <TableRow key={q.id} hover onClick={() => openDetail(q)} sx={{ cursor: 'pointer', '&:hover': { bgcolor: '#fff7f2 !important' } }}>
                <TableCell>
                  <Typography sx={{ fontWeight: 800, color: '#FF3D00', fontSize: 13, fontFamily: 'monospace' }}>{q.quotationNumber}</Typography>
                  <Typography sx={{ fontWeight: 700, color: '#0f0f13', fontSize: 14 }}>{q.title}</Typography>
                  <Typography variant="caption" sx={{ color: '#374151' }}>{q.customerNumber ?? '-'}{q.customerName ? ` - ${q.customerName}` : ''} - {fmtD(q.quoteDate)}</Typography>
                  {(q.convertedJobNumber || q.convertedJobId) && (
                    <Typography variant="caption" sx={{ color: '#2e7d32', fontWeight: 800, display: 'block' }}>- Job {q.convertedJobNumber ?? `#${q.convertedJobId}`} created</Typography>
                  )}
                </TableCell>
                <TableCell><Chip size="small" label={q.status} sx={{ bgcolor: `${STATUS_COLORS[q.status] ?? '#6b7280'}18`, color: STATUS_COLORS[q.status] ?? '#6b7280', fontWeight: 800 }} /></TableCell>
                {!isMobile && <TableCell><Typography variant="caption" sx={{ color: '#6b7280' }}>{fmtD(q.expiryDate)}</Typography></TableCell>}
                <TableCell align="right"><Typography sx={{ fontWeight: 800, color: '#035a3f', fontSize: 14 }}>{money(q.total)}</Typography></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {active && (
        <Dialog open onClose={() => setActive(null)} fullWidth maxWidth="md" fullScreen={isMobile} slotProps={{ paper: { sx: { bgcolor: '#fff', borderRadius: isMobile ? 0 : 3 } } }}>
          <DialogTitle sx={{ fontWeight: 800, color: '#0f0f13', bgcolor: '#fff', pr: { xs: 14, sm: 16 } }}>
            {active.quotationNumber} - {active.title}
            <Box sx={{ position: 'absolute', right: 70, top: 12, display: 'flex', gap: 0.5 }}>
              <IconButton onClick={() => printable.print({
                title: active.quotationNumber,
                subtitle: `${active.customerNumber ?? '-'}${active.customerName ? ` - ${active.customerName}` : ''} - {active.lines?.length ?? 0} items`,
                cols: [{ label: 'Description' }, { label: 'Qty', align: 'r' }, { label: 'Unit Price', align: 'r' }, { label: 'Line Total', align: 'r' }],
                rows: (active.lines ?? []).map((l) => [l.description, String(l.quantity), money(l.unitPrice), money(l.lineTotal ?? l.quantity * l.unitPrice)]),
                groupBy: -1,
                note: `Subtotal ${money(active.subtotal)} - Discount ${money(active.discount)} - Tax ${money(active.tax)} - Total ${money(active.total)}`,
              })} sx={{ color: '#9aa0b0', '&:hover': { color: '#FF3D00' }} }>
                <PrintIcon />
              </IconButton>
              <IconButton onClick={() => setActive(null)} sx={{ position: 'absolute', right: 12, top: 12, color: '#9aa0b0' }}>
                <CloseIcon />
              </IconButton>
            </Box>
          </DialogTitle>
           <DialogContent dividers sx={{ bgcolor: '#fff' }}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              <Chip size="small" label={active.status} sx={{ bgcolor: `${STATUS_COLORS[active.status] ?? '#6b7280'}18`, color: STATUS_COLORS[active.status] ?? '#6b7280', fontWeight: 800 }} />
              <Chip size="small" label={`${active.customerNumber ?? '-'}${active.customerName ? ` - ${active.customerName}` : ''}`} sx={{ bgcolor: '#f1f5f9', color: '#374151', fontWeight: 700 }} />
              <Chip size="small" label={`Valid to ${fmtD(active.expiryDate)}`} sx={{ bgcolor: '#f1f5f9', color: '#374151', fontWeight: 700 }} />
              {(active.convertedJobNumber || active.convertedJobId) && <Chip size="small" label={`Job ${active.convertedJobNumber ?? `#${active.convertedJobId}`}`} sx={{ bgcolor: '#2e7d3218', color: '#2e7d32', fontWeight: 800 }} />}
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 800, color: '#6b7280' } }}>
                    <TableCell>Description</TableCell>
                    <TableCell align="right">Qty</TableCell>
                    <TableCell align="right">Unit price</TableCell>
                    <TableCell align="right">Line total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {(active.lines ?? []).map((l, i) => (
                    <TableRow key={l.id ?? i}>
                      <TableCell>{l.description}</TableCell>
                      <TableCell align="right">{l.quantity}</TableCell>
                      <TableCell align="right">{money(l.unitPrice)}</TableCell>
                      <TableCell align="right">{money(l.lineTotal ?? l.quantity * l.unitPrice)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
              <Box sx={{ width: '100%', maxWidth: '100%' }}>
                {([['Subtotal', active.subtotal], ['Discount', active.discount], ['Tax (15% default)', active.tax]] as [string, number][]).map(([k, v]) => (
                  <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.3 }}>
                    <Typography variant="body2" sx={{ color: '#6b7280' }}>{k}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{money(v)}</Typography>
                  </Box>
                ))}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #FF3D00', mt: 1, pt: 1 }}>
                  <Typography sx={{ fontWeight: 900 }}>Total</Typography>
                  <Typography sx={{ fontWeight: 900, color: '#035a3f' }}>{money(active.total)}</Typography>
                </Box>
              </Box>
            </Box>
            {active.terms && <Typography variant="body2" sx={{ mt: 2, color: '#374151', whiteSpace: 'pre-wrap' }}>{active.terms}</Typography>}
            {active.notes && <Typography variant="caption" sx={{ mt: 1, display: 'block', color: '#374151' }}>{active.notes}</Typography>}

            <Box className="ef-no-print" sx={{ display: 'flex', gap: 1, mt: 3, flexWrap: 'wrap' }}>
              <Button variant="outlined" size="small" startIcon={<DownloadIcon />}
                onClick={async () => {
                  const { downloadAsPdf } = await import('../lib/docDownload')
                  await downloadAsPdf(`<div class="ef-quote">${quoteCard(active)}</div>`, QUOTE_CSS, active.quotationNumber)
                }}
                sx={{ borderRadius: 2, color: '#0f0f13', borderColor: '#e5e7eb' }}>
                Download PDF
              </Button>
              <Button variant="outlined" size="small" startIcon={<DownloadIcon />}
                onClick={async () => {
                  const { downloadAsDoc } = await import('../lib/docDownload')
                  await downloadAsDoc(`<div class="ef-quote">${quoteCard(active)}</div>`, QUOTE_CSS, active.quotationNumber)
                }}
                sx={{ borderRadius: 2, color: '#0f0f13', borderColor: '#e5e7eb' }}>
                Download DOC
              </Button>
            </Box>

            <Box className="ef-no-print" sx={{ mt: 3, borderTop: '1px solid #eef0f4', pt: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#0f0f13', mb: 1 }}>
                Documents & auto-extract ({qFiles.length})
              </Typography>
              {fileErr && <Alert severity="error" sx={{ mb: 1 }} onClose={() => setFileErr('')}>{fileErr}</Alert>}
              {canWrite && (
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 1.5 }}>
                  <Button size="small" variant="outlined" component="label" disabled={fileBusy === 'upload'} sx={{ borderRadius: 2, color: '#0f0f13', borderColor: '#e5e7eb' }}>
                    {fileBusy === 'upload' ? 'Uploading-' : 'Upload document'}
                    <input
                      hidden type="file"
                      accept=".pdf,.docx,.doc,.txt,.csv"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadQFile(f); e.target.value = '' }}
                    />
                  </Button>
                  <Typography variant="caption" sx={{ color: '#374151' }}>PDF - DOCX - TXT - then Extract reads the file</Typography>
                </Box>
              )}
              {qFiles.map((f) => (
                <Box key={f.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, border: '1px solid #eef0f4', borderRadius: 2, px: 1.5, py: 1, mb: 1, flexWrap: 'wrap' }}>
                  <Typography sx={{ fontWeight: 700, color: '#0f0f13', fontSize: 13, flexGrow: 1, wordBreak: 'break-all' }}>{f.name}</Typography>
                  {f.sizeBytes != null && <Typography variant="caption" sx={{ color: '#374151' }}>{(f.sizeBytes / 1024).toFixed(1)} KB</Typography>}
                  <Typography variant="caption" sx={{ color: '#374151' }}>{fmtD(f.uploadedAt)}</Typography>
                  <IconButton size="small" sx={{ color: '#4b5563', '&:hover': { color: '#FF3D00', bgcolor: '#FF3D0014' } }} disabled={fileBusy !== ''} onClick={() => void downloadQFile(f)} title="Download">
                    <DownloadIcon fontSize="small" />
                  </IconButton>
                  {canWrite && (
                    <IconButton size="small" sx={{ color: '#4b5563', '&:hover': { color: '#FF3D00', bgcolor: '#FF3D0014' } }} disabled={fileBusy !== ''} onClick={() => void extractQFile(f)} title="Extract info from file">
                      <AutoAwesomeIcon fontSize="small" />
                    </IconButton>
                  )}
                  {canWrite && (
                    <IconButton size="small" sx={{ color: '#4b5563', '&:hover': { color: '#d32f2f', bgcolor: '#d32f2f14' } }} disabled={fileBusy !== ''} onClick={() => void deleteQFile(f)} title="Delete">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>
              ))}
              {qFiles.length === 0 && <Typography variant="caption" sx={{ color: '#374151' }}>No documents attached yet.</Typography>}
              {extracted && (
                <Box sx={{ mt: 1.5, border: '1px solid #ff8a0033', borderRadius: 2, bgcolor: '#ff8a0008', p: 1.5 }}>
                  <Typography variant="subtitle2" sx={{ color: '#ff8a00', fontWeight: 800, mb: 0.5 }}>Document</Typography>
                  {extractChips(extracted)}
                  {extractLinesTable(extracted)}
                  {extractFieldsTable(extracted)}
                  {extracted.preview && (
                    <Typography variant="caption" sx={{ color: '#6b7280', display: 'block', mb: 1, maxHeight: 60, overflow: 'hidden' }}>
                      {extracted.preview}
                    </Typography>
                  )}
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Button size="small" variant="contained" disabled={fileBusy === 'apply' || active.status !== 'Draft'} onClick={() => void applyExtracted()}
                      sx={{ bgcolor: '#ff8a00', '&:hover': { bgcolor: '#f57c00' } }}>
                      {fileBusy === 'apply' ? 'Applying-' : active.status !== 'Draft' ? 'Apply (Draft only)' : 'Apply to quotation'}
                    </Button>
                    {!extracted.isConfidentMatch && (extracted.documentCustomerName ?? extracted.customerName) && active.status === 'Draft' && (
                      <Typography variant="caption" sx={{ color: '#ff8a00', fontWeight: 700, alignSelf: 'center' }}>
                        No existing customer match - apply keeps this quote on a new customer name from the document.
                      </Typography>
                    )}
                    <Button size="small" onClick={() => setExtracted(null)} sx={{ color: '#6b7280' }}>Dismiss</Button>
                  </Box>
                </Box>
              )}
            </Box>
          </DialogContent>
          {canWrite && (active.status === 'Draft' || active.status === 'Sent') && (
            <DialogActions sx={{ px: 3, pb: 2, gap: 1, flexWrap: 'wrap', '& .MuiButton-root': { flexGrow: { xs: 1, sm: 0 } } }}>
              {active.status === 'Draft' && <Button disabled={acting} onClick={() => act(active.id, 'send')} sx={{ borderRadius: 2 }}>Send</Button>}
              <Button disabled={acting} onClick={() => act(active.id, 'reject')} sx={{ borderRadius: 2 }} color="error">Reject</Button>
              <Button disabled={acting} variant="contained" onClick={() => act(active.id, 'accept')} sx={{ borderRadius: 2, bgcolor: '#2e7d32', '&:hover': { bgcolor: '#1b5e20' } }}>
                {acting ? 'Working-' : 'Accept - create job'}
              </Button>
            </DialogActions>
          )}
          {isAdmin && (
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button color="error" variant="outlined" disabled={fileBusy==='delQ'} onClick={() => void deleteQuotation()} sx={{ borderRadius: 2 }}>{fileBusy==='delQ' ? 'Deleting…' : 'Delete quotation (admin)'}</Button>
            </DialogActions>
          )}
        </Dialog>
      )}

        <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md" fullScreen={isMobile} slotProps={{ paper: { sx: { bgcolor: '#fff', borderRadius: isMobile ? 0 : 3 } } }}>
        <DialogTitle sx={{ fontWeight: 800, color: '#0f0f13', bgcolor: '#fff' }}>New quotation</DialogTitle>
        <DialogContent sx={{ bgcolor: '#fff' }}>
          {err && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr('')}>{err}</Alert>}
          <Box sx={{ border: '1px dashed #e5e7eb', borderRadius: 2, p: 2, mb: 1, bgcolor: '#fafbfc' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#0f0f13', mb: 0.5 }}>Upload quote document to auto-fill</Typography>
            <Typography variant="caption" sx={{ color: '#6b7280', display: 'block', mb: 1 }}>
              Upload the quotation PDF and enter the basic info. The file will be stored and shown with the quotation.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <Button size="small" variant="outlined" component="label" sx={{ borderRadius: 2, color: '#0f0f13', borderColor: '#e5e7eb' }}>
                {prefillFile ? 'Change file' : 'Choose file'}
                <input hidden type="file" accept=".pdf,.docx,.doc,.txt,.csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handlePrefillFile(f); e.target.value = '' }} />
              </Button>
              {prefillFile && <Chip size="small" label={prefillFile.name} sx={{ bgcolor: '#f1f5f9', color: '#374151', fontWeight: 600 }} />}
              {prefillBusy && <Typography variant="caption" sx={{ color: '#6b7280' }}>Reading file...</Typography>}
            </Box>
            {prefillMsg && (
              <Typography variant="caption" sx={{ display: 'block', mt: 1, color: prefillMsg.startsWith('Applied') ? '#2e7d32' : '#374151' }}>
                {prefillMsg}
              </Typography>
            )}
            {prefillExtracted && (
              <Box sx={{ mt: 1 }}>
                {extractChips(prefillExtracted)}
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
                  <Button size="small" variant="contained" onClick={applyPrefill} sx={{ bgcolor: '#FF3D00', '&:hover': { bgcolor: '#C42A00' } }}>
                    Apply to form
                  </Button>
                  <Button size="small" variant="outlined" onClick={() => { setPrefillExtracted(null); setPrefillMsg('Will just attach on Create - fill form manually'); }} sx={{ borderRadius: 2 }}>
                    Just attach on Create
                  </Button>
                </Box>
              </Box>
            )}
          </Box>
          <Box sx={{ display: 'grid', gap: 2, mt: 1 }}>
            <TextField label="Title *" fullWidth value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} size="small" helperText="e.g. Supply of Fire Equipment" sx={lightFieldSx} />
            <TextField label="Quote # (as on document)" size="small" value={form.documentRef} onChange={(e) => setForm({ ...form, documentRef: e.target.value })} helperText="e.g. 26/01160" sx={lightFieldSx} />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0f0f13' }}>Customer</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
              <CustomerIdField
                value={form.customerNumber}
                match={customerMatch}
                onChange={(v) => setForm({ ...form, customerNumber: v })}
                onMatch={setCustomerMatch}
                label="Customer ID (leave blank for new)"
                sx={lightFieldSx}
              />
              <TextField label="Customer name *" size="small" value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} helperText="e.g. Flow Logic" sx={lightFieldSx} />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
              <TextField label="Quote date" type="date" size="small" slotProps={{ inputLabel: { shrink: true } }} value={form.quoteDate} onChange={(e) => setForm({ ...form, quoteDate: e.target.value })} sx={lightFieldSx} />
              <TextField label="Expiry date *" type="date" size="small" slotProps={{ inputLabel: { shrink: true } }} value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} sx={lightFieldSx} />
            </Box>
            <TextField label="Customer address" fullWidth size="small" value={form.customerAddress} onChange={(e) => setForm({ ...form, customerAddress: e.target.value })} helperText="Optional - as on the quote" sx={lightFieldSx} />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
              <TextField label="Terms" size="small" value={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.value })} sx={lightFieldSx} />
              <TextField label="Notes" size="small" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} sx={lightFieldSx} />
            </Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, mt: 1 }}>Line items *</Typography>
            {lines.map((l, i) => (
              <Grid container spacing={1} key={i} sx={{ alignItems: 'center' }}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField label="Description *" fullWidth size="small" value={l.description} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} sx={lightFieldSx} />
                </Grid>
                <Grid size={{ xs: 5, sm: 2 }}>
                  <TextField label="Qty *" type="number" fullWidth size="small" value={l.quantity} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)))} sx={lightFieldSx} />
                </Grid>
                <Grid size={{ xs: 5, sm: 3 }}>
                  <TextField label="Unit price *" type="number" fullWidth size="small" value={l.unitPrice} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, unitPrice: Number(e.target.value) } : x)))} sx={lightFieldSx} />
                </Grid>
                <Grid size={{ xs: 2, sm: 1 }} sx={{ textAlign: 'right' }}>
                  <IconButton size="small" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))} sx={{ color: '#d32f2f', p: 1.5 }}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Grid>
              </Grid>
            ))}
            <Button size="small" variant="outlined" onClick={() => setLines([...lines, { description: '', quantity: 1, unitPrice: 0 }])} sx={{ borderRadius: 2, alignSelf: 'start' }}>
              Add line
            </Button>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Box sx={{ width: '100%', maxWidth: '100%' }}>
                {([['Subtotal', preview.subtotal], ['Discount', preview.disc], ['Tax', preview.tax]] as [string, number][]).map(([k, v]) => (
                  <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.3 }}>
                    <Typography variant="body2" sx={{ color: '#6b7280' }}>{k}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>{money(v)}</Typography>
                  </Box>
                ))}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #FF3D00', mt: 1, pt: 1 }}>
                  <Typography sx={{ fontWeight: 900 }}>Total</Typography>
                  <Typography sx={{ fontWeight: 900, color: '#035a3f' }}>{money(preview.total)}</Typography>
                </Box>
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpen(false)} sx={{ borderRadius: 2 }}>Cancel</Button>
          <Button variant="contained" disabled={saving || !form.title.trim() || !linesValid} onClick={create} sx={{ borderRadius: 2, bgcolor: '#FF3D00', '&:hover': { bgcolor: '#C42A00' } }}>
            {saving ? 'Saving-' : 'Create draft'}
          </Button>
        </DialogActions>
      </Dialog>

      {printable.node}
    </Box>
  )
}

