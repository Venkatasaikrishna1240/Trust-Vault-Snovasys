import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { AlertCircle, Shield } from 'lucide-react'

export function EmptyState({
  icon: Icon,
  title,
  description,
  quote,
  action,
}: {
  icon: LucideIcon
  title: string
  description?: string
  quote?: string
  action?: ReactNode
}) {
  return (
    <div className="vault-enter flex flex-col items-center px-6 py-14 text-center">
      <div className="relative mb-4">
        <div className="grid h-14 w-14 place-items-center rounded-2xl border border-blue-200/80 bg-gradient-to-br from-blue-50 to-indigo-50/80 text-blue-600 shadow-xs ring-4 ring-blue-50/50">
          <Icon className="h-7 w-7" aria-hidden="true" />
        </div>
      </div>
      <h3 className="text-base font-bold tracking-tight text-slate-900">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-slate-500 leading-relaxed">{description}</p>}
      {quote && (
        <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-slate-100/80 px-3 py-1 text-xs font-medium text-slate-600 border border-slate-200/60">
          <Shield className="h-3 w-3 text-blue-500" aria-hidden="true" />
          <span>{quote}</span>
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="vault-enter flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50/90 px-4 py-3 text-sm text-rose-800 shadow-2xs"
    >
      <div className="flex items-center gap-2.5">
        <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
        <span className="font-medium">{message}</span>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="cursor-pointer font-semibold text-rose-900 underline hover:text-rose-950 text-xs uppercase tracking-wider"
        >
          Retry
        </button>
      )}
    </div>
  )
}
