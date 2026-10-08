import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
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
  useMediaQuery,
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import PrintIcon from '@mui/icons-material/Print'
import { api } from '../api/client'
import { useTablePrint } from '../components/print'

const BRAND = {
  orange: '#FF3D00',
  amber: '#ff8a00',
  panel: '#ffffff',
  panelAlt: '#fff7f3',
  soft: '#f8fafc',
  border: '#eef0f4',
  text: '#111827',
  muted: '#6b7280',
  green: '#2e7d32',
  red: '#d32f2f',
  blue: '#0288d1',
}

const TYPE_COLORS: Record<string, string> = {
  inspection: '#0288d1',
  maintenance: '#ff8a00',
  refill: '#2e7d32',
}

const STATUS_COLORS: Record<string, string> = {
  Completed: '#2e7d32',
  Scheduled: '#0288d1',
  Pending: '#ff8a00',
  InProgress: '#ff8a00',
  Failed: '#d32f2f',
}

type ServiceRecord = {
  id: string
  type: 'inspection' | 'maintenance' | 'refill'
  typeLabel: string
  date: string
  customer?: string
  equipment?: string
  technician?: string
  cost: number
  status: string
  details: string
  agentType?: string | null
  unitType?: string | null
  taskQuantity?: number | null
  jobNumber?: string | null
}

