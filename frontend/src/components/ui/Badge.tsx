import type { ReactNode } from 'react'
import { cx } from './cx'
import type { Access } from '../../types'
import { accessLabel } from '../../lib/format'

type Tone = 'slate' | 'indigo' | 'green' | 'amber' | 'red'
const tones: Record<Tone, string> = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  indigo: 'bg-brand-50 text-brand-700 ring-brand-100',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
}

export function Badge({ tone = 'slate', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', tones[tone])}>{children}</span>
}

export function AccessBadge({ access }: { access: Access }) {
  return <Badge tone={access === 'owner' ? 'indigo' : access === 'edit' ? 'green' : 'slate'}>{accessLabel(access)}</Badge>
}
