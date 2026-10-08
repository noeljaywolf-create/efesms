import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar, Box, Button, Chip, Grid, Paper, Typography, useMediaQuery, useTheme } from '@mui/material'
import PeopleIcon from '@mui/icons-material/People'
import VerifiedIcon from '@mui/icons-material/Verified'
import BuildIcon from '@mui/icons-material/Build'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import DownloadIcon from '@mui/icons-material/Download'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import PublicIcon from '@mui/icons-material/Public'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import PrintIcon from '@mui/icons-material/Print'
import BoltIcon from '@mui/icons-material/Bolt'
import Inventory2Icon from '@mui/icons-material/Inventory2'
import ScheduleIcon from '@mui/icons-material/Schedule'
import { api } from '../api/client'
import { DANGER_COLORS, type EngineOutput, type OpsSummary, type OperationJob } from '../types/fireops'
import { useTablePrint } from '../components/print'

type Customer = {
  id: number
  name: string
  customerType: string
  status: string
  phone: string
  email?: string | null
  contacts?: { name: string; isPrimary?: boolean }[]
  createdAt: string
}

const TYPE_COLORS: Record<string, string> = {
  Commercial: '#FF3D00',
  Industrial: '#FF6E40',
  Institutional: '#FF8A65',
  Residential: '#E65100',
  Government: '#FF3D00',
}
const STATUS_COLORS: Record<string, string> = {
  Prospect: '#ff8f00',
  Active: '#2e7d32',
  Inactive: '#6b7280',
  Blacklisted: '#d32f2f',
}

const GLASS = {
  bgcolor: 'rgba(18,18,26,0.72)',
  border: '1px solid rgba(255,255,255,0.08)',
  backdropFilter: 'blur(18px)',
  boxShadow: '0 18px 50px rgba(0,0,0,0.35)',
}