export default function ServicesPage() {
  const isMobile = useMediaQuery('(max-width: 700px)')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [inspections, setInspections] = useState<ServiceRecord[]>([])
  const [maintenance, setMaintenance] = useState<ServiceRecord[]>([])
  const [refills, setRefills] = useState<ServiceRecord[]>([])
  const [selected, setSelected] = useState<ServiceRecord | null>(null)
  const printable = useTablePrint()

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [inspectionRes, maintenanceRes, refillRes] = await Promise.all([
        api.get<any>('/operations/inspections'),
        api.get<any>('/operations/maintenance'),
        api.get<any>('/operations/refills'),
      ])
      setInspections((inspectionRes.data || []).map((r: any) => ({
        id: r.id,
        type: 'inspection' as const,
        date: r.date || r.inspectionDate || r.createdAt,
        customer: r.customerName || r.customer?.name,
        equipment: r.equipmentName || r.equipment?.name || r.equipmentSerial,
        technician: r.technicianName || r.technician?.name,
        agentType: r.agentType,
        unitType: r.unitType,
        taskQuantity: r.taskQuantity,
        jobNumber: r.jobNumber,
        cost: Number(r.cost || 0),
        status: r.status || r.result || 'Pending',
        details: r.notes || r.findings || r.details || 'Inspection record',
      })))
      setMaintenance((maintenanceRes.data || []).map((r: any) => ({
        id: r.id,
        type: 'maintenance' as const,
        date: r.date || r.workDate || r.createdAt,
        customer: r.customerName || r.customer?.name,
        equipment: r.equipmentName || r.equipment?.name || r.equipmentSerial,
        technician: r.technicianName || r.technician?.name,
        agentType: r.agentType,
        unitType: r.unitType,
        taskQuantity: r.taskQuantity,
        jobNumber: r.jobNumber,
        cost: Number(r.cost || 0),
        status: r.status || 'Scheduled',
        details: r.notes || r.findings || r.details || 'Maintenance record',
      })))
      setRefills((refillRes.data || []).map((r: any) => ({
        id: r.id,
        type: 'refill' as const,
        date: r.date || r.refillDate || r.createdAt,
        customer: r.customerName || r.customer?.name,
        equipment: r.equipmentName || r.equipment?.name || r.equipmentSerial,
        technician: r.technicianName || r.technician?.name,
        agentType: r.agentType,
        unitType: r.unitType,
        taskQuantity: r.taskQuantity,
        jobNumber: r.jobNumber,
        cost: Number(r.cost || 0),
        status: r.status || 'Completed',
        details: r.notes || r.details || 'Refill record',
      })))
    } catch (e: any) {
      setError(e?.message || 'Failed to load services data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const allRecords = useMemo(() => [
    ...inspections.map(r => ({ ...r, typeLabel: 'Inspection' })),
    ...maintenance.map(r => ({ ...r, typeLabel: 'Maintenance' })),
    ...refills.map(r => ({ ...r, typeLabel: 'Refill' })),
  ], [inspections, maintenance, refills])

  const totalCost = useMemo(() => allRecords.reduce((sum, r) => sum + r.cost, 0), [allRecords])

  const metrics = useMemo(() => [
    { label: 'Inspections', value: String(inspections.length), detail: 'service inspections logged' },
    { label: 'Maintenance', value: String(maintenance.length), detail: 'preventive and corrective work' },
    { label: 'Refills', value: String(refills.length), detail: 'agent refill events' },
    { label: 'Service spend', value: `$ ${totalCost.toFixed(2)}`, detail: 'inspection + maintenance + refill cost' },
  ], [inspections.length, maintenance.length, refills.length, totalCost])

  const doPrint = useCallback(() => {
    printable.print({
      title: 'Services Activity',
      subtitle: `${inspections.length} inspections · ${maintenance.length} maintenance · ${refills.length} refills`,
      cols: [
        { label: 'Type' },
        { label: 'Date' },
        { label: 'Customer' },
        { label: 'Equipment' },
        { label: 'Agent type' },
        { label: 'Unit type' },
        { label: 'Quantity' },
        { label: 'Technician' },
        { label: 'Cost (USD)' },
        { label: 'Status' },
      ],
      rows: allRecords.map((r) => [
        r.typeLabel,
        new Date(r.date).toLocaleDateString(),
        r.customer || '—',
        r.equipment || '—',
        r.agentType || 'Type not recorded',
        r.unitType || r.equipment || 'Unit type not recorded',
        String(r.taskQuantity ?? 1),
        r.technician || '—',
        `$ ${r.cost.toFixed(2)}`,
        r.status,
      ]),
    })
  }, [inspections.length, maintenance.length, refills.length, printable, allRecords])

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress /></Box>
  if (error) return <Alert severity="warning" sx={{ mx: 2, mt: 2 }}>{error}</Alert>

  return (
    <Box sx={{ p: 2, bgcolor: '#f5f7fb', minHeight: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: BRAND.text }}>Services</Typography>
          <Typography variant="caption" sx={{ color: BRAND.muted }}>Operational activity across inspections, maintenance, and refills.</Typography>
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
        {metrics.map((item) => (
          <Paper
            key={item.label}
            variant="outlined"
            sx={{
              px: 2,
              py: 1.75,
              minWidth: 210,
              flex: '1 1 180px',
              borderColor: '#e9edf3',
              borderRadius: 3,
              bgcolor: item.label === 'Service spend' ? BRAND.panelAlt : BRAND.panel,
              boxShadow: '0 6px 18px rgba(15, 23, 42, 0.03)',
            }}
          >
            <Typography variant="caption" sx={{ color: BRAND.muted, fontWeight: 700 }}>{item.label}</Typography>
            <Typography variant="h6" sx={{ fontWeight: 800, color: BRAND.text }}>{item.value}</Typography>
            <Typography variant="caption" sx={{ color: BRAND.muted }}>{item.detail}</Typography>
          </Paper>
        ))}
      </Stack>

      <Paper variant="outlined" sx={{ overflow: 'hidden', borderRadius: 3, borderColor: BRAND.border, boxShadow: '0 10px 26px rgba(15, 23, 42, 0.04)' }}>
        <Box component="div" ref={printable.node as any} sx={{ p: 1.5, bgcolor: BRAND.panel }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#fafbff' }}>
                  <TableCell sx={{ fontWeight: 800, color: BRAND.text }}>Type</TableCell>
                  <TableCell sx={{ fontWeight: 800, color: BRAND.text }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 800, color: BRAND.text }}>Customer</TableCell>
                  {!isMobile && <TableCell sx={{ fontWeight: 800, color: BRAND.text }}>Equipment</TableCell>}
                  <TableCell sx={{ fontWeight: 800, color: BRAND.text }}>Agent</TableCell>
                  {!isMobile && <TableCell sx={{ fontWeight: 800, color: BRAND.text }}>Unit type</TableCell>}
                  <TableCell sx={{ fontWeight: 800, color: BRAND.text }}>Qty</TableCell>
                  {!isMobile && <TableCell sx={{ fontWeight: 800, color: BRAND.text }}>Technician</TableCell>}
                  <TableCell sx={{ fontWeight: 800, color: BRAND.text }}>Cost</TableCell>
                  <TableCell sx={{ fontWeight: 800, color: BRAND.text }}>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {allRecords.map((r, index) => {
                  const isSelected = selected?.id === r.id && selected?.type === r.type
                  return (
                    <TableRow
                      key={`${r.type}-${r.id}-${index}`}
                      sx={{
                        cursor: 'pointer',
                        bgcolor: isSelected ? '#fff3ed' : 'transparent',
                        borderLeft: isSelected ? `4px solid ${BRAND.orange}` : '4px solid transparent',
                        '&:hover': { bgcolor: isSelected ? '#ffe8de' : '#fff8f5' },
                      }}
                      onClick={() => setSelected(r)}
                    >
                      <TableCell>
                        <Chip
                          size="small"
                          label={r.typeLabel}
                          sx={{
                            bgcolor: isSelected ? `${TYPE_COLORS[r.type] ?? '#9ca3af'}1a` : `${TYPE_COLORS[r.type] ?? '#9ca3af'}14`,
                            color: TYPE_COLORS[r.type] ?? '#4b5563',
                            fontWeight: 700,
                            border: `1px solid ${TYPE_COLORS[r.type] ?? '#9ca3af'}55`,
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ color: BRAND.text }}>{new Date(r.date).toLocaleDateString()}</TableCell>
                      <TableCell sx={{ color: BRAND.text }}>{r.customer || '—'}</TableCell>
                      {!isMobile && <TableCell sx={{ color: BRAND.text }}>{r.equipment || '—'}</TableCell>}
                      <TableCell sx={{ color: BRAND.text }}>{r.agentType || 'Type not recorded'}</TableCell>
                      {!isMobile && <TableCell sx={{ color: BRAND.text }}>{r.unitType || r.equipment || '—'}</TableCell>}
                      <TableCell sx={{ color: BRAND.text }}>{r.taskQuantity ?? 1}</TableCell>
                      {!isMobile && <TableCell sx={{ color: BRAND.text }}>{r.technician || '—'}</TableCell>}
                      <TableCell sx={{ color: BRAND.text, fontWeight: 700 }}>$ {r.cost.toFixed(2)}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={r.status}
                          sx={{
                            bgcolor: isSelected ? `${STATUS_COLORS[r.status] ?? '#6b7280'}22` : `${STATUS_COLORS[r.status] ?? '#6b7280'}14`,
                            color: STATUS_COLORS[r.status] ?? '#374151',
                            fontWeight: 700,
                            border: `1px solid ${STATUS_COLORS[r.status] ?? '#6b7280'}55`,
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </Paper>

      {selected && (
        <Dialog
          open
          onClose={() => setSelected(null)}
          maxWidth="md"
          fullWidth
          fullScreen={isMobile}
          sx={{
            '& .MuiDialog-paper': {
              bgcolor: '#12121a',
              color: '#f2f2f7',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 18px 48px rgba(0,0,0,0.45)',
            },
          }}
        >
          <DialogTitle sx={{ fontWeight: 800, color: '#f2f2f7', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{selected.typeLabel} Details</DialogTitle>
          <DialogContent dividers sx={{ borderColor: 'rgba(255,255,255,0.08)', color: '#f2f2f7' }}>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Typography variant="body1" sx={{ color: '#f2f2f7' }}><strong>Type:</strong> {selected.typeLabel}</Typography>
              <Typography variant="body1" sx={{ color: '#f2f2f7' }}><strong>Date:</strong> {new Date(selected.date).toLocaleString()}</Typography>
              <Typography variant="body1" sx={{ color: '#f2f2f7' }}><strong>Customer:</strong> {selected.customer || '—'}</Typography>
              <Typography variant="body1" sx={{ color: '#f2f2f7' }}><strong>Equipment:</strong> {selected.equipment || '—'}</Typography>
              <Typography variant="body1" sx={{ color: '#f2f2f7' }}><strong>Agent type:</strong> {selected.agentType || '—'}</Typography>
              <Typography variant="body1" sx={{ color: '#f2f2f7' }}><strong>Unit type:</strong> {selected.unitType || selected.equipment || '—'}</Typography>
              <Typography variant="body1" sx={{ color: '#f2f2f7' }}><strong>Quantity on job line:</strong> {selected.taskQuantity ?? 1}</Typography>
              <Typography variant="body1" sx={{ color: '#f2f2f7' }}><strong>Job card:</strong> {selected.jobNumber || 'Manual service record'}</Typography>
              <Typography variant="body1" sx={{ color: '#f2f2f7' }}><strong>Technician:</strong> {selected.technician || '—'}</Typography>
              <Typography variant="body1" sx={{ color: '#f2f2f7' }}><strong>Cost:</strong> $ {selected.cost.toFixed(2)}</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body1" sx={{ fontWeight: 700, color: '#f2f2f7' }}>Status:</Typography>
                <Chip
                  size="small"
                  label={selected.status}
                  sx={{
                    bgcolor: `${STATUS_COLORS[selected.status] ?? '#6b7280'}22`,
                    color: '#f2f2f7',
                    fontWeight: 700,
                    border: `1px solid ${STATUS_COLORS[selected.status] ?? '#6b7280'}55`,
                  }}
                />
              </Box>
              <Typography variant="body1" sx={{ color: '#f2f2f7' }}><strong>Details:</strong> {selected.details}</Typography>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ borderTop: '1px solid rgba(255,255,255,0.08)', px: 3, py: 2 }}>
            <Button onClick={() => setSelected(null)} sx={{ color: '#f2f2f7', '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' } }}>Close</Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  )
}
