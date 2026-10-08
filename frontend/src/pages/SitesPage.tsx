import { useEffect, useState } from 'react'
import {
  Alert, Box, Button, Chip, Dialog, DialogContent, DialogTitle,
  IconButton, Paper, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, Typography, useMediaQuery,
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import CloseIcon from '@mui/icons-material/Close'
import PrintIcon from '@mui/icons-material/Print'
import { api } from '../api/client'
import { useTablePrint } from '../components/print'
import { lightFieldSx } from '../lib/fieldSx'

interface SiteRow {
  id: number
  customerId: number
  name: string
  siteType: string
  address?: string | null
  city?: string | null
  contactPerson?: string | null
  phone?: string | null
  email?: string | null
  isPrimary: boolean
  notes?: string | null
  customerNumber?: string | null
  customerName?: string | null
  jobCount: number
  equipmentCount: number
}

export default function SitesPage() {
  const isMobile = useMediaQuery('(max-width: 700px)')
  const [sites, setSites] = useState<SiteRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<SiteRow | null>(null)
  const printable = useTablePrint()

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.get<SiteRow[]>('/sites')
      setSites(r.data)
    } catch { setErr('Failed to load sites') }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // One customer, one ID: every site carries its owner's canonical CUS number,
  // so jobs, equipment and quotes on the same site always resolve to one customer.
  const visible = sites.filter((s) => {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return [s.name, s.city ?? '', s.address ?? '', s.customerNumber ?? '', s.customerName ?? '']
      .some((v) => (v ?? '').toLowerCase().includes(q))
  })

  return (
    <Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h4" sx={{ fontWeight: 900, color: '#f2f2f7', letterSpacing: '-0.02em' }}>Sites</Typography>
          <Typography variant="body2" sx={{ color: '#6b7280' }}>
            {loading ? 'Loading…' : `${sites.length} sites · each linked to one customer ID`}
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<PrintIcon />} disabled={visible.length === 0} onClick={() => printable.print({
          title: 'Site Register',
          subtitle: `${visible.length} sites`,
          cols: [{ label: 'Site' }, { label: 'Type' }, { label: 'Customer' }, { label: 'City' }, { label: 'Jobs', align: 'r' }, { label: 'Units', align: 'r' }],
          rows: visible.map((s) => [s.name, s.siteType, s.customerNumber ?? '—', s.city ?? '—', String(s.jobCount), String(s.equipmentCount)]),
        })} sx={{ borderRadius: 2 }}>Print</Button>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={load} sx={{ borderRadius: 2 }}>Refresh</Button>
      </Box>

      {err && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErr('')}>{err}</Alert>}
      <TextField
        label="Search by site, city, customer ID, or customer"
        fullWidth
        size="small"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        sx={{ mb: 2, ...lightFieldSx }}
      />
      <Typography variant="caption" sx={{ display: 'block', mb: 2, color: '#9aa0b0' }}>
        Sites are managed inside each customer profile — this register shows how the whole system links to them.
      </Typography>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2.5, bgcolor: '#ffffff', boxShadow: '0 10px 34px rgba(0,0,0,0.35)' }}>
        <Table size={isMobile ? 'small' : 'medium'}>
          <TableHead>
            <TableRow sx={{ '& th': { bgcolor: '#fafafc', fontWeight: 800, color: '#0f0f13', borderBottom: '1px solid #eef0f4' } }}>
              <TableCell>Site</TableCell>
              <TableCell>Customer</TableCell>
              {!isMobile && <TableCell>Contact</TableCell>}
              <TableCell align="right">Linked</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visible.length === 0 && (
              <TableRow><TableCell colSpan={4} sx={{ textAlign: 'center', color: '#9ca3af', py: 4 }}>{sites.length === 0 ? 'No sites yet — add them inside a customer profile.' : 'No sites match this search.'}</TableCell></TableRow>
            )}
            {visible.map((s) => (
              <TableRow key={s.id} hover onClick={() => setActive(s)} sx={{ cursor: 'pointer', '&:hover': { bgcolor: '#fff7f2 !important' } }}>
                <TableCell>
                  <Typography sx={{ fontWeight: 700, color: '#0f0f13', fontSize: 14 }}>{s.name}</Typography>
                  <Typography variant="caption" sx={{ color: '#9ca3af' }}>SITE-{String(s.id).padStart(6, '0')} · {s.siteType}{s.city ? ` · ${s.city}` : ''}</Typography>
                </TableCell>
                <TableCell>
                  <Typography sx={{ fontWeight: 800, color: '#FF3D00', fontSize: 13, fontFamily: 'monospace' }}>{s.customerNumber ?? '—'}</Typography>
                  <Typography variant="caption" sx={{ color: '#6b7280' }}>{s.customerName ?? ''}</Typography>
                </TableCell>
                {!isMobile && <TableCell><Typography variant="caption" sx={{ color: '#6b7280' }}>{s.contactPerson ?? s.phone ?? '—'}</Typography></TableCell>}
                <TableCell align="right">
                  <Chip size="small" label={`${s.jobCount} jobs`} sx={{ mr: 0.5, bgcolor: '#0288d114', color: '#0288d1', fontWeight: 700 }} />
                  <Chip size="small" label={`${s.equipmentCount} units`} sx={{ bgcolor: '#FF3D0014', color: '#FF3D00', fontWeight: 700 }} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {active && (
        <Dialog open onClose={() => setActive(null)} fullWidth maxWidth="sm" fullScreen={isMobile}>
          <DialogTitle sx={{ fontWeight: 800, pr: { xs: 12, sm: 6 } }}>
            {active.name}
            <IconButton onClick={() => setActive(null)} sx={{ position: 'absolute', right: 12, top: 12, color: '#9aa0b0' }}>
              <CloseIcon />
            </IconButton>
          </DialogTitle>
          <DialogContent dividers>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              <Chip size="small" label={active.siteType} sx={{ bgcolor: '#f1f5f9', color: '#374151', fontWeight: 800 }} />
              {active.isPrimary && <Chip size="small" label="Primary" sx={{ bgcolor: '#2e7d3218', color: '#2e7d32', fontWeight: 800 }} />}
              <Chip size="small" label={`${active.customerNumber ?? '—'}${active.customerName ? ` · ${active.customerName}` : ''}`} sx={{ bgcolor: '#FF3D0014', color: '#FF3D00', fontWeight: 800 }} />
            </Box>
            {([
              ['Address', active.address ?? '—'],
              ['City', active.city ?? '—'],
              ['Contact person', active.contactPerson ?? '—'],
              ['Phone', active.phone ?? '—'],
              ['Email', active.email ?? '—'],
              ['Jobs on this site', String(active.jobCount)],
              ['Equipment on this site', String(active.equipmentCount)],
              ['Notes', active.notes ?? '—'],
            ] as [string, string][]).map(([k, v]) => (
              <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 0.6, borderBottom: '1px dashed #eef0f4' }}>
                <Typography variant="caption" sx={{ color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{k}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'right' }}>{v}</Typography>
              </Box>
            ))}
          </DialogContent>
        </Dialog>
      )}

      {printable.node}
    </Box>
  )
}
