import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'

export function StatusView({ icon: Icon, title, message }: { icon: LucideIcon; title: string; message: string }) {
  return (
    <div className="grid place-items-center py-20 text-center">
      <div>
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-slate-100 text-slate-500"><Icon className="h-7 w-7" aria-hidden="true" /></div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{message}</p>
        <Link to="/" className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">Back to dashboard</Link>
      </div>
    </div>
  )
}
