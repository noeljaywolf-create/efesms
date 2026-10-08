import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert, Box, Button, CircularProgress, Divider, IconButton, InputAdornment, TextField, Typography,
} from '@mui/material'
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined'
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined'
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment'
import { api } from '../api/client'

const fieldSx = {
  '& .MuiInputBase-input': { color: '#0f0f13', caretColor: '#FF3D00' },
  '& .MuiInputLabel-root': { color: '#6b7280', '&.Mui-focused': { color: '#FF3D00' } },
  '& .MuiOutlinedInput-root': {
    backgroundColor: '#ffffff',
    '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e5e7eb' },
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#FF3D00' },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#FF3D00' },
  },
}

const setSession = (data: any, fallbackName: string) => {
  const u = data.user ?? {}
  const role = u.Role ?? u.role ?? 'admin'
  const dept = u.Department ?? u.department ?? 'Administration'
  const name = u.DisplayName ?? u.displayName ?? u.Name ?? u.name ?? u.Username ?? u.username ?? fallbackName
  // App.tsx hydrates efesms_user via JSON.parse into {id,name,role,department},
  // so store the object — a bare string parses to null and breaks useApp().user.
  const session = { id: String(u.Id ?? u.id ?? ''), name, role, department: dept }
  localStorage.setItem('efesms_token', data.token)
  localStorage.setItem('efesms_role', role)
  localStorage.setItem('efesms_dept', dept)
  localStorage.setItem('efesms_display', name)
  localStorage.setItem('efesms_user', JSON.stringify(session))
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const googleBtnRef = useRef<HTMLDivElement>(null)
  const googleClientId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID as string | undefined

  // Google sign-in button (only when a workspace client ID is configured).
  useEffect(() => {
    if (!googleClientId || mode !== 'login' || !googleBtnRef.current) return
    let cancelled = false
    const onCred = async (resp: any) => {
      setLoading(true)
      setError('')
      try {
        const { data } = await api.post('/auth/google', { idToken: resp?.credential })
        setSession(data, data?.user?.username ?? 'google user')
        navigate('/dashboard', { replace: true })
      } catch (x: any) {
        setError(x?.response?.data?.message ?? 'Google sign-in failed.')
      } finally {
        setLoading(false)
      }
    }
    const render = () => {
      if (cancelled || !googleBtnRef.current) return
      const g = (window as any).google?.accounts?.id
      if (!g) { setTimeout(render, 400); return }
      g.initialize({ client_id: googleClientId, callback: onCred })
      g.renderButton(googleBtnRef.current, { theme: 'outline', size: 'large', width: 320 })
    }
    if (!(window as any).google?.accounts?.id) {
      const s = document.createElement('script')
      s.src = 'https://accounts.google.com/gsi/client'
      s.async = true
      s.defer = true
      s.onload = render
      document.head.appendChild(s)
    } else {
      render()
    }
    return () => { cancelled = true }
  }, [googleClientId, mode])

  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) {
      setError('Enter your username or email.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const { data } = await api.post('/auth/forgot-password', { username: email })
      setError(data?.message ?? 'Ask your system administrator to verify your identity and issue a secure reset.')
    } catch (x: any) {
      setError(x?.response?.data?.message ?? 'Could not process the password reset request.')
    } finally {
      setLoading(false)
    }
  }

  const switchMode = (m: 'login' | 'register' | 'forgot') => {
    setMode(m)
    setError('')
    setPassword('')
  }

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      setError('Please fill in your email and password.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const { data } = await api.post('/auth/login', { username: email, password })
      setSession(data, email)
      navigate('/dashboard', { replace: true })
    } catch {
      setError('Invalid email or password.')
    } finally {
      setLoading(false)
    }
  }

  const submitRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !email || !password) {
      setError('Please fill in all fields.')
      return
    }
    if (password.length < 12) {
      setError('Password must be at least 12 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const { data } = await api.post('/auth/register', {
        username,
        email,
        password,
        displayName,
      })
      if (data?.pendingApproval) {
        setError('')
        switchMode('login')
        setError('Account created — an administrator must verify it before you can sign in.')
        return
      }
      setSession(data, username)
      navigate('/dashboard', { replace: true })
    } catch (x: any) {
      setError(x?.response?.data?.message ?? 'Could not create the account.')
    } finally {
      setLoading(false)
    }
  }

  const isLogin = mode === 'login'

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: '#0a0a0f',
        backgroundImage: 'radial-gradient(1100px 600px at 50% -10%, rgba(255,61,0,0.12), transparent 60%)',
        px: 2,
        py: 4,
      }}
    >
      <Box
        sx={{
          width: '100%',
          maxWidth: 480,
          bgcolor: '#ffffff',
          borderRadius: '18px',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
          p: { xs: 4, sm: 6 },
        }}
      >
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: 3, bgcolor: '#FF3D0014', border: '1px solid #FF3D0033', mb: 2 }}>
            <LocalFireDepartmentIcon sx={{ color: '#FF3D00', fontSize: 32 }} />
          </Box>
          <Typography variant="h4" sx={{ fontWeight: 800, color: '#0f0f13', letterSpacing: '-0.01em' }}>
            {isLogin ? 'Log in to your account' : mode === 'register' ? 'Create an account' : 'Reset your password'}
          </Typography>
          <Typography variant="body1" sx={{ color: '#6b7280', mt: 1 }}>
            Extreme Fire Services · Fire Management System
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={isLogin ? submitLogin : mode === 'register' ? submitRegister : submitForgot} noValidate>
          {mode === 'forgot' ? (
            <>
              <Typography variant="body2" sx={{ color: '#6b7280', mb: 2.5 }}>
                Enter your username or email. For your security, this form does not change or reveal passwords. Ask your system administrator to verify your identity and issue a reset.
              </Typography>
              <TextField
                label="Username or email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                fullWidth
                required
                autoComplete="username"
                size="medium"
                sx={{ mb: 2.5, ...fieldSx }}
              />
            </>
          ) : (
            <>
              {!isLogin && (
                <>
                  <TextField
                    label="Full name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    fullWidth
                    size="medium"
                    sx={{ mb: 2.5, ...fieldSx }}
                  />
                  <TextField
                    label="Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    fullWidth
                    required
                    autoComplete="username"
                    size="medium"
                    sx={{ mb: 2.5, ...fieldSx }}
                  />
                  <Typography variant="body2" sx={{ color: '#6b7280', mb: 2.5 }}>
                    Public registration cannot select or grant roles. After initial setup, new accounts require administrator approval.
                  </Typography>
                </>
              )}

              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                fullWidth
                required
                autoComplete="username"
                size="medium"
                sx={{ mb: 2.5, ...fieldSx }}
              />

              <TextField
                label="Password"
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                fullWidth
                required
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                size="medium"
                sx={{ mb: isLogin ? 3.5 : 2.5, ...fieldSx }}
                slotProps={{
                  htmlInput: { minLength: isLogin ? undefined : 12, maxLength: 72 },
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          onClick={() => setShowPwd((s) => !s)}
                          edge="end"
                          aria-label="toggle password visibility"
                          sx={{ color: '#6b7280', '&:hover': { color: '#FF3D00', bgcolor: '#FF3D0014' } }}
                        >
                          {showPwd ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />

              {!isLogin && (
                <TextField
                  label="Confirm password"
                  type={showPwd ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  fullWidth
                  required
                  autoComplete="new-password"
                  size="medium"
                  sx={{ mb: 3.5, ...fieldSx }}
                />
              )}
            </>
          )}

          <Button
            type="submit"
            variant="contained"
            fullWidth
            size="large"
            disabled={loading}
            sx={{
              py: 1.5,
              fontSize: 16,
              fontWeight: 700,
              borderRadius: 2,
              textTransform: 'none',
              bgcolor: '#FF3D00',
              '&:hover': { bgcolor: '#DD2C00' },
              boxShadow: '0 8px 24px rgba(255,61,0,0.35)',
            }}
          >
            {loading ? <CircularProgress size={22} sx={{ color: '#fff' }} /> : isLogin ? 'Log in' : mode === 'register' ? 'Create account' : 'Send temporary password'}
          </Button>

          <Divider sx={{ my: 3 }} />

          {isLogin && googleClientId && (
            <Box sx={{ mb: 3, display: 'flex', justifyContent: 'center' }}>
              <div ref={googleBtnRef} />
            </Box>
          )}

          <Box sx={{ textAlign: 'center' }}>
            {mode === 'forgot' ? (
              <Typography variant="body2" sx={{ color: '#9aa0b0' }}>
                Remembered it?{' '}
                <Box
                  component="span"
                  onClick={() => switchMode('login')}
                  sx={{ color: '#FF3D00', fontWeight: 700, cursor: 'pointer', '&:hover': { color: '#DD2C00', textDecoration: 'underline' } }}
                >
                  Back to log in
                </Box>
              </Typography>
            ) : (
              <>
                <Typography variant="body2" sx={{ color: '#9aa0b0' }}>
                  {isLogin ? "Don't have an account? " : 'Already have an account? '}
                  <Box
                    component="span"
                    onClick={() => switchMode(isLogin ? 'register' : 'login')}
                    sx={{
                      color: '#FF3D00',
                      fontWeight: 700,
                      cursor: 'pointer',
                      '&:hover': { color: '#DD2C00', textDecoration: 'underline' },
                    }}
                  >
                    {isLogin ? 'Create one' : 'Log in'}
                  </Box>
                </Typography>
                {isLogin && (
                  <Typography variant="body2" sx={{ color: '#9aa0b0', mt: 1.5 }}>
                    Can't sign in?{' '}
                    <Box
                      component="span"
                      onClick={() => switchMode('forgot')}
                      sx={{ color: '#FF3D00', fontWeight: 700, cursor: 'pointer', '&:hover': { color: '#DD2C00', textDecoration: 'underline' } }}
                    >
                      Forgot password
                    </Box>
                  </Typography>
                )}
              </>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