function KpiCard({ label, icon, color, value, delta, up }: { label: string; icon: React.ReactNode; color: string; value: number; delta: string; up: boolean }) {
  // Show the latest API value immediately; a delayed observer animation used
  // to leave visible KPIs at zero on short pages and narrow screens.
  const display = String(value)
  return (
    <Grid size={{ xs: 6, md: 3 }}>
      <Paper
        elevation={0}
        sx={{
          height: '100%',
          ...GLASS,
          borderRadius: 3,
          p: { xs: 1.5, sm: 2.5 },
          position: 'relative',
          overflow: 'hidden',
          transition: 'transform .25s ease, border-color .25s ease, box-shadow .25s ease',
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(140% 90% at 100% 0%, ${color}22, transparent 55%)`,
            pointerEvents: 'none',
          },
          '&:hover': {
            transform: 'translateY(-4px)',
            borderColor: `${color}66`,
            boxShadow: `0 22px 55px rgba(0,0,0,0.45), 0 0 28px ${color}22`,
          },
        }}
      >
        <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Box
            sx={{
              width: 46, height: 46, borderRadius: 2.5,
              display: 'grid', placeItems: 'center',
              background: `linear-gradient(135deg, ${color}33, ${color}12)`,
              border: `1px solid ${color}44`,
              boxShadow: `0 0 24px ${color}2a`,
              color,
              '& svg': { fontSize: 24 },
            }}
          >
            {icon}
          </Box>
          <Chip
            size="small"
            icon={up ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
            label={label === 'Services due' ? 'soon' : up ? 'good' : 'attention'}
            sx={{
              height: 24,
              fontWeight: 800,
              fontSize: 11,
              bgcolor: up ? '#2e7d3218' : '#d32f2f18',
              color: up ? '#4ade80' : '#f87171',
              '& .MuiChip-icon': { color: 'inherit', fontSize: 16 },
            }}
          />
        </Box>
        <Typography variant="h3" sx={{ position: 'relative', fontWeight: 900, lineHeight: 1, color: '#f2f2f7', letterSpacing: '-0.03em' }}>
          {display}
        </Typography>
        <Typography variant="body2" sx={{ position: 'relative', color: '#c9cdd8', fontWeight: 700, mt: 1 }}>{label}</Typography>
        <Typography variant="caption" sx={{ position: 'relative', color: '#7d8496', mt: 0.25, display: 'block' }}>{delta}</Typography>
      </Paper>
    </Grid>
  )
}

function AreaChart({ color, data, labels }: { color: string; data: number[]; labels: string[] }) {
  if (!data.some((value) => value > 0)) {
    return <Typography variant="body2" sx={{ color: '#7d8496', py: 5, textAlign: 'center' }}>No job cards were created in this ten-week period.</Typography>
  }
  const w = 560
  const h = 180
  const max = Math.max(...data)
  const min = Math.min(...data)
  const pts = data.map((v, i) => [ (i / (data.length - 1)) * w, h - ((v - min) / (max - min || 1)) * (h - 24) ])
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `${line} L${w},${h} L0,${h} Z`
  const last = pts[pts.length - 1]
  return (
    <Box sx={{ width: '100%', overflow: 'hidden' }}>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Service demand over 10 periods">
        <defs>
          <linearGradient id="ef-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.45" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
          <filter id="ef-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {[0.25, 0.5, 0.75].map((t) => (
          <line key={t} x1="0" x2={w} y1={h * t} y2={h * t} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        ))}
        <path d={area} fill="url(#ef-area)" />
        <path d={line} fill="none" stroke={color} strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" filter="url(#ef-glow)" />
        <circle cx={last[0]} cy={last[1]} r="5" fill={color} stroke="#12121a" strokeWidth="2.5" />
      </svg>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 0.5, mt: 0.5 }}>
        {labels.map((l) => (
          <Typography key={l} variant="caption" sx={{ color: '#6b7280', fontSize: 10 }}>{l}</Typography>
        ))}
      </Box>
    </Box>
  )
}

function Donut({ segments }: { segments: { label: string; color: string; value: number }[] }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1
  let acc = 0
  const stops = segments.map((s) => {
    const from = (acc / total) * 360
    acc += s.value
    const to = (acc / total) * 360
    return `${s.color} ${from}deg ${to}deg`
  })
  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: 'center', gap: 3 }}>
      <Box
        sx={{
          width: 160,
          height: 160,
          borderRadius: '50%',
          flexShrink: 0,
          background: `conic-gradient(${stops.join(', ')})`,
          display: 'grid',
          placeItems: 'center',
          position: 'relative',
        }}
      >
        <Box sx={{ width: 100, height: 100, borderRadius: '50%', bgcolor: '#12121a', border: '4px solid rgba(255,255,255,0.06)', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 900, color: '#f2f2f7', lineHeight: 1 }}>{total}</Typography>
            <Typography variant="caption" sx={{ color: '#7d8496', fontWeight: 700 }}>customers</Typography>
          </Box>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, width: '100%' }}>
        {segments.map((s) => (
          <Box key={s.label} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: s.color, flexShrink: 0, boxShadow: `0 0 10px ${s.color}88` }} />
            <Typography variant="body2" sx={{ color: '#9aa0b0', fontWeight: 600, flexGrow: 1 }}>{s.label}</Typography>
            <Typography variant="body2" sx={{ color: '#f2f2f7', fontWeight: 800 }}>{s.value}</Typography>
            <Typography variant="caption" sx={{ color: '#6b7280', width: 44, textAlign: 'right' }}>{Math.round((s.value / total) * 100)}%</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

function PanelHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, mb: 2, justifyContent: 'space-between' }}>
      <Typography variant="h6" sx={{ fontWeight: 800, color: '#f2f2f7', flexGrow: 1, fontSize: { xs: 15, sm: 17 } }}>{title}</Typography>
      {action}
    </Box>
  )
}

export default function DashboardPage() {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const navigate = useNavigate()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [jobs, setJobs] = useState<OperationJob[]>([])
  const [ops, setOps] = useState<OpsSummary | null>(null)
  const [ai, setAi] = useState<EngineOutput | null>(null)
  const [connection, setConnection] = useState<'checking' | 'online' | 'offline'>('checking')
  const [exporting, setExporting] = useState(false)
  const printable = useTablePrint()

  const exportCustomers = () => {
    if (!customers.length) return
    setExporting(true)
    const esc = (v: unknown) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const rows = [
      ['ID', 'Name', 'Type', 'Status', 'Phone', 'Email', 'Primary contact', 'Created'],
      ...customers.map((c) => {
        const pc = c.contacts?.find((k) => k.isPrimary) ?? c.contacts?.[0]
        return [c.id, c.name, c.customerType, c.status, c.phone, c.email ?? '', pc?.name ?? '', new Date(c.createdAt).toLocaleDateString('en-ZA')]
      }),
    ].map((r) => r.map(esc).join(',')).join('\r\n')
    const blob = new Blob(['\ufeff' + rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `customers-register-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    window.setTimeout(() => setExporting(false), 400)
  }

  useEffect(() => {
    let alive = true
    api.get<Customer[]>('/customers').then(({ data }) => {
      if (alive) setCustomers(data)
    }).catch(() => {})
    api.get<OperationJob[]>('/operations/jobs').then(({ data }) => {
      if (alive) setJobs(data ?? [])
    }).catch(() => {})
    api.get<{ status: string; database: string }>('/health').then(({ data }) => {
      if (alive) setConnection(data.status === 'ok' && data.database === 'connected' ? 'online' : 'offline')
    }).catch(() => alive && setConnection('offline'))
    api.get<OpsSummary>('/operations/summary').then(({ data }) => alive && setOps(data)).catch(() => {})
    api.post<EngineOutput>('/operations/analyze/full', {}).then(({ data }) => alive && setAi(data)).catch(() => {})
    return () => { alive = false }
  }, [])

  const openJobs = ops?.openJobs ?? 0
  const highPriority = ops?.highPriorityOpen ?? 0
  const atRisk = ai?.riskAssessments.filter((r) => r.severity === 'High' || r.severity === 'Critical').length ?? 0
  const reminders = ai?.reminders.length ?? 0
  const reorders = ai?.reorders.length ?? 0
  const overdue = ai?.reminders.filter((r) => r.daysUntilDue < 0).length ?? 0

  const totalCustomers = customers.length
  const activeCustomers = customers.filter((c) => c.status === 'Active').length
  const byType = Object.entries(TYPE_COLORS)
    .map(([label, color]) => ({ label, color, value: customers.filter((c) => c.customerType === label).length }))
    .filter((s) => s.value > 0)
  const recent = [...customers].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5)
  // Build the dashboard trend from saved job-card creation dates rather than
  // sample values, so the chart reflects the same records as the Jobs section.
  const currentWeek = new Date()
  currentWeek.setHours(0, 0, 0, 0)
  currentWeek.setDate(currentWeek.getDate() - ((currentWeek.getDay() + 6) % 7))
  const firstWeek = new Date(currentWeek)
  firstWeek.setDate(firstWeek.getDate() - 9 * 7)
  const weekStarts = Array.from({ length: 10 }, (_, index) => {
    const start = new Date(firstWeek)
    start.setDate(start.getDate() + index * 7)
    return start
  })
  const demand = Array.from({ length: 10 }, () => 0)
  jobs.forEach((job) => {
    if (!job.createdAt) return
    const weekIndex = Math.floor((new Date(job.createdAt).getTime() - firstWeek.getTime()) / (7 * 24 * 60 * 60 * 1000))
    if (weekIndex >= 0 && weekIndex < demand.length) demand[weekIndex] += 1
  })
  const demandLabels = weekStarts.map((start) => start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })

  return (
    <Box sx={{ position: 'relative', minHeight: '100%' }}>
      <Box className="ef-grid-bg" />

      <Box sx={{ position: 'relative' }}>
        {/* header row */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 3 }}>
          <Box sx={{ flexGrow: 1, minWidth: { xs: '100%', sm: 0 } }}>
            <Typography
              className="grad-text"
              variant="h4"
              sx={{ fontWeight: 900, letterSpacing: '-0.03em', fontSize: { xs: 26, sm: 34 } }}
            >
              Command Centre
            </Typography>
            <Typography variant="body2" sx={{ color: '#7d8496', fontWeight: 500, mt: 0.25 }}>
              Extreme Fire Design Inc · Operational Overview · {today}
            </Typography>
          </Box>
          <Box
            sx={{
              display: 'flex', alignItems: 'center', gap: 1.25,
              bgcolor: 'rgba(18,18,26,0.72)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 999, px: 2, py: 1, backdropFilter: 'blur(12px)',
            }}
          >
            <Box
              className={connection === 'online' ? 'ef-live-dot' : undefined}
              sx={{
                width: 8, height: 8, borderRadius: '50%',
                bgcolor: connection === 'online' ? '#00e676' : connection === 'offline' ? '#ff5252' : '#ffb74d',
                boxShadow: `0 0 10px ${connection === 'online' ? '#00e676' : connection === 'offline' ? '#ff5252' : '#ffb74d'}`,
              }}
            />
            <Typography sx={{ fontSize: 11, fontWeight: 800, color: connection === 'online' ? '#4ade80' : connection === 'offline' ? '#ff6b6b' : '#ffcc80', letterSpacing: '0.08em' }}>
              {connection === 'online' ? 'API + DATABASE ONLINE' : connection === 'offline' ? 'CONNECTION UNAVAILABLE' : 'CHECKING CONNECTION'}
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={exportCustomers}
            disabled={exporting}
            sx={{
              borderRadius: 999, color: '#f2f2f7', borderColor: 'rgba(255,255,255,0.16)',
              px: 2.5, '&:hover': { borderColor: '#FF3D00', bgcolor: '#FF3D0014', boxShadow: '0 0 20px #FF3D0022' },
            }}
          >
            {exporting ? 'Exporting…' : 'Export'}
          </Button>
        </Box>

        {/* KPI strip */}
        <Grid container spacing={{ xs: 1.5, md: 2.5 }} sx={{ mb: 3 }}>
          <KpiCard label="Customers" icon={<PeopleIcon />} color="#FF6E40" value={totalCustomers} delta={totalCustomers === 0 ? 'Loading live register…' : `${activeCustomers} active`} up={activeCustomers > 0} />
          <KpiCard label="Active customers" icon={<VerifiedIcon />} color="#FF6E40" value={activeCustomers} delta={`${totalCustomers - activeCustomers} other statuses`} up={activeCustomers > 0} />
          <KpiCard label="Open jobs" icon={<BuildIcon />} color="#FF6E40" value={openJobs} delta={`${highPriority} high priority`} up={openJobs === 0} />
          <KpiCard label="Units at risk" icon={<WarningAmberIcon />} color="#FF6E40" value={atRisk} delta={`${ai?.anomalies.length ?? 0} anomalies flagged`} up={atRisk === 0} />
        </Grid>

        {/* charts row */}
        <Grid container spacing={{ xs: 1.5, md: 2.5 }} sx={{ mb: 3 }}>
          <Grid size={{ xs: 12, md: 8 }}>
            <Paper elevation={0} sx={{ height: '100%', ...GLASS, borderRadius: 3, p: { xs: 2, sm: 2.5 } }}>
              <PanelHeader
                title="Job cards created — last 10 weeks"
                action={<Chip size="small" label="Live database" sx={{ bgcolor: '#2e7d3218', color: '#4ade80', fontWeight: 700, borderRadius: 2 }} />}
              />
              <AreaChart color="#FF3D00" data={demand} labels={demandLabels} />
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Paper elevation={0} sx={{ height: '100%', ...GLASS, borderRadius: 3, p: { xs: 2, sm: 2.5 } }}>
              <PanelHeader title="Customer mix" action={customers.length > 0 && <Chip size="small" label="Live" sx={{ bgcolor: '#FF3D0016', color: '#FF6E40', fontWeight: 800, borderRadius: 2 }} />} />
              {byType.length > 0 ? <Donut segments={byType} /> : <Typography variant="body2" sx={{ color: '#6b7280', py: 4, textAlign: 'center' }}>Add customers to see the mix.</Typography>}
            </Paper>
          </Grid>
        </Grid>

        {/* AI operations engine strip */}
        {ai && (
          <Paper
            elevation={0}
            sx={{
              mb: 3,
              borderRadius: 3,
              border: '1px solid rgba(255,61,0,0.28)',
              background: 'linear-gradient(120deg, rgba(255,61,0,0.14), rgba(255,110,64,0.05) 55%, rgba(18,18,26,0.9))',
              backdropFilter: 'blur(18px)',
              p: { xs: 2, sm: 2.5 },
            }}
          >
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
              <Box
                sx={{
                  width: 44, height: 44, borderRadius: 2.5, display: 'grid', placeItems: 'center',
                  background: 'linear-gradient(135deg, #FF3D0033, #FF3D0012)',
                  border: '1px solid #FF3D0044', boxShadow: '0 0 24px #FF3D0033', color: '#FF6E40',
                }}
              >
                <AutoAwesomeIcon />
              </Box>
              <Box sx={{ flexGrow: 1, minWidth: 200 }}>
                <Typography sx={{ fontWeight: 800, color: '#f2f2f7', fontSize: { xs: 14, sm: 15 } }}>
                  FireOps AI Engine — {ai.engineVersion} · {Math.round(ai.overallConfidence * 100)}% confidence
                </Typography>
                <Typography variant="caption" sx={{ color: '#9aa0b0' }}>
                  {ai.ml.scheduleAlgorithm} scheduling · {ai.ml.forecastAlgorithm} forecasting · {ai.ml.clusteringAlgorithm} clustering
                </Typography>
              </Box>
              {[
                [`${ai.assignments.length} scheduled`, '#4ade80'],
                [`${atRisk} units at risk`, DANGER_COLORS.critical],
                [`${(ai.anomalies ?? []).length} anomalies`, '#fbbf24'],
                [`${(ai.forecasts ?? []).length} forecasts`, '#FF6E40'],
                [`${reorders} reorders`, '#ff8a00'],
                [`${reminders} reminders`, '#c084fc'],
              ].map(([label, color]) => (
                <Chip key={label as string} size="small" label={label} sx={{ bgcolor: `${color}16`, color, fontWeight: 800, border: `1px solid ${color}33` }} />
              ))}
            </Box>
          </Paper>
        )}

        {/* panels row */}
        <Grid container spacing={{ xs: 1.5, md: 2.5 }}>
          <Grid size={{ xs: 12, md: 7 }}>
            <Paper elevation={0} sx={{ height: '100%', ...GLASS, borderRadius: 3, p: { xs: 2, sm: 2.5 } }}>
              <PanelHeader
                title="Recent customers"
                action={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Button
                      size="small"
                      startIcon={<PrintIcon />}
                      disabled={recent.length === 0}
                      onClick={() => printable.print({
                        title: 'Recent Customers',
                        subtitle: `${recent.length} of ${customers.length} customers · grouped by type`,
                        cols: [{ label: 'Customer' }, { label: 'Type' }, { label: 'Status' }],
                        rows: recent.map((c) => [c.name, c.customerType || '—', c.status || '—']),
                        groupBy: 1,
                        note: 'Snapshot taken from the command centre dashboard.',
                      })}
                      sx={{ borderRadius: 999, color: '#c9cdd8', borderColor: 'rgba(255,255,255,0.14)', '&:hover': { borderColor: '#FF3D0088', color: '#FF6E40' } }}
                    >
                      Print
                    </Button>
                    <Button
                      size="small"
                      endIcon={<ArrowForwardIcon />}
                      onClick={() => navigate('/customers')}
                      sx={{ borderRadius: 999, color: '#FF6E40', fontWeight: 800, '&:hover': { bgcolor: '#FF3D0014' } }}
                    >
                      View all
                    </Button>
                  </Box>
                }
              />
              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                {recent.length === 0 && <Typography variant="body2" sx={{ color: '#6b7280', py: 3, textAlign: 'center' }}>No customers yet — add your first one.</Typography>}
                {recent.map((c) => {
                  const pc = c.contacts?.find((k) => k.isPrimary) ?? c.contacts?.[0]
                  return (
                    <Box
                      key={c.id}
                      onClick={() => navigate('/customers')}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        py: 1.25,
                        px: 1,
                        mx: -1,
                        borderRadius: 2,
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                        cursor: 'pointer',
                        transition: 'background .15s ease, transform .15s ease',
                        '&:hover': { bgcolor: 'rgba(255,61,0,0.08)', transform: 'translateX(4px)' },
                        '&:last-of-type': { borderBottom: 'none' },
                      }}
                    >
                      <Avatar
                        sx={{
                          bgcolor: 'rgba(255,138,0,0.14)', color: '#ff8a00', fontWeight: 800, width: 40, height: 40,
                          border: '1px solid rgba(255,138,0,0.28)',
                        }}
                      >
                        {c.name.charAt(0).toUpperCase()}
                      </Avatar>
                      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 700, color: '#f2f2f7', fontSize: 14 }} noWrap>{c.name}</Typography>
                        <Typography variant="caption" sx={{ color: '#6b7280' }} noWrap>
                          {c.customerType}{pc ? ` · ${pc.name}` : ''}
                        </Typography>
                      </Box>
                      <Chip
                        size="small"
                        sx={{
                          bgcolor: `${STATUS_COLORS[c.status] ?? '#6b7280'}22`,
                          color: STATUS_COLORS[c.status] ?? '#9aa0b0',
                          fontWeight: 800,
                          border: `1px solid ${STATUS_COLORS[c.status] ?? '#6b7280'}44`,
                        }}
                        label={c.status}
                      />
                    </Box>
                  )
                })}
              </Box>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <Paper elevation={0} sx={{ height: '100%', ...GLASS, borderRadius: 3, p: { xs: 2, sm: 2.5 } }}>
              <PanelHeader title="Quick actions" />
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                <ActionTile icon={<PersonAddIcon />} color="#FF6E40" label="Add Customer" onClick={() => navigate('/customers')} />
                <ActionTile icon={<SearchIcon />} color="#FF3D00" label="Search Register" onClick={() => navigate('/customers')} />
                <ActionTile icon={<PublicIcon />} color="#FF6E40" label="Live Directory" onClick={() => navigate('/customers')} full={isMobile} />
                <ActionTile icon={<AddIcon />} color="#FF6E40" label="New Job" onClick={() => navigate('/jobs')} full={isMobile} />
              </Box>
              <Box
                sx={{
                  mt: 2.5,
                  background: 'linear-gradient(135deg, rgba(255,61,0,0.12), rgba(255,61,0,0.04))',
                  border: '1px solid rgba(255,61,0,0.28)',
                  borderRadius: 2.5,
                  p: 2,
                }}
              >
                <Typography sx={{ color: '#FF6E40', fontWeight: 900, fontSize: 11, letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <BoltIcon sx={{ fontSize: 15 }} /> NEEDS ATTENTION — AI SCAN
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.25 }}>
                  {openJobs > 0 && <Chip size="small" icon={<ScheduleIcon />} label={`${openJobs} open jobs`} sx={{ bgcolor: '#FF6E4014', color: '#FF6E40', fontWeight: 800, border: '1px solid #FF6E4033' }} />}
                  {atRisk > 0 && <Chip size="small" icon={<WarningAmberIcon />} label={`${atRisk} units at risk`} sx={{ bgcolor: `${DANGER_COLORS.critical}14`, color: DANGER_COLORS.critical, fontWeight: 800, border: `1px solid ${DANGER_COLORS.critical}33` }} />}
                  {reorders > 0 && <Chip size="small" icon={<Inventory2Icon />} label={`${reorders} AI reorder suggestions`} sx={{ bgcolor: `${DANGER_COLORS.high}14`, color: DANGER_COLORS.high, fontWeight: 800, border: `1px solid ${DANGER_COLORS.high}33` }} />}
                  {overdue > 0 && <Chip size="small" label={`${overdue} reminders overdue`} sx={{ bgcolor: '#c084fc14', color: '#c084fc', fontWeight: 800, border: '1px solid #c084fc33' }} />}
                  {openJobs === 0 && atRisk === 0 && reorders === 0 && overdue === 0 && (
                    <Chip size="small" label="All clear" sx={{ bgcolor: '#4ade8014', color: '#4ade80', fontWeight: 800, border: '1px solid #4ade8033' }} />
                  )}
                </Box>
              </Box>
            </Paper>
          </Grid>
        </Grid>

        <Chip
          label={`Ops engine live: ${ai?.ml.scheduleAlgorithm ?? 'scheduler'} · ${ai?.forecasts.length ?? 0} forecasts · ${ai?.riskClusters.length ?? 0} risk cohorts · register & jobs on live feeds`}
          size="small"
          sx={{
            mt: 3,
            bgcolor: 'rgba(255,255,255,0.04)',
            color: '#7d8496',
            border: '1px solid rgba(255,255,255,0.08)',
            height: 'auto', py: 1,
            borderRadius: 2,
            '& .MuiChip-label': { whiteSpace: 'normal' },
          }}
        />
      </Box>

      {printable.node}
    </Box>
  )
}

function ActionTile({ icon, color, label, onClick, full }: { icon: React.ReactNode; color: string; label: string; onClick: () => void; full?: boolean }) {
  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick() }}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 1.25,
        minHeight: 104,
        gridColumn: full ? '1 / -1' : 'auto',
        cursor: 'pointer',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 2.5,
        p: 1.75,
        background: `linear-gradient(160deg, ${color}14, rgba(255,255,255,0.02))`,
        transition: 'transform .18s ease, border-color .2s ease, box-shadow .2s ease',
        '&:hover': { transform: 'translateY(-3px)', borderColor: `${color}77`, boxShadow: `0 14px 32px ${color}26` },
        '&:active': { transform: 'translateY(0)' },
      }}
    >
      <Box
        sx={{
          width: 40, height: 40, borderRadius: 2, display: 'grid', placeItems: 'center',
          background: `linear-gradient(135deg, ${color}38, ${color}14)`,
          border: `1px solid ${color}44`,
          color,
          boxShadow: `0 0 18px ${color}22`,
          '& svg': { fontSize: 21 },
        }}
      >
        {icon}
      </Box>
      <Typography variant="body2" sx={{ fontWeight: 800, color: '#f2f2f7' }}>{label}</Typography>
    </Box>
  )
}
