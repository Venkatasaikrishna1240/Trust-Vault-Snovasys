import { callFn } from './api'
import type { AuditQueryResult, Profile } from '../types'

export interface AuditFilters {
  actor_id?: string; document_id?: string; action?: string
  outcome?: 'success' | 'denied' | 'error'; from?: string; to?: string
}

export const queryAudit = (filters: AuditFilters, limit: number, offset: number, verify_chain = false) =>
  callFn<AuditQueryResult>('admin-audit-query', { json: { filters, limit, offset, verify_chain } })

export const setRole = (user_id: string, role: 'owner' | 'viewer') =>
  callFn<{ user: Profile }>('admin-set-role', { json: { user_id, role } })
