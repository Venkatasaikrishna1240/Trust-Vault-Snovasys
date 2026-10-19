import type { ReactNode } from 'react'
import { cx } from './cx'
import type { Access } from '../../types'
import { accessLabel } from '../../lib/format'

type Tone = 'slate' | 'indigo' | 'green' | 'amber' | 'red' | 'blue'
const tones: Record<Tone, { badge: string; dot: string }> = {
  slate: {
    badge: 'bg-slate-100/90 text-slate-700 border-slate-200/80',
    dot: 'bg-slate-400',
  },
  indigo: {
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
    dot: 'bg-indigo-500',
  },
  blue: {
    badge: 'bg-blue-50 text-blue-700 border-blue-200/80',
    dot: 'bg-blue-500',
  },
  green: {
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
    dot: 'bg-emerald-500',
  },
  amber: {
    badge: 'bg-amber-50 text-amber-800 border-amber-200/80',
    dot: 'bg-amber-500',
  },
  red: {
    badge: 'bg-rose-50 text-rose-700 border-rose-200/80',
    dot: 'bg-rose-500',
  },
}

export function Badge({
  tone = 'slate',
  showDot = false,
  children,
}: {
  tone?: Tone
  showDot?: boolean
  children: ReactNode
}) {
  const current = tones[tone] ?? tones.slate
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-tight',
        current.badge,
      )}
    >
      {showDot && <span className={cx('h-1.5 w-1.5 rounded-full', current.dot)} aria-hidden="true" />}
      {children}
    </span>
  )
}

export function AccessBadge({ access }: { access: Access }) {
  return (
    <Badge
      tone={access === 'owner' ? 'indigo' : access === 'edit' ? 'green' : 'slate'}
      showDot
    >
      {accessLabel(access)}
    </Badge>
  )
}
