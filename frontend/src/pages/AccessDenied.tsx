import { Lock } from 'lucide-react'
import { StatusView } from '../components/StatusView'

export default function AccessDenied() {
  return (
    <StatusView
      icon={Lock}
      title="Access denied"
      message="You do not have permission to view this page."
      quote="Access denied. Nice try, secret agent."
    />
  )
}
