import { createContext, useContext, useState, useCallback, useEffect, lazy, Suspense, type ReactNode } from 'react'
import { Routes, Route } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './layouts/AppLayout'
import ModulePlaceholderPage from './pages/ModulePlaceholderPage'
import NotFoundPage from './pages/NotFoundPage'
import { NAV } from './lib/navigation'

// Keep each business area in its own route chunk so the browser downloads it
// when the user visits that section, instead of loading the entire system at login.
const LoginPage = lazy(() => import('./pages/LoginPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const CustomersPage = lazy(() => import('./pages/CustomersPage'))
const JobsPage = lazy(() => import('./pages/JobsPage'))
const EquipmentPage = lazy(() => import('./pages/EquipmentPage'))
const InventoryPage = lazy(() => import('./pages/InventoryPage'))
const StoresPage = lazy(() => import('./pages/StoresPage'))
const RemindersPage = lazy(() => import('./pages/RemindersPage'))
const AnomaliesPage = lazy(() => import('./pages/AnomaliesPage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const ServicesPage = lazy(() => import('./pages/ServicesPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const UsersPage = lazy(() => import('./pages/UsersPage'))
const QuotationsPage = lazy(() => import('./pages/QuotationsPage'))
const SitesPage = lazy(() => import('./pages/SitesPage'))
const InspectionsPage = lazy(() => import('./pages/OpsModulePages').then((m) => ({ default: m.InspectionsPage })))
const RefillsPage = lazy(() => import('./pages/OpsModulePages').then((m) => ({ default: m.RefillsPage })))
const MaintenancePage = lazy(() => import('./pages/OpsModulePages').then((m) => ({ default: m.MaintenancePage })))
const CertificatesPage = lazy(() => import('./pages/OpsModulePages').then((m) => ({ default: m.CertificatesPage })))
const InvoicesPage = lazy(() => import('./pages/OpsModulePages').then((m) => ({ default: m.InvoicesPage })))
const TechniciansPage = lazy(() => import('./pages/OpsModulePages').then((m) => ({ default: m.TechniciansPage })))

function RouteLoading() {
  return <div role="status" aria-live="polite" style={{ padding: 24, color: '#f2f2f7' }}>Loading section…</div>
}

interface AppContextType {
  user: { id: string; name: string; role: string; department: string } | null
  setUser: (u: AppContextType['user']) => void
  notifications: { id: string; message: string; type: 'info' | 'warning' | 'error' | 'success' }[]
  addNotification: (msg: string, type?: 'info' | 'warning' | 'error' | 'success') => void
  removeNotification: (id: string) => void
  globalLoading: boolean
  setGlobalLoading: (v: boolean) => void
  refreshTrigger: number
  triggerRefresh: () => void
  sidebarOpen: boolean
  setSidebarOpen: (v: boolean) => void
}

const AppContext = createContext<AppContextType | null>(null)

export const useApp = () => {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}

function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppContextType['user']>(() => {
    try { return JSON.parse(localStorage.getItem('efesms_user') || 'null') } catch { return null }
  })
  const [notifications, setNotifications] = useState<AppContextType['notifications']>([])
  const [globalLoading, setGlobalLoading] = useState(false)
  const [refreshTrigger, setRefreshTrigger] = useState(0)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (user) localStorage.setItem('efesms_user', JSON.stringify(user))
    else localStorage.removeItem('efesms_user')
  }, [user])

  const addNotification = useCallback((message: string, type: 'info' | 'warning' | 'error' | 'success' = 'info') => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2)
    setNotifications(prev => [...prev, { id, message, type }])
    setTimeout(() => removeNotification(id), 5000)
  }, [])

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  const triggerRefresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1)
  }, [])

  return (
    <AppContext.Provider value={{
      user, setUser,
      notifications, addNotification, removeNotification,
      globalLoading, setGlobalLoading,
      refreshTrigger, triggerRefresh,
      sidebarOpen, setSidebarOpen,
    }}>
      {children}
    </AppContext.Provider>
  )
}

function App() {
  // Ask for device-notification permission on boot (first open after install)
  // so phones & computers can surface Smart Reminders as notifications.
  return (
    <AppProvider>
      <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/customers" element={<CustomersPage />} />
            <Route path="/sites" element={<SitesPage />} />
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/equipment" element={<EquipmentPage />} />
            <Route path="/inventory" element={<InventoryPage />} />
            <Route path="/stores" element={<StoresPage />} />
            <Route path="/reminders" element={<RemindersPage />} />
            <Route path="/anomalies" element={<AnomaliesPage />} />
            <Route path="/services" element={<ServicesPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/inspections" element={<InspectionsPage />} />
            <Route path="/refills" element={<RefillsPage />} />
            <Route path="/maintenance" element={<MaintenancePage />} />
            <Route path="/technicians" element={<TechniciansPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/invoices" element={<InvoicesPage />} />
            <Route path="/quotations" element={<QuotationsPage />} />
            <Route path="/certificates" element={<CertificatesPage />} />
            {NAV.flatMap((group) =>
              group.items
                .filter((item) => ![
                  '/', '/dashboard', '/customers', '/sites', '/jobs', '/equipment', '/inventory', '/reminders',
                  '/anomalies', '/services', '/reports', '/settings', '/inspections', '/stores',
                  '/refills', '/maintenance', '/technicians', '/users', '/invoices', '/certificates',
                  '/quotations'
                ].includes(item.path))
                .map((item) => (
                  <Route
                    key={item.path}
                    path={item.path}
                    element={<ModulePlaceholderPage title={item.label} />}
                  />
                )),
            )}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
      </Suspense>
    </AppProvider>
  )
}

export default App
