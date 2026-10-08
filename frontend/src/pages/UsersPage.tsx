import { useEffect, useMemo, useState } from 'react'
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Typography, useMediaQuery,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import PersonIcon from '@mui/icons-material/Person'
import PrintIcon from '@mui/icons-material/Print'
import BuildIcon from '@mui/icons-material/Build'
import { api } from '../api/client'
import { useTablePrint } from '../components/print'
import { lightFieldSx } from '../lib/fieldSx'

interface AccountRow {
  id: number
  username: string
  email: string
  displayName: string
  role: string
  department: string
  isActive: boolean
  createdAt?: string
}

interface TechRow {
  id: number
  name: string
  email: string
  phone: string
  trade: string
  certifications: string
  assignedJobs: number
}

const currentRole = () => localStorage.getItem('efesms_role') ?? 'admin'
const isAdminUser = () => ['admin', 'administrator'].includes(currentRole().toLowerCase())

export default function UsersPage() {
  const isMobile = useMediaQuery('(max-width: 700px)')
  const printable = useTablePrint()
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [techs, setTechs] = useState<TechRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState<TechRow | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [meName, setMeName] = useState('')
  const [meEmail, setMeEmail] = useState('')
  const [meMsg, setMeMsg] = useState('')
  const [pwdCur, setPwdCur] = useState('')
  const [pwdNew, setPwdNew] = useState('')
  const [pwdMsg, setPwdMsg] = useState('')
  const [issuedReset, setIssuedReset] = useState<{ username: string; password: string } | null>(null)

  const me = accounts.find((a) => {
    try {
      const s = JSON.parse(localStorage.getItem('efesms_user') || 'null')
      return s && (String(a.id) === String(s.id) || a.username === s.name)
    } catch { return false }
  }) ?? null

  useEffect(() => {
    if (me && !meName) setMeName(me.displayName || '')
    if (me && !meEmail) setMeEmail(me.email || '')
  }, [me?.id])

  const load = async () => {
    setLoading(true)
    try {
      const { data } = await api.get('/users')
      setAccounts(data.accounts ?? [])
      setTechs(data.technicians ?? [])
      setError('')
    } catch {
      setError('Could not load the user directory.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const canDelete = isAdminUser()
  const confirmMatches = confirmText.trim().toLowerCase() === (deleting?.name ?? '').toLowerCase()
  const techsAtRisk = useMemo(
    () => techs.filter((t) => (deleting?.id ?? -1) === t.id && t.assignedJobs > 0).length > 0,
    [techs, deleting],
  )

  const saveMe = async () => {
    setBusy(true)
    setMeMsg('')
    try {
      const { data } = await api.put('/users/me', { displayName: meName.trim(), email: meEmail.trim() })
      try {
        const s = JSON.parse(localStorage.getItem('efesms_user') || 'null')
        localStorage.setItem('efesms_user', JSON.stringify({ ...s, name: data.displayName }))
        localStorage.setItem('efesms_display', data.displayName)
      } catch { /* ignore */ }
      setMeMsg('Profile saved.')
      await load()
    } catch (x: any) {
      setMeMsg(x?.response?.data?.message ?? 'Could not save profile.')
    } finally {
      setBusy(false)
    }
  }

  const changePwd = async () => {
    setBusy(true)
    setPwdMsg('')
    try {
      const { data } = await api.post('/auth/change-password', { currentPassword: pwdCur, newPassword: pwdNew })
      if (data?.token) localStorage.setItem('efesms_token', data.token)
      setPwdCur('')
      setPwdNew('')
      setPwdMsg('Password changed.')
    } catch (x: any) {
      setPwdMsg(x?.response?.data?.message ?? 'Could not change password.')
    } finally {
      setBusy(false)
    }
  }

  const doDelete = async () => {
    if (!deleting) return
    setBusy(true)
    try {
      await api.delete(`/operations/technicians/${deleting.id}`)
      setTechs((ts) => ts.filter((t) => t.id !== deleting.id))
      setDeleting(null)
      setConfirmText('')
      setError('')
    } catch {
      setError('Delete failed — the technician may have active job cards. Reassign or complete them first.')
    } finally {
      setBusy(false)
    }
  }

  const setAccountActive = async (id: number, isActive: boolean) => {
    setBusy(true)
    try {
      await api.put(`/users/${id}`, { isActive })
      setError('')
      await load()
    } catch {
      setError('Could not update the account.')
    } finally {
      setBusy(false)
    }
  }

  const setAccountRole = async (id: number, role: string) => {
    setBusy(true)
    setError('')
    try {
      await api.put(`/users/${id}`, { role })
      await load()
    } catch (x: any) {
      setError(x?.response?.data?.message ?? 'Could not update the account role.')
    } finally {
      setBusy(false)
    }
  }

  const resetAccountPassword = async (account: AccountRow) => {
    setBusy(true)
    setIssuedReset(null)
    try {
      const { data } = await api.post(`/users/${account.id}/reset-password`)
      setIssuedReset({ username: account.username, password: data.temporaryPassword })
    } catch (x: any) {
      setError(x?.response?.data?.message ?? 'Could not issue a temporary password.')
    } finally {
      setBusy(false)
    }
  }

  const pendingCount = accounts.filter((a) => !a.isActive).length

  const doPrint = () =>
    printable.print({
      title: 'Users & Technician Directory',
      subtitle: `${accounts.length} accounts · ${techs.length} technicians`,
      cols: [
        { label: 'Name' },
        { label: 'Role / Department' },
        { label: 'Contact' },
        { label: 'Status' },
      ],
      rows: [
        ...accounts.map((a) => [
          a.displayName || a.username,
          `${a.role} · ${a.department}`,
          a.email,
          a.isActive ? 'Active' : 'Inactive',
        ]),
        ...techs.map((t) => [
          t.name,
          `Technician · ${t.trade}`,
          t.phone || t.email,
          `${t.assignedJobs} open job${t.assignedJobs === 1 ? '' : 's'}`,
        ]),
      ],
    })

  const renderRole = (r: string) => (
    <Chip
      size="small"
      label={r}
      sx={{
        fontWeight: 700,
        bgcolor: r.toLowerCase() === 'admin' || r.toLowerCase() === 'administrator' ? '#FC000018' : '#2F03FD18',
        color: r.toLowerCase() === 'admin' || r.toLowerCase() === 'administrator' ? '#FC0000' : '#2F03FD',
      }}
    />
  )

  return (
    <Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>Users &amp; Technicians</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {canDelete && (
            <Chip label="Admin" size="small" sx={{ bgcolor: '#FC000018', color: '#FC0000', fontWeight: 800 }} />
          )}
          <Button size="small" variant="outlined" startIcon={<PrintIcon />} onClick={doPrint} sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>Print / PDF</Button>
        </Box>
      </Box>

      {error && (
        <Typography color="error" variant="body2" sx={{ mb: 2 }}>{error}</Typography>
      )}
      {issuedReset && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Temporary password for <strong>{issuedReset.username}</strong>: <code>{issuedReset.password}</code>. Share it directly with the verified user and ask them to change it after signing in.
        </Alert>
      )}

      {/* My account — every signed-in user (incl. technicians) edits their own info */}
      <Paper variant="outlined" sx={{ overflow: 'hidden', mb: 3 }}>
        <Box sx={{ px: 2, py: 1.5, bgcolor: '#ffffff', borderBottom: '1px solid #f0f1f5' }}>
          <Typography sx={{ fontWeight: 800, fontSize: 14 }}><PersonIcon sx={{ verticalAlign: 'middle', mr: 0.5, color: '#6b7280', fontSize: 18 }} />My account</Typography>
        </Box>
        <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
          <TextField size="small" label="Display name" value={meName} onChange={(e) => setMeName(e.target.value)} sx={lightFieldSx} />
          <TextField size="small" label="Email" type="email" value={meEmail} onChange={(e) => setMeEmail(e.target.value)} sx={lightFieldSx} />
          <TextField size="small" label="Current password" type="password" value={pwdCur} onChange={(e) => setPwdCur(e.target.value)} autoComplete="current-password" sx={lightFieldSx} />
          <TextField size="small" label="New password (min 12)" type="password" value={pwdNew} onChange={(e) => setPwdNew(e.target.value)} autoComplete="new-password" sx={lightFieldSx} />
        </Box>
        {(meMsg || pwdMsg) && (
          <Typography variant="caption" sx={{ display: 'block', px: 2, color: '#0b7a31', fontWeight: 700 }}>{[meMsg, pwdMsg].filter(Boolean).join(' ')}</Typography>
        )}
        <Box sx={{ p: 2, pt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button size="small" variant="outlined" disabled={busy || !meName.trim()} onClick={saveMe} sx={{ borderRadius: 2 }}>Save profile</Button>
          <Button size="small" variant="outlined" disabled={busy || !pwdCur || pwdNew.length < 12} onClick={changePwd} sx={{ borderRadius: 2 }}>Change password</Button>
        </Box>
      </Paper>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
      ) : (
        <Stack spacing={3}>
          {canDelete && pendingCount > 0 && (
            <Alert severity="warning" sx={{ borderRadius: 2 }}>
              {pendingCount} new account{pendingCount === 1 ? '' : 's'} waiting for verification — activate them in the Accounts table below.
            </Alert>
          )}
          {/* Login accounts */}
          <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
            <Box sx={{ px: 2, py: 1.5, bgcolor: '#ffffff', borderBottom: '1px solid #f0f1f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography sx={{ fontWeight: 800, fontSize: 14 }}><PersonIcon sx={{ verticalAlign: 'middle', mr: 0.5, color: '#6b7280', fontSize: 18 }} />Accounts</Typography>
              <Typography variant="caption" color="text.secondary">{accounts.length}</Typography>
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#fafafa' }}>
                    <TableCell sx={{ fontWeight: 700 }}>User</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Role</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Department</TableCell>
                    {!isMobile && <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>}
                    <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                    {canDelete && <TableCell sx={{ fontWeight: 700 }} align="right">Admin actions</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {accounts.length === 0 && (
                    <TableRow><TableCell colSpan={canDelete ? 6 : 5} sx={{ color: '#9ca3af', fontStyle: 'italic' }}>No accounts.</TableCell></TableRow>
                  )}
                  {accounts.map((a) => (
                    <TableRow key={a.id} hover>
                      <TableCell>{a.displayName || a.username}</TableCell>
                      <TableCell>
                        {canDelete ? (
                          <Select size="small" value={a.role.toLowerCase()} disabled={busy} onChange={(e) => setAccountRole(a.id, e.target.value)} sx={{ minWidth: 150 }}>
                            {[
                              ['technician', 'Technician'],
                              ['admin', 'Admin'],
                              ['contracts manager', 'Contracts Manager'],
                              ['stores man', 'Stores Man'],
                            ].map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
                          </Select>
                        ) : renderRole(a.role)}
                      </TableCell>
                      <TableCell>{a.department || '—'}</TableCell>
                      {!isMobile && <TableCell sx={{ color: '#6b7280' }}>{a.email}</TableCell>}
                      <TableCell>
                        <Chip size="small" label={a.isActive ? 'Active' : 'Inactive'} sx={{ bgcolor: a.isActive ? '#0b7a3118' : '#9ca3af22', color: a.isActive ? '#0b7a31' : '#6b7280', fontWeight: 700 }} />
                      </TableCell>
                      {canDelete && (
                        <TableCell align="right">
                          <Button
                            size="small"
                            variant="text"
                            disabled={busy}
                            onClick={() => resetAccountPassword(a)}
                            sx={{ borderRadius: 2, mr: 0.5 }}
                          >
                            Reset password
                          </Button>
                          <Button
                            size="small"
                            variant={a.isActive ? 'text' : 'contained'}
                            color={a.isActive ? 'inherit' : 'success'}
                            disabled={busy}
                            onClick={() => setAccountActive(a.id, !a.isActive)}
                            sx={{ borderRadius: 2 }}
                          >
                            {a.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          {/* Technicians */}
          <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
            <Box sx={{ px: 2, py: 1.5, bgcolor: '#ffffff', borderBottom: '1px solid #f0f1f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography sx={{ fontWeight: 800, fontSize: 14 }}><BuildIcon sx={{ verticalAlign: 'middle', mr: 0.5, color: '#6b7280', fontSize: 18 }} />Technicians</Typography>
              <Typography variant="caption" color="text.secondary">{techs.length} · admin can delete</Typography>
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#fafafa' }}>
                    <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Trade</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Contact</TableCell>
                    {!isMobile && <TableCell sx={{ fontWeight: 700 }}>Certifications</TableCell>}
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Open jobs</TableCell>
                    {canDelete && <TableCell align="right" />}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {techs.length === 0 && (
                    <TableRow><TableCell colSpan={canDelete ? 6 : 5} sx={{ color: '#9ca3af', fontStyle: 'italic' }}>No technicians.</TableCell></TableRow>
                  )}
                  {techs.map((t) => (
                    <TableRow key={t.id} hover>
                      <TableCell sx={{ fontWeight: 700 }}>{t.name}</TableCell>
                      <TableCell>{t.trade || '—'}</TableCell>
                      <TableCell sx={{ color: '#6b7280' }}>{t.phone || t.email || '—'}</TableCell>
                      {!isMobile && <TableCell>{t.certifications || '—'}</TableCell>}
                      <TableCell align="right">
                        <Chip
                          size="small"
                          label={t.assignedJobs}
                          sx={{ bgcolor: t.assignedJobs > 0 ? '#FD460118' : '#9ca3af20', color: t.assignedJobs > 0 ? '#FD4601' : '#6b7280', fontWeight: 800, minWidth: 34 }}
                        />
                      </TableCell>
                      {canDelete && (
                        <TableCell align="right">
                          <Button
                            size="small"
                            color="error"
                            variant="text"
                            startIcon={<DeleteIcon />}
                            onClick={() => { setDeleting(t) }}
                          >
                            Delete
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Stack>
      )}

      <Divider sx={{ my: 2 }} />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
        <Button size="small" variant="outlined" startIcon={<AddIcon />} disabled>Add user</Button>
        <Typography variant="caption" color="text.secondary">Account creation lives on the login screen's "Create account" tab.</Typography>
      </Box>

      {/* Delete technician — typed confirm */}
      <Dialog open={deleting !== null} onClose={() => !busy && setDeleting(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Delete technician?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Remove <b>{deleting?.name}</b> from the technician register?
          </Typography>
          {techsAtRisk ? (
            <Typography variant="body2" color="warning.main" sx={{ mb: 1, fontWeight: 700 }}>
              This technician has active job cards. Deleting will leave those jobs unassigned — reassign them first.
            </Typography>
          ) : (
            <Typography variant="caption" color="text.secondary">This is recorded in the audit trail and cannot be undone.</Typography>
          )}
          <TextField
            autoFocus
            size="small"
            fullWidth
            placeholder={`Type "${deleting?.name ?? ''}" to confirm`}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            sx={{ mt: 1, '& input': { fontWeight: 700 }, ...lightFieldSx }}
          />
        </DialogContent>
        <DialogActions>
          <Button size="small" onClick={() => { setDeleting(null); setConfirmText('') }}>Cancel</Button>
          <Button
            size="small"
            color="error"
            variant="contained"
            disabled={!confirmMatches || busy}
            startIcon={busy ? <CircularProgress size={14} /> : <DeleteIcon />}
            onClick={doDelete}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {printable.node}
    </Box>
  )
}
