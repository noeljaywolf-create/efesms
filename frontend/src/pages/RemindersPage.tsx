import { useEffect, useState } from 'react'
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip, Paper,
  Switch, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Typography, useMediaQuery,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import RefreshIcon from '@mui/icons-material/Refresh'
import PrintIcon from '@mui/icons-material/Print'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import { api } from '../api/client'
import type { SmartReminder, EngineOutput } from '../types/fireops'
import { SEVERITY_COLORS } from '../types/fireops'
import { ensureNotificationPermission, notifyUrgentReminders, notificationsSupported } from '../lib/notify'
import { useTablePrint } from '../components/print'

const CATEGORY_ICON: Record<string, string> = {
  Invoice: '#ff8a00',
  Service: '#FF3D00',
  Inspection: '#ffb300',
  Refill: '#7b1fa2',
  Maintenance: '#0288d1',
  Certification: '#2e7d32',
  Reorder: '#d32f2f',
}

export default function RemindersPage() {
  const isMobile = useMediaQuery('(max-width: 700px)')
  const [reminders, setReminders] = useState<SmartReminder[]>([])
  const [ai, setAi] = useState<EngineOutput | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [leadDays, setLeadDays] = useState<number | null>(null)
  const [muted, setMuted] = useState(false)
  const [pushState, setPushState] = useState<string | null>(null)
  const printable = useTablePrint()

  const load = async () => {
    setLoading(true)
    setErr('')
    try {
      const [s, a] = await Promise.all([
        api.get<Record<string, any>>('/settings'),
        api.post<EngineOutput>('/operations/analyze/full', {}),
      ])
      setLeadDays(typeof s.data.reminderDays === 'number' ? s.data.reminderDays : null)
      setMuted(s.data.notificationsEnabled === false)
      setAi(a.data)
      setReminders(a.data.reminders)
      // Read permission silently. Browser prompts only follow the user's
      // explicit Allow device notifications action.
      const perm = notificationsSupported() ? Notification.permission : null
      setPushState(perm)
      if (s.data.notificationsEnabled !== false && perm === 'granted') notifyUrgentReminders(a.data.reminders)
    } catch (x) { setErr('Failed to generate reminders') }
    setLoading(false)
  }

  const enablePush = async () => {
    const perm = await ensureNotificationPermission()
    setPushState(perm)
    if (perm === 'granted') notifyUrgentReminders(reminders)
  }

  const setNotificationsEnabled = async (enabled: boolean) => {
    setErr('')
    try {
      await api.put('/settings', { notificationsEnabled: enabled })
      setMuted(!enabled)
      if (enabled) await load()
      else setReminders([])
    } catch (x: any) {
      setErr(x?.response?.data?.message || 'Could not update notification settings.')
    }
  }

  useEffect(() => { load() }, [])

  const fmtDue = (days: number) => {
    if (days < 0) return `Overdue by ${Math.abs(days)}d`
    if (days === 0) return 'Due today'
    return `in ${days}d`
  }

  const sortOrder: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Info: 3 }
  const sorted = [...reminders].sort((a, b) => {
    const sev = (sortOrder[a.severity] ?? 9) - (sortOrder[b.severity] ?? 9)
    return sev !== 0 ? sev : a.daysUntilDue - b.daysUntilDue
  })
  const grouped = sorted.reduce<Record<string, SmartReminder[]>>((groups, reminder) => {
    ;(groups[reminder.category] ??= []).push(reminder)
    return groups
  }, {})

  return (
    <Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 2 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h4" sx={{ fontWeight: 900, color: '#f2f2f7', letterSpacing: '-0.02em' }}>Smart Reminders</Typography>
          <Typography variant="body2" sx={{ color: '#6b7280' }}>
            {loading ? 'Generating…' : `${reminders.length} reminders · ${reminders.filter((r) => r.daysUntilDue < 0).length} overdue`}
            {ai ? ` · ${ai.engineVersion} at ${Math.round(ai.overallConfidence * 100)}% confidence` : ''}
          </Typography>
          {!loading && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
              <Switch checked={!muted} onChange={(e) => setNotificationsEnabled(e.target.checked)} slotProps={{ input: { 'aria-label': 'Allow smart notifications' } }} />
              <Typography variant="body2" sx={{ color: '#d7d9e0', fontWeight: 700 }}>
                {muted ? 'Notifications denied' : 'Notifications allowed'}
              </Typography>
            </Box>
          )}
          {!loading && (muted ? (
            <Chip size="small" label="Notifications muted in Settings" sx={{ mt: 1, bgcolor: '#6b728014', color: '#6b7280', fontWeight: 800 }} />
          ) : leadDays != null && (
            <Chip size="small" label={`Window: next ${leadDays}d + overdue · set in Settings`} sx={{ mt: 1, bgcolor: '#0288d114', color: '#0288d1', fontWeight: 800 }} />
          ))}
        </Box>
        <Button variant="outlined" startIcon={<PrintIcon />} disabled={sorted.length === 0} onClick={() => printable.print({
          title: 'Smart Reminders',
          subtitle: `${reminders.length} reminders · ${reminders.filter((r) => r.daysUntilDue < 0).length} overdue · by severity`,
          cols: [{ label: 'Category' }, { label: 'Message' }, { label: 'Recipient' }, { label: 'Severity' }, { label: 'Due' }],
          rows: sorted.map((r) => [
            r.category,
            r.message,
            r.recipient || '—',
            r.severity,
            `${fmtDue(r.daysUntilDue)} · ${new Date(r.dueDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`,
          ]),
          groupBy: 3,
          note: 'Automatically generated by the Smart Reminders engine from service, refill, inspection and certification schedules.',
        })} sx={{ borderRadius: 2 }}>Print</Button>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={load} sx={{ borderRadius: 2 }}>Regenerate</Button>
        {notificationsSupported() && !muted && pushState !== 'granted' && (
          <Button variant="contained" onClick={enablePush} sx={{ borderRadius: 2, bgcolor: '#FF3D00', '&:hover': { bgcolor: '#C42A00' } }}>
            Enable device notifications
          </Button>
        )}
      </Box>

      {pushState === 'denied' && (
        <Alert severity="warning" sx={{ mb: 2 }}>
        Device notifications are blocked by this browser. Allow them in the browser’s site settings, then enable notifications here.
        </Alert>
      )}

      {err && <Alert severity="error" sx={{ mb: 2 }}>{err}</Alert>}

      {sorted.length === 0 ? (
        <Paper elevation={0} sx={{ p: 3, textAlign: 'center', color: '#9aa0b0', bgcolor: '#111118', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2.5 }}>
          Nothing to remind yet.
        </Paper>
      ) : Object.entries(grouped).map(([category, rows]) => {
        const color = CATEGORY_ICON[category] ?? '#6b7280'
        const highestSeverity = rows.reduce((best, row) => (sortOrder[row.severity] ?? 9) < (sortOrder[best] ?? 9) ? row.severity : best, rows[0].severity)
        return (
          <Accordion key={category} defaultExpanded sx={{ mb: 1.25, bgcolor: '#111118', color: '#f2f2f7', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px !important', '&:before': { display: 'none' } }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: '#aeb4c2' }} />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Chip size="small" icon={<AutoAwesomeIcon sx={{ fontSize: 14 }} />} label={category} sx={{ bgcolor: `${color}20`, color, fontWeight: 800 }} />
                <Typography variant="body2" sx={{ color: '#aeb4c2' }}>{rows.length} reminder{rows.length === 1 ? '' : 's'}</Typography>
                <Chip size="small" label={highestSeverity} sx={{ ml: 0.5, bgcolor: `${SEVERITY_COLORS[highestSeverity] ?? '#64748B'}18`, color: SEVERITY_COLORS[highestSeverity] ?? '#64748B', fontWeight: 700 }} />
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ pt: 0 }}>
              <TableContainer component={Paper} elevation={0} sx={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: 2, bgcolor: '#ffffff' }}>
                <Table size={isMobile ? 'small' : 'medium'} sx={{ minWidth: isMobile ? 460 : 'auto' }}>
                  <TableHead>
                    <TableRow sx={{ '& th': { bgcolor: '#fafafc', fontWeight: 800, color: '#0f0f13', borderBottom: '1px solid #eef0f4', whiteSpace: 'nowrap' } }}>
                      <TableCell>Reminder</TableCell>
                      {!isMobile && <TableCell>Recipient</TableCell>}
                      <TableCell>Severity</TableCell>
                      <TableCell>Due</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((r, i) => {
              const overdue = r.daysUntilDue < 0
              return (
                <TableRow key={i} sx={{ '&:hover': { bgcolor: '#fff7f2' } }}>
                  <TableCell>
                    <Typography sx={{ fontWeight: 600, color: '#0f0f13', fontSize: 14, minWidth: isMobile ? 180 : 300, whiteSpace: 'normal' }}>{r.message}</Typography>
                  </TableCell>
                  {!isMobile && <TableCell><Typography variant="caption" sx={{ color: '#6b7280' }}>{r.recipient}</Typography></TableCell>}
                  <TableCell>
                    <Chip size="small" icon={<AutoAwesomeIcon sx={{ fontSize: 14 }} />} sx={{ bgcolor: `${SEVERITY_COLORS[r.severity] ?? '#64748B'}18`, color: SEVERITY_COLORS[r.severity] ?? '#64748B', fontWeight: 700 }} label={r.severity} />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 800, color: overdue ? '#d32f2f' : '#0f0f13' }}>
                      {fmtDue(r.daysUntilDue)}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#9ca3af' }}>
                      {new Date(r.dueDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                    </Typography>
                  </TableCell>
                </TableRow>
              )
            })}
                  </TableBody>
                </Table>
              </TableContainer>
            </AccordionDetails>
          </Accordion>
        )
      })}

      {printable.node}
    </Box>
  )
}
