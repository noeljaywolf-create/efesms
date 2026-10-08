import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  AppBar,
  Badge,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Toolbar,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import DashboardIcon from '@mui/icons-material/Dashboard'
import PeopleIcon from '@mui/icons-material/People'
import BusinessIcon from '@mui/icons-material/Business'
import FireExtinguisherIcon from '@mui/icons-material/FireExtinguisher'
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment'
import EngineeringIcon from '@mui/icons-material/Engineering'
import HomeRepairServiceIcon from '@mui/icons-material/HomeRepairService'
import FactCheckIcon from '@mui/icons-material/FactCheck'
import AssignmentIcon from '@mui/icons-material/Assignment'
import PropaneTankIcon from '@mui/icons-material/PropaneTank'
import BuildIcon from '@mui/icons-material/Build'
import InventoryIcon from '@mui/icons-material/Inventory'
import WarehouseIcon from '@mui/icons-material/Warehouse'
import RequestQuoteIcon from '@mui/icons-material/RequestQuote'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import VerifiedIcon from '@mui/icons-material/Verified'
import NotificationsIcon from '@mui/icons-material/Notifications'
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff'
import ReportProblemIcon from '@mui/icons-material/ReportProblem'
import AssessmentIcon from '@mui/icons-material/Assessment'
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts'
import SettingsIcon from '@mui/icons-material/Settings'
import LogoutIcon from '@mui/icons-material/Logout'
import CloseIcon from '@mui/icons-material/Close'
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined'
import { NAV } from '../lib/navigation'
import { useApp } from '../App'
import { api } from '../api/client'

// sidebar icons — gradient-tinted chips for a modern feel
const ICONS: Record<string, ReactNode> = {
  '/dashboard': <DashboardIcon />,
  '/customers': <PeopleIcon />,
  '/sites': <BusinessIcon />,
  '/equipment': <FireExtinguisherIcon />,
  '/technicians': <EngineeringIcon />,
  '/inspections': <FactCheckIcon />,
  '/services': <HomeRepairServiceIcon />,
  '/refills': <PropaneTankIcon />,
  '/maintenance': <BuildIcon />,
  '/jobs': <AssignmentIcon />,
  '/anomalies': <ReportProblemIcon />,
  '/inventory': <InventoryIcon />,
  '/stores': <WarehouseIcon />,
  '/quotations': <RequestQuoteIcon />,
  '/invoices': <ReceiptLongIcon />,
  '/certificates': <VerifiedIcon />,
  '/reminders': <NotificationsIcon />,
  '/reports': <AssessmentIcon />,
  '/users': <ManageAccountsIcon />,
  '/settings': <SettingsIcon />,
}

const ICON_TINTS: Record<string, string> = {
  '/dashboard': '#FF8A3D',
  '/customers': '#42A5F5',
  '/sites': '#26C6DA',
  '/equipment': '#FF5252',
  '/technicians': '#AB7BFF',
  '/inspections': '#00CFA2',
  '/services': '#69D36E',
  '/refills': '#C77DFF',
  '/maintenance': '#FFC247',
  '/jobs': '#FF7043',
  '/anomalies': '#FF5C93',
  '/inventory': '#A3D94A',
  '/stores': '#4DD0E1',
  '/quotations': '#64B5F6',
  '/invoices': '#FFD166',
  '/certificates': '#4DD0E1',
  '/reminders': '#F062C0',
  '/reports': '#818CF8',
  '/users': '#80CBC4',
  '/settings': '#B0BEC5',
}

const DRAWER_WIDTH = 250

