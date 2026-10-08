import { Navigate, Outlet, useLocation } from 'react-router-dom'

// Auth guard — token presence gates the app shell (SRS §28 AUTH-001/PERM-001)
export default function ProtectedRoute() {
  const location = useLocation()
  const token = localStorage.getItem('efesms_token')
  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return <Outlet />
}