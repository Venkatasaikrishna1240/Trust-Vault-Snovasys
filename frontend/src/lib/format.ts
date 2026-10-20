import type { Access, AuditEvent, Category } from '../types'
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
  'document.preview': 'Previewed a document',
  'document.read': 'Viewed document details',
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

export function auditActivity(event: AuditEvent): string {
  const actor = event.actor_display_name ?? event.actor_email ?? 'Unknown user'
  const document = event.document_name ? `'${event.document_name}'` : 'the document'
  const owner = event.owner_display_name ?? event.owner_email
  const ownerSuffix = owner && event.document_owner_id !== event.actor_id ? `, shared by ${owner}` : ''
  const affected = event.affected_display_name ?? event.affected_email ?? 'the other user'
  const permission = event.permission_type === 'edit' ? 'Edit access' : 'Read-only access'

  if (event.outcome === 'denied' && event.document_id) {
    if (event.action === 'permission.grant' || event.action === 'permission.revoke') {
      return `${actor} attempted to change sharing for ${document} — Access denied.`
    }
    return `${actor} attempted to access ${document} — Access denied.`
  }
  if (event.action === 'permission.grant' && event.outcome === 'success') {
    return event.details?.change === 'unchanged'
      ? `${actor} confirmed ${affected}'s existing ${permission.toLowerCase()} to ${document}.`
      : `${actor} shared ${document} with ${affected} — ${permission} granted.`
  }
  if (event.action === 'permission.revoke' && event.outcome === 'success') {
    return `${actor} revoked ${affected}'s access to ${document}.`
  }
  if (event.action === 'document.preview' && event.outcome === 'success') {
    return event.details?.response_prepared === true
      ? `${actor} requested a preview of ${document} — verified response prepared${ownerSuffix}; browser display is not confirmed.`
      : `${actor} was authorized to preview ${document}; delivery was not verified in this older event.`
  }
  if (event.action === 'document.download' && event.outcome === 'success') {
    return event.details?.response_prepared === true
      ? `${actor} requested a download of ${document} — verified response prepared${ownerSuffix}; receipt is not confirmed.`
      : `${actor} was authorized to download ${document}; delivery was not verified in this older event.`
  }
  if (event.action === 'document.upload' && event.outcome === 'success') {
    return `${actor} uploaded ${document}.`
  }
  if (event.action === 'document.edit' && event.outcome === 'success') {
    return `${actor} edited ${document}.`
  }
  if (event.action === 'document.replace' && event.outcome === 'success') {
    return `${actor} replaced the file for ${document}.`
  }
  if (event.action === 'document.delete' && event.outcome === 'success') {
    return `${actor} deleted ${document}.`
  }
  if ((event.action === 'document.download' || event.action === 'document.preview') && event.outcome === 'error') {
    return `${actor}'s ${event.action === 'document.preview' ? 'preview' : 'download'} of ${document} failed; no file was served.`
  }
  if (event.action === 'document.read' && event.outcome === 'success') {
    return `${actor} viewed details for ${document}.`
  }
  if (event.action === 'document.visibility_change' && event.outcome === 'success') {
    const visibility = event.details?.is_global === true ? 'all signed-in users' : 'private'
    return `${actor} changed ${document} visibility to ${visibility}.`
  }
  return `${actor}: ${actionLabel(event.action)} (${event.outcome}).`
}

export function safeFilename(name: string): string {
  return name.replace(/[\\/\0-\x1f"<>:*?|]+/g, '_').slice(0, 200) || 'download'
}