export default function AppLayout() {
  const theme = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const { notifications, addNotification, removeNotification, sidebarOpen, setSidebarOpen } = useApp()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [accountEl, setAccountEl] = useState<null | HTMLElement>(null)
  const [bellEnabled, setBellEnabled] = useState<boolean | null>(null)
  const [bellSaving, setBellSaving] = useState(false)
  const role = localStorage.getItem('efesms_role') ?? 'admin'
  const bellLoaded = useRef(false)

  // Keep the bell connected to the saved setting and only surface reminders
  // while notifications are enabled in the shared system settings.
  useEffect(() => {
    if (bellLoaded.current || !localStorage.getItem('efesms_token')) return
    bellLoaded.current = true
    const loadBell = async () => {
      try {
        const { data: settings } = await api.get<Record<string, any>>('/settings')
        setBellEnabled(settings.notificationsEnabled !== false)
        if (settings.notificationsEnabled === false) return
        const { data } = await api.post<{ reminders: { category: string; severity: string; message: string; daysUntilDue: number }[] }>('/operations/analyze/full', {})
        const urgent = (data.reminders ?? [])
          .filter((r) => r.severity === 'Critical' || r.daysUntilDue < 0)
          .slice(0, 5)
        urgent.forEach((r) => addNotification(
          `[${r.category}] ${r.message}`,
          r.severity === 'Critical' ? 'error' : 'warning',
        ))
      } catch {
        // Keep the icon usable if settings cannot be read; reminder loading
        // itself remains quiet when the API/analysis engine is unreachable.
        setBellEnabled(true)
      }
    }
    loadBell()
  }, [addNotification])

  const toggleNotifications = async () => {
    if (bellSaving || bellEnabled === null) return
    const enabled = !bellEnabled
    setBellSaving(true)
    try {
      await api.put('/settings', { notificationsEnabled: enabled })
      setBellEnabled(enabled)
      if (!enabled) {
        notifications.forEach((n) => removeNotification(n.id))
      } else {
        const { data } = await api.post<{ reminders: { category: string; severity: string; message: string; daysUntilDue: number }[] }>('/operations/analyze/full', {})
        ;(data.reminders ?? [])
          .filter((r) => r.severity === 'Critical' || r.daysUntilDue < 0)
          .slice(0, 5)
          .forEach((r) => addNotification(`[${r.category}] ${r.message}`, r.severity === 'Critical' ? 'error' : 'warning'))
      }
    } catch {
      addNotification('Could not update notification settings. Check your access and connection.', 'error')
    } finally {
      setBellSaving(false)
    }
  }

  const logout = () => {
    setAccountEl(null)
    localStorage.removeItem('efesms_token')
    localStorage.removeItem('efesms_role')
    localStorage.removeItem('efesms_dept')
    localStorage.removeItem('efesms_display')
    localStorage.removeItem('efesms_user')
    navigate('/login')
  }

  const drawer = (
    <Box sx={{ height: '100%', bgcolor: '#12121a', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
      <Toolbar sx={{ px: 2, gap: 1.5 }}>
        <Box
          sx={{
            width: 36, height: 36, borderRadius: 2.5,
            bgcolor: 'rgba(255,61,0,0.15)',
            border: '1px solid rgba(255,61,0,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <LocalFireDepartmentIcon sx={{ color: '#FF3D00', fontSize: 22 }} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 800, color: '#f2f2f7', fontSize: 14, lineHeight: 1.15, letterSpacing: '-0.01em' }}>
            Extreme Fire
          </Typography>
          <Typography sx={{ fontWeight: 800, color: '#FF3D00', fontSize: 14, lineHeight: 1.15, letterSpacing: '-0.01em' }}>
            Services
          </Typography>
        </Box>
      </Toolbar>
      <Divider />
      <List component="nav" sx={{ px: 1, py: 1 }}>
        {NAV.map((group) => (
          <Box key={group.label}>
            <Typography
              variant="caption"
              sx={{ px: 2, pt: 1.5, pb: 0.5, display: 'block', fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: 0.08 }}
            >
              {group.label.toUpperCase()}
            </Typography>
            {group.items.map((item, idx) => (
              <ListItemButton
                key={item.path}
                selected={location.pathname === item.path || (item.path !== '/dashboard' && location.pathname.startsWith(item.path + '/'))}
                onClick={() => {
                  navigate(item.path)
                  setMobileOpen(false)
                }}
                sx={{
                  borderRadius: 1.5,
                  mb: 0.25,
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'transform .2s ease, box-shadow .25s ease',
                  animation: 'ef-nav-in .5s ease both',
                  animationDelay: `${idx * 60}ms`,
                  color: '#ffffff',
                  bgcolor: 'transparent',
                  '&:hover': {
                    transform: 'translateX(5px)',
                    bgcolor: 'rgba(255,255,255,0.05)',
                    boxShadow: '0 4px 18px rgba(0,0,0,0.35)',
                  },
                  '&:hover .ef-nav-icon': { transform: 'translateX(2px)' },
                  '&:hover .ef-icon-chip': { boxShadow: `0 0 16px ${ICON_TINTS[item.path] ?? '#FF3D00'}44`, transform: 'scale(1.06)' },
                  '&.Mui-selected': {
                    color: '#ffffff',
                    bgcolor: 'rgba(255,61,0,0.18)',
                    boxShadow: 'inset 3px 0 0 #ff3d00, 0 4px 20px rgba(255,61,0,0.15)',
                  },
                  '&.Mui-selected .ef-icon-chip': {
                    boxShadow: `0 0 18px ${ICON_TINTS[item.path] ?? '#FF3D00'}55`,
                    borderColor: `${ICON_TINTS[item.path] ?? '#FF3D00'}77`,
                  },
                  '& .MuiListItemText-primary': {
                    color: 'inherit',
                    fontWeight: 700,
                  },
                }}
              >
                <ListItemIcon
                  className="ef-nav-icon"
                  sx={{
                    minWidth: 40,
                    transition: 'transform .25s ease',
                    color: 'inherit',
                    '& .ef-icon-chip': {
                      width: 32, height: 32, borderRadius: 1.75,
                      display: 'grid', placeItems: 'center',
                      background: `linear-gradient(135deg, ${ICON_TINTS[item.path] ?? '#FF3D00'}30, ${ICON_TINTS[item.path] ?? '#FF3D00'}10)`,
                      border: `1px solid ${ICON_TINTS[item.path] ?? '#FF3D00'}38`,
                      color: ICON_TINTS[item.path] ?? '#FF3D00',
                      transition: 'box-shadow .25s ease, transform .25s ease',
                      '& svg': { fontSize: 18 },
                    },
                  }}
                >
                  <Box className="ef-icon-chip">{ICONS[item.path]}</Box>
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  slotProps={{ primary: { sx: { fontSize: 14 } } }}
                />
              </ListItemButton>
            ))}
          </Box>
        ))}
      </List>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{ zIndex: theme.zIndex.drawer + 1, bgcolor: 'rgba(10,10,15,0.85)', backdropFilter: 'blur(14px)', color: '#f2f2f7', borderBottom: '1px solid rgba(255,255,255,0.08)' }}
      >
        <Toolbar sx={{ minHeight: { xs: 56, sm: 64 } }}>
          <IconButton edge="start" onClick={() => setMobileOpen(true)} sx={{ mr: 1.5, display: { md: 'none' }, color: '#f2f2f7', minWidth: 44, minHeight: 44 }}>
            <MenuIcon />
          </IconButton>
          <Typography
            variant="h6"
            sx={{
              flexGrow: 1,
              fontWeight: 800,
              fontSize: { xs: 14, sm: 17 },
              letterSpacing: '-0.01em',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            Extreme Fire Equipment &amp; Services
          </Typography>
          <Tooltip title={bellEnabled === false ? 'Notifications muted — tap to enable' : 'Notifications enabled — tap to mute'}>
            <IconButton
              aria-label={bellEnabled === false ? 'Enable notifications' : 'Mute notifications'}
              disabled={bellEnabled === null || bellSaving}
              onClick={() => void toggleNotifications()}
              sx={{ color: bellEnabled === false ? '#9aa0b0' : notifications.length ? '#FF6E40' : '#f2f2f7', minWidth: 44, minHeight: 44 }}
            >
              <Badge badgeContent={notifications.length} color="primary">
                {bellEnabled === false ? <NotificationsOffIcon /> : <NotificationsIcon />}
              </Badge>
            </IconButton>
          </Tooltip>
          <Tooltip title="Account">
            <IconButton onClick={(e) => setAccountEl(e.currentTarget)} sx={{ color: '#9aa0b0', minWidth: 44, minHeight: 44 }}>
              <BadgeOutlinedIcon />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={accountEl}
            open={!!accountEl}
            onClose={() => setAccountEl(null)}
            slotProps={{ paper: { sx: { mt: 1, minWidth: 200, borderRadius: 2, border: '1px solid rgba(255,255,255,0.08)', bgcolor: '#16161f' } } }}
          >
            <MenuItem disabled sx={{ minWidth: 160, fontWeight: 700 }}>Role: {role}</MenuItem>
            <MenuItem onClick={logout} sx={{ color: '#FF6E40', fontWeight: 700, '&:hover': { bgcolor: '#FF3D0014' } }}>
              <ListItemIcon><LogoutIcon fontSize="small" sx={{ color: '#FF6E40' }} /></ListItemIcon>
              Logout
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
        <Drawer
          variant="temporary"
          open={mobileOpen || sidebarOpen}
          onClose={() => { setMobileOpen(false); setSidebarOpen(false) }}
          ModalProps={{ keepMounted: true }}
          sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: DRAWER_WIDTH } }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          open
          sx={{ display: { xs: 'none', md: 'block' }, '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' } }}
        >
          {drawer}
        </Drawer>
      </Box>

      <Box component="main" sx={{ flexGrow: 1, p: { xs: 1.5, sm: 3 }, mt: { xs: 7, sm: 8 }, width: { xs: '100%', md: `calc(100% - ${DRAWER_WIDTH}px)` } }}>
        <Outlet />
        {notifications.map((n) => (
          <Box key={n.id} sx={{ position: 'fixed', top: { xs: 68, sm: 80 }, right: { xs: 12, sm: 24 }, left: { xs: 12, sm: 'auto' }, zIndex: 1500, animation: 'slideIn .3s ease' }}>
            <Box
              role="alert"
              sx={{
                px: 2, py: 1.5, borderRadius: 2, bgcolor: 'rgba(22,22,31,0.95)', border: '1px solid', minWidth: { xs: 'auto', sm: 280 }, maxWidth: { xs: '100%', sm: 360 },
                borderColor: n.type === 'error' ? '#fc0000' : n.type === 'warning' ? '#ff8a00' : n.type === 'success' ? '#0b7a31' : '#2196f3',
                boxShadow: '0 8px 32px rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', gap: 1.5, animation: 'slideIn .3s ease',
                backdropFilter: 'blur(14px)',
              }}
            >
              <Typography color="white" variant="body2" sx={{ flexGrow: 1 }}>{n.message}</Typography>
              <IconButton size="small" onClick={() => removeNotification(n.id)} sx={{ color: 'rgba(255,255,255,0.7)', minWidth: 36, minHeight: 36 }}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
