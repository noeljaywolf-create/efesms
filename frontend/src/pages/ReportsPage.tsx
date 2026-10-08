import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import PrintIcon from '@mui/icons-material/Print'
import { api } from '../api/client'
import { useTablePrint } from '../components/print'
import type { EngineOutput } from '../types/fireops'

const BRAND = {
  orange: '#FF3D00',
  orangeSoft: '#fff3ed',
  panel: '#ffffff',
  soft: '#f5f7fb',
  border: '#edf1f5',
  text: '#111827',
  muted: '#6b7280',
}

type Metric = { label: string; value: string; detail: string }
type Section = {
  key: string
  title: string
  hint: string
  cols: string[]
  rows: any[]
  // how to render a row into cells + a title for the detail dialog
  cells: (r: any) => string[]
  detailTitle: (r: any) => string
}

const fmtD = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—')
const money = (n?: number | null) => (n != null ? `$ ${Number(n).toFixed(2)}` : '—')

export default function ReportsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [insp, setInsp] = useState<any[]>([])
  const [maint, setMaint] = useState<any[]>([])
  const [refill, setRefill] = useState<any[]>([])
  const [jobs, setJobs] = useState<any[]>([])
  const [quotes, setQuotes] = useState<any[]>([])
  const [inventory, setInventory] = useState<any[]>([])
  const [equipment, setEquipment] = useState<any[]>([])
  const [invoices, setInvoices] = useState<any[]>([])
  const [ai, setAi] = useState<EngineOutput | null>(null)
  const [selected, setSelected] = useState<{ section: Section; row: any } | null>(null)
  const printable = useTablePrint()

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [i, m, r, j, q, inv, eq, invc, a] = await Promise.all([
        api.get<any>('/operations/inspections'),
        api.get<any>('/operations/maintenance'),
        api.get<any>('/operations/refills'),
        api.get<any>('/operations/jobs'),
        api.get<any>('/operations/quotations'),
        api.get<any>('/operations/inventory'),
        api.get<any>('/operations/equipment'),
        api.get<any>('/operations/invoices'),
        api.post<EngineOutput>('/operations/analyze/full', {}).catch(() => ({ data: null as any })),
      ])
      setInsp(i.data || [])
      setMaint(m.data || [])
      setRefill(r.data || [])
      setJobs(j.data || [])
      setQuotes(q.data || [])
      setInventory(inv.data || [])
      setEquipment(eq.data || [])
      setInvoices(invc.data || [])
      if (a.data) setAi(a.data)
    } catch (e: any) {
      setError(e?.message || 'Failed to load reports.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const sections: Section[] = useMemo(() => {
    const openJobs = jobs.filter((j) => !['Completed', 'Closed', 'Cancelled'].includes(j.status))
    const lowStock = inventory.filter((x) => x.currentStock <= x.reorderLevel)
    const unpaid = invoices.filter((x) => x.status !== 'Paid')
    const reminders = ai?.reminders ?? []
    const overdueRem = reminders.filter((x) => x.daysUntilDue < 0)
    const riskByEq: Record<number, any> = {}
    ;(ai?.riskAssessments ?? []).forEach((x) => { riskByEq[x.equipmentId] = x })
    const riskyEq = equipment.filter((e) => {
      const r = riskByEq[e.id]
      return r && (r.severity === 'High' || r.severity === 'Critical')
    })
    return [
      {
        key: 'jobs', title: 'Job cards', hint: `${openJobs.length} open of ${jobs.length}`,
        cols: ['Job', 'Customer', 'Type', 'Status', 'Technician'],
        rows: jobs,
        cells: (j) => [j.jobNumber, j.customerName ?? j.customerNumber ?? '—', j.jobType, j.status, j.technicianName ?? 'Unassigned'],
        detailTitle: (j) => `${j.jobNumber} — ${j.title}`,
      },
      {
        key: 'quotes', title: 'Quotations', hint: `${quotes.length} quotes`,
        cols: ['Quote', 'Customer', 'Total', 'Status', 'Job'],
        rows: quotes,
        cells: (q) => [q.quotationNumber, q.customerName ?? q.customerNumber ?? '—', money(q.total), q.status, q.convertedJobNumber ?? '—'],
        detailTitle: (q) => `${q.quotationNumber} — ${q.title}`,
      },
      {
        key: 'services', title: 'Services (inspections · maintenance · refills)', hint: `${insp.length + maint.length + refill.length} records`,
        cols: ['Type', 'Date', 'Customer', 'Unit', 'Cost'],
        rows: [
          ...insp.map((x) => ({ ...x, _t: 'Inspection', _d: x.date || x.inspectionDate })),
          ...maint.map((x) => ({ ...x, _t: `Maintenance (${x.workType ?? 'work'})`, _d: x.date || x.workDate })),
          ...refill.map((x) => ({ ...x, _t: `Refill (${x.agentType ?? 'agent'})`, _d: x.date || x.refillDate })),
        ],
        cells: (x) => [x._t, fmtD(x._d), x.customerName ?? '—', x.equipmentName ?? '—', money(x.cost)],
        detailTitle: (x) => `${x._t} — ${fmtD(x._d)}`,
      },
      {
        key: 'inventory', title: 'Inventory — needs restocking', hint: `${lowStock.length} low`,
        cols: ['Item', 'Stock', 'Restock at', 'Customer'],
        rows: lowStock,
        cells: (x) => [x.name, String(x.currentStock), String(x.reorderLevel), x.customerName ?? '—'],
        detailTitle: (x) => x.name,
      },
      {
        key: 'equipment', title: 'Equipment — high/critical risk', hint: `${riskyEq.length} units`,
        cols: ['Unit', 'Category', 'Risk', 'Next service'],
        rows: riskyEq,
        cells: (e) => {
          const r = riskByEq[e.id]
          return [`${e.equipmentNumber} · ${e.name}`, e.category, r ? `${Math.round(r.riskScore)} · ${r.severity}` : '—', fmtD(e.nextServiceDue)]
        },
        detailTitle: (e) => `${e.equipmentNumber} · ${e.name}`,
      },
      {
        key: 'invoices', title: 'Invoices — unpaid', hint: `${unpaid.length} open`,
        cols: ['Invoice', 'Customer', 'Amount', 'Status', 'Due'],
        rows: unpaid,
        cells: (x) => [x.invoiceNumber ?? `#${x.id}`, x.customerName ?? x.customerNumber ?? '—', money(x.amount), x.status, fmtD(x.dueDate)],
        detailTitle: (x) => `${x.invoiceNumber ?? `#${x.id}`} — ${money(x.amount)}`,
      },
      {
        key: 'reminders', title: 'Reminders — overdue', hint: `${overdueRem.length} overdue`,
        cols: ['Category', 'Message', 'Severity', 'Due'],
        rows: overdueRem,
        cells: (x) => [x.category, x.message, x.severity, fmtD(x.dueDate)],
        detailTitle: (x) => `${x.category} — ${x.severity}`,
      },
    ]
  }, [jobs, quotes, insp, maint, refill, inventory, equipment, invoices, ai])

  const metrics: Metric[] = useMemo(() => {
    const out: Metric[] = []
    const push = (label: string, value: string, detail: string) => out.push({ label, value, detail })
    const totalCost =
      (insp as any[]).reduce((s, r) => s + Number(r.cost || 0), 0) +
      (maint as any[]).reduce((s, r) => s + Number(r.cost || 0), 0) +
      (refill as any[]).reduce((s, r) => s + Number(r.cost || 0), 0)
    push('Inspections on record', String(insp.length), 'service inspections logged')
    push('Maintenance records', String(maint.length), 'all service history')
    push('Refills logged', String(refill.length), 'agent refill events')
    push('Total service spend', '$ ' + totalCost.toFixed(2), 'inspection + maintenance + refill cost')
    push('Job cards', String(jobs.length), 'across all statuses')
    push('Quotations', String(quotes.length), 'draft → sent → accepted → job')
    push('Unpaid invoices', String(invoices.filter((x) => x.status !== 'Paid').length), 'need follow-up')
    push('Overdue reminders', String((ai?.reminders ?? []).filter((x) => x.daysUntilDue < 0).length), 'need attention now')
    return out
  }, [insp, maint, refill, jobs, quotes, invoices, ai])

  const doPrint = useCallback(() => {
    printable.print({
      title: 'Reports & Documents',
      subtitle: metrics.map((m) => `${m.label}: ${m.value}`).join(' · '),
      cols: [{ label: 'Section' }, { label: 'Item' }, { label: 'Detail' }, { label: 'Detail' }, { label: 'Detail' }],
      rows: sections.flatMap((s) => s.rows.map((r) => [s.title, ...s.cells(r)])),
      groupBy: 0,
      note: 'Click any row in the app for full details. Snapshot across jobs, quotations, services, inventory, equipment, invoices and reminders.',
    })
  }, [metrics, sections, printable])

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress /></Box>
  if (error) return <Alert severity="warning" sx={{ mx: 2, mt: 2 }}>{error}</Alert>

  return (
    <Box sx={{ p: 2, bgcolor: BRAND.soft, minHeight: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: BRAND.text }}>Reports</Typography>
          <Typography variant="caption" sx={{ color: BRAND.muted }}>Live data from every register — click any row for details.</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            size="small"
            startIcon={<RefreshIcon />}
            variant="outlined"
            onClick={() => load()}
            sx={{ borderColor: '#d9dee7', color: BRAND.text, '&:hover': { borderColor: BRAND.orange, color: BRAND.orange } }}
          >
            Refresh
          </Button>
          <Button
            size="small"
            startIcon={<PrintIcon />}
            variant="contained"
            onClick={doPrint}
            sx={{ bgcolor: BRAND.orange, '&:hover': { bgcolor: '#e53d00' } }}
          >
            Print / export
          </Button>
        </Stack>
      </Box>

      <Stack direction="row" spacing={2} useFlexGap sx={{ mb: 3, flexWrap: 'wrap' }}>
        {metrics.map((k) => (
          <Paper
            key={k.label}
            variant="outlined"
            sx={{
              px: 2,
              py: 1.75,
              minWidth: 210,
              flex: '1 1 180px',
              borderColor: BRAND.border,
              borderRadius: 3,
              bgcolor: k.label.includes('spend') ? BRAND.orangeSoft : BRAND.panel,
              boxShadow: '0 8px 22px rgba(15, 23, 42, 0.03)',
            }}
          >
            <Typography variant="caption" sx={{ color: BRAND.muted, fontWeight: 700 }}>{k.label}</Typography>
            <Typography variant="h6" sx={{ fontWeight: 800, color: BRAND.text }}>{k.value}</Typography>
            <Typography variant="caption" sx={{ color: BRAND.muted }}>{k.detail}</Typography>
          </Paper>
        ))}
      </Stack>

      {sections.map((s) => (
        <Paper key={s.key} variant="outlined" sx={{ overflow: 'hidden', borderRadius: 3, borderColor: BRAND.border, boxShadow: '0 10px 26px rgba(15, 23, 42, 0.04)', mb: 2.5 }}>
          <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid #eef0f4', display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography sx={{ fontWeight: 800, color: BRAND.text, flexGrow: 1 }}>{s.title}</Typography>
            <Chip size="small" label={s.hint} sx={{ bgcolor: '#fff3ed', color: BRAND.orange, fontWeight: 700 }} />
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#fafbff' }}>
                  {s.cols.map((c) => (
                    <TableCell key={c} sx={{ fontWeight: 800, color: BRAND.text }}>{c}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {s.rows.length === 0 && (
                  <TableRow><TableCell colSpan={s.cols.length} sx={{ color: '#9ca3af', fontStyle: 'italic', textAlign: 'center', py: 3 }}>Nothing to report here.</TableCell></TableRow>
                )}
                {s.rows.slice(0, 25).map((r, i) => (
                  <TableRow
                    key={`${s.key}-${r.id ?? i}`}
                    hover
                    onClick={() => setSelected({ section: s, row: r })}
                    sx={{ cursor: 'pointer', '&:hover': { bgcolor: '#fff8f5' } }}
                  >
                    {s.cells(r).map((c, j) => (
                      <TableCell key={j} sx={{ color: j === 0 ? BRAND.orange : BRAND.text, fontWeight: j === 0 ? 800 : 400 }}>{c}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {s.rows.length > 25 && (
            <Typography variant="caption" sx={{ display: 'block', px: 2, py: 1, color: BRAND.muted }}>Showing 25 of {s.rows.length} — use Print for the full list.</Typography>
          )}
        </Paper>
      ))}

      <Dialog open={!!selected} onClose={() => setSelected(null)} fullWidth maxWidth="sm" slotProps={{ paper: { sx: { bgcolor: '#fff', borderRadius: 3 } } }}>
        <DialogTitle sx={{ fontWeight: 800, color: BRAND.text, bgcolor: '#fff' }}>{selected ? selected.section.detailTitle(selected.row) : ''}</DialogTitle>
        <DialogContent dividers sx={{ bgcolor: '#fff' }}>
          {selected && Object.entries(selected.row as Record<string, any>)
            .filter(([k, v]) => !k.startsWith('_') && v != null && typeof v !== 'object').length === 0 && (
            <Typography variant="body2" sx={{ color: BRAND.muted, fontStyle: 'italic' }}>
              No displayable fields on this record.
            </Typography>
          )}
          {selected && Object.entries(selected.row as Record<string, any>)
            .filter(([k, v]) => !k.startsWith('_') && v != null && typeof v !== 'object')
            .map(([k, v]) => (
              <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.6, borderBottom: '1px dashed #eef0f4' }}>
                <Typography variant="caption" sx={{ color: BRAND.muted, fontWeight: 700, textTransform: 'capitalize' }}>
                  {k.replace(/([a-z0-9])([A-Z])/g, '$1 $2')}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: BRAND.text, textAlign: 'right', wordBreak: 'break-word' }}>
                  {/^\d{4}-\d{2}-\d{2}/.test(String(v)) && !/number|code|phone/i.test(k) ? fmtD(String(v)) : String(v)}
                </Typography>
              </Box>
            ))}
        </DialogContent>
      </Dialog>

      {printable.node}
    </Box>
  )
}
