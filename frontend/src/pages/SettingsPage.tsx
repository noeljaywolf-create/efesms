import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import SaveIcon from '@mui/icons-material/Save'
import { api } from '../api/client'

const BRAND = {
  orange: '#FF3D00',
  orangeGlow: '#FF6B3D',
  orangeDeep: '#E63700',
  cyan: '#FF6E40',
  cyanGlow: '#FF8A65',
  panel: '#ffffff',
  dark: '#0a0a0f',
  darkElevated: '#12121a',
  soft: '#0d0d14',
  border: 'rgba(255,61,0,0.18)',
  text: '#f2f2f7',
  muted: '#9aa0b0',
  green: '#2e7d32',
  amber: '#ff8f00',
  red: '#d32f2f',
}

const defaultSettings = {
  companyName: 'Extreme Fire Equipment & Services',
  taxNumber: 'VAT 123456789',
  defaultCurrency: 'USD',
  reminderDays: 14,
  supportEmail: 'support@extremefire.co.zw',
  supportPhone: '+263 24 2488270',
  maintenanceMode: false,
  taxPercent: 15,
  quoteExpiryDays: 30,
  quotationTerms: '',
  notificationsEnabled: true,
  notifyService: true,
  notifyInspection: true,
  notifyCertification: true,
  notifyInventory: true,
  notifyInvoice: true,
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState(defaultSettings)

  useEffect(() => {
    let mounted = true

    const load = async () => {
      try {
        const { data } = await api.get('/settings')
        if (mounted) setForm({ ...defaultSettings, ...data })
      } catch {
        if (mounted) setForm(defaultSettings)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    load()
    return () => { mounted = false }
  }, [])

  const role = useMemo(() => localStorage.getItem('efesms_role') ?? 'admin', [])
  const dept = useMemo(() => localStorage.getItem('efesms_dept') ?? 'Administration', [])
  // Mirrors the backend gate: only admin / management may change settings.
  const canWrite = ['admin', 'administrator', 'management', 'contracts manager'].includes(role.toLowerCase()) ||
    dept.toLowerCase() === 'administration'

  const onChange = (key: keyof typeof defaultSettings, value: string | number | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const save = async () => {
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      await api.put('/settings', form)
      setSuccess('Settings saved successfully.')
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Could not save settings.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress /></Box>

  return (
    <Box sx={{ p: 2, bgcolor: BRAND.soft, minHeight: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, gap: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 900, color: BRAND.text, letterSpacing: '-0.02em' }}>Settings</Typography>
          <Typography variant="body2" sx={{ color: BRAND.muted }}>System preferences and business defaults</Typography>
        </Box>
        <Chip
          label={role.toUpperCase()}
          size="small"
          sx={{ bgcolor: '#fff3ed', color: BRAND.orange, fontWeight: 800, border: `1px solid ${BRAND.orange}33` }}
        />
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}
      {!canWrite && <Alert severity="info" sx={{ mb: 2 }}>You can view settings, but only admin or management can change them.</Alert>}

      <Paper variant="outlined" sx={{ p: 2, maxWidth: 980, borderRadius: 3, borderColor: BRAND.border, boxShadow: `0 10px 32px rgba(255,61,0,0.15)`, bgcolor: BRAND.darkElevated, border: `1px solid ${BRAND.border}` }}>
        <Stack spacing={2.5}>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr', md: '1fr 1fr' } }}>
            <TextField
              label="Company name"
              value={form.companyName}
              onChange={(e) => onChange('companyName', e.target.value)}
              fullWidth
              disabled={!canWrite}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: BRAND.dark, borderColor: BRAND.border }, '& .MuiInputLabel-root': { color: BRAND.muted }, '& .MuiInputBase-input': { color: BRAND.text } }}
            />
            <TextField
              label="Tax number"
              value={form.taxNumber}
              onChange={(e) => onChange('taxNumber', e.target.value)}
              fullWidth
              disabled={!canWrite}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: BRAND.dark, borderColor: BRAND.border }, '& .MuiInputLabel-root': { color: BRAND.muted }, '& .MuiInputBase-input': { color: BRAND.text } }}
            />
            <FormControl fullWidth disabled={!canWrite}>
              <InputLabel sx={{ color: BRAND.muted }}>Default currency</InputLabel>
              <Select label="Default currency" value={form.defaultCurrency} onChange={(e) => onChange('defaultCurrency', e.target.value)} sx={{ borderRadius: 2, '& .MuiOutlinedInput-root': { bgcolor: BRAND.dark, borderColor: BRAND.border }, '& .MuiSelect-select': { color: BRAND.text } }}>
                <MenuItem value="USD">USD</MenuItem>
                <MenuItem value="ZWL">ZWL</MenuItem>
                <MenuItem value="EUR">EUR</MenuItem>
                <MenuItem value="GBP">GBP</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Reminder lead days"
              type="number"
              value={form.reminderDays}
              onChange={(e) => onChange('reminderDays', Number(e.target.value) || 0)}
              fullWidth
              disabled={!canWrite}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: BRAND.dark, borderColor: BRAND.border }, '& .MuiInputLabel-root': { color: BRAND.muted }, '& .MuiInputBase-input': { color: BRAND.text } }}
            />
            <TextField
              label="Support email"
              value={form.supportEmail}
              onChange={(e) => onChange('supportEmail', e.target.value)}
              fullWidth
              disabled={!canWrite}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: BRAND.dark, borderColor: BRAND.border }, '& .MuiInputLabel-root': { color: BRAND.muted }, '& .MuiInputBase-input': { color: BRAND.text } }}
            />
            <TextField
              label="Support phone"
              value={form.supportPhone}
              onChange={(e) => onChange('supportPhone', e.target.value)}
              fullWidth
              disabled={!canWrite}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: BRAND.dark, borderColor: BRAND.border }, '& .MuiInputLabel-root': { color: BRAND.muted }, '& .MuiInputBase-input': { color: BRAND.text } }}
            />
            <TextField
              label="VAT % (used by new quotations)"
              type="number"
              value={form.taxPercent}
              onChange={(e) => onChange('taxPercent', Number(e.target.value) || 0)}
              fullWidth
              disabled={!canWrite}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: BRAND.dark, borderColor: BRAND.border }, '& .MuiInputLabel-root': { color: BRAND.muted }, '& .MuiInputBase-input': { color: BRAND.text } }}
            />
            <TextField
              label="Quote validity days (used by new quotations)"
              type="number"
              value={form.quoteExpiryDays}
              onChange={(e) => onChange('quoteExpiryDays', Number(e.target.value) || 0)}
              fullWidth
              disabled={!canWrite}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: BRAND.dark, borderColor: BRAND.border }, '& .MuiInputLabel-root': { color: BRAND.muted }, '& .MuiInputBase-input': { color: BRAND.text } }}
            />
          </Box>

          <TextField
            label="Default quotation terms"
            value={form.quotationTerms}
            onChange={(e) => onChange('quotationTerms', e.target.value)}
            fullWidth
            multiline
            rows={3}
            disabled={!canWrite}
            helperText="Pre-filled on every new quotation."
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: BRAND.dark, borderColor: BRAND.border }, '& .MuiInputLabel-root': { color: BRAND.muted }, '& .MuiInputBase-input': { color: BRAND.text } }}
          />

          <Divider />

          <Box>
            <Typography sx={{ fontWeight: 700, color: BRAND.text }}>Notifications</Typography>
            <Typography variant="caption" sx={{ color: BRAND.muted }}>
              Master switch, lead window, and per-category toggles drive Smart Reminders and the header bell.
            </Typography>
            <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr', md: '1fr 1fr' }, mt: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Switch checked={!!form.notificationsEnabled} disabled={!canWrite} onChange={(e) => onChange('notificationsEnabled', e.target.checked)} />
                <Typography variant="body2" sx={{ color: BRAND.text, fontWeight: 600 }}>Enable notifications</Typography>
              </Box>
              {([
                ['notifyService', 'Service due'],
                ['notifyInspection', 'Inspections'],
                ['notifyCertification', 'Certifications'],
                ['notifyInventory', 'Low stock'],
                ['notifyInvoice', 'Invoices'],
              ] as [keyof typeof defaultSettings, string][]).map(([key, label]) => (
                <Box key={key} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Switch checked={!!form[key]} disabled={!canWrite || !form.notificationsEnabled} onChange={(e) => onChange(key, e.target.checked)} />
                  <Typography variant="body2" sx={{ color: BRAND.text, fontWeight: 600 }}>{label}</Typography>
                </Box>
              ))}
            </Box>
            <Typography variant="caption" sx={{ color: BRAND.muted, display: 'block', mt: 1 }}>
              Reminder lead days above sets how far ahead due items appear; overdue items always surface.
            </Typography>
          </Box>

          <Divider sx={{ borderColor: BRAND.border }} />

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
            <Box>
              <Typography sx={{ fontWeight: 700, color: BRAND.text }}>Maintenance mode</Typography>
              <Typography variant="caption" sx={{ color: BRAND.muted }}>Temporarily restrict non-admin access to the system.</Typography>
            </Box>
            <Button
              variant={form.maintenanceMode ? 'contained' : 'outlined'}
              disabled={!canWrite}
              onClick={() => onChange('maintenanceMode', !form.maintenanceMode)}
              sx={form.maintenanceMode
                ? { bgcolor: BRAND.amber, color: BRAND.dark, '&:hover': { bgcolor: '#ffa000' }, boxShadow: `0 4px 16px ${BRAND.amber}40` }
                : { borderColor: BRAND.border, color: BRAND.text, '&:hover': { borderColor: BRAND.orange, color: BRAND.orange, boxShadow: `0 0 16px ${BRAND.orange}30` } }}
            >
              {form.maintenanceMode ? 'Enabled' : 'Disabled'}
            </Button>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={save}
              disabled={saving || !canWrite}
              sx={{ bgcolor: BRAND.orange, '&:hover': { bgcolor: BRAND.orangeDeep }, boxShadow: `0 4px 24px ${BRAND.orange}40`, borderRadius: 2, textTransform: 'none', fontWeight: 700, px: 4, py: 1.2 }}
            >
              {saving ? 'Saving…' : 'Save settings'}
            </Button>
          </Box>
        </Stack>
      </Paper>
    </Box>
  )
}
