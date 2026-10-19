import { Loader2, ShieldCheck } from 'lucide-react'
import { cx } from './cx'

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx('vault-skeleton rounded-lg', className)} />
}

export function SkeletonRows({
  rows = 5,
  label = 'Checking the vault…',
  quote,
}: {
  rows?: number
  label?: string
  quote?: string
}) {
  return (
    <div role="status" aria-label={label} className="space-y-3 p-5">
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5 text-blue-500 animate-pulse" aria-hidden="true" />
          <span>{quote || 'Checking vault permissions…'}</span>
        </div>
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton
          key={i}
          className={cx(
            'h-9 w-full',
            i % 3 === 1 ? 'opacity-85' : i % 3 === 2 ? 'opacity-70' : 'opacity-100',
          )}
        />
      ))}
    </div>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin text-blue-600" aria-hidden="true" />
      {label}
    </span>
  )
}
