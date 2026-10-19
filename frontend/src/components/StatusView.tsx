import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import { ArrowLeft, Shield } from 'lucide-react'

export function StatusView({
  icon: Icon,
  title,
  message,
  quote,
}: {
  icon: LucideIcon
  title: string
  message: string
  quote?: string
}) {
  return (
    <div className="vault-enter grid place-items-center py-16 text-center">
      <div className="max-w-md px-4">
        <div className="relative mx-auto mb-5">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-100 to-slate-200/80 text-slate-700 shadow-xs ring-4 ring-slate-100/60">
            <Icon className="h-8 w-8" aria-hidden="true" />
          </div>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-500 leading-relaxed">{message}</p>
        {quote && (
          <div className="mt-3.5 inline-flex items-center gap-1.5 rounded-full border border-blue-200/80 bg-blue-50/80 px-3.5 py-1 text-xs font-semibold text-blue-800">
            <Shield className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
            <span>{quote}</span>
          </div>
        )}
        <div className="mt-7">
          <Link
            to="/"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 transition-all hover:-translate-y-px"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Back to dashboard</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
