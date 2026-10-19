import { Navigate, useLocation } from 'react-router-dom'
import { SearchX } from 'lucide-react'
import { StatusView } from '../components/StatusView'

export default function NotFoundPage() {
  const location = useLocation()
  if (location.pathname.toLowerCase().startsWith('/login')) {
    return <Navigate to="/" replace />
  }

  return (
    <StatusView
      icon={SearchX}
      title="Page not found"
      message="This page does not exist, or you do not have access to it."
      quote="The vault is locked, or this document doesn't exist in our records."
    />
  )
}
