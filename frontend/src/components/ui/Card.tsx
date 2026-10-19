import type { ReactNode } from 'react'
import { cx } from './cx'

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        'vault-enter rounded-xl border border-slate-200/90 bg-white shadow-xs transition-[box-shadow,border-color] duration-200 hover:border-slate-300/90 hover:shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="vault-enter mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
