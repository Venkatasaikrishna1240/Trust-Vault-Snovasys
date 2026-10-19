import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { Spinner } from '../../components/ui/Skeleton'
import AccessDenied from '../../pages/AccessDenied'

export function RequireAuth() {
  const { session, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="grid h-full place-items-center"><Spinner label="Loading session" /></div>
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

/** UX-only guard; the server enforces admin access. */
export function RequireAdmin() {
  const { profile } = useAuth()
  if (profile?.role !== 'admin') return <AccessDenied />
  return <Outlet />
}
