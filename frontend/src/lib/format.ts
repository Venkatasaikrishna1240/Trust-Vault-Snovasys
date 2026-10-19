import type { Access, Category } from '../types'
import { CATEGORIES } from '../types'

export function toNumber(v: number | string | null | undefined): number {
  const n = typeof v === 'string' ? Number(v) : v ?? 0
  return Number.isFinite(n) ? n : 0
}

export function formatBytes(input: number | string): string {
  const n = toNumber(input)
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function categoryLabel(c: Category | string): string {
  return CATEGORIES.find((x) => x.value === c)?.label ?? c
}

export function accessLabel(a: Access): string {
  return a === 'owner' ? 'Owner' : a === 'edit' ? 'Editor' : 'Viewer'
}

const ACTION_LABELS: Record<string, string> = {
  'document.upload': 'Uploaded a document',
  'document.download': 'Downloaded a document',
  'document.view': 'Viewed a document',
  'document.get': 'Viewed a document',
  'document.edit': 'Edited a document',
  'document.replace': 'Replaced a document file',
  'document.delete': 'Deleted a document',
  'document.share': 'Changed document sharing',
  'document.grant': 'Shared a document',
  'document.revoke': 'Revoked document access',
  'admin.audit_query': 'Queried the audit log',
  'admin.set_role': 'Changed a user role',
}

export function actionLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action]
  const cleaned = action.replace(/[._]+/g, ' ').trim()
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : 'Activity'
}

export function safeFilename(name: string): string {
  return name.replace(/[\\/\0-\x1f"<>:*?|]+/g, '_').slice(0, 200) || 'download'
}
