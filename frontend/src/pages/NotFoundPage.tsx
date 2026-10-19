import { SearchX } from 'lucide-react'
import { StatusView } from '../components/StatusView'

export default function NotFoundPage() {
  return <StatusView icon={SearchX} title="Page not found" message="This page does not exist, or you do not have access to it." />
}
