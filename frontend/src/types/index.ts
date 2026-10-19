export type Role = 'admin' | 'owner' | 'viewer'
export type Access = 'owner' | 'edit' | 'read'
export type Category = 'general' | 'contract' | 'salary_letter' | 'technical_drawing' | 'audit' | 'customer_record'

export const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'contract', label: 'Contract' },
  { value: 'salary_letter', label: 'Salary letter' },
  { value: 'technical_drawing', label: 'Technical drawing' },
  { value: 'audit', label: 'Audit' },
  { value: 'customer_record', label: 'Customer record' },
]

export interface Profile {
  id: string
  email: string
  display_name: string | null
  role: Role
  created_at?: string
}

export interface DocumentRecord {
  id: string
  owner_id: string
  owner_display_name?: string | null
  title: string
  description: string | null
  category: Category
  original_filename: string
  mime_type: string
  size_bytes: number
  sha256?: string
  current_version: number
  is_global?: boolean
  created_at: string
  updated_at: string
}

export interface DocumentRow {
  id: string
  title: string
  description: string | null
  category: Category
  original_filename: string
  mime_type: string
  size_bytes: number
  current_version: number
  owner_id: string
  owner_display_name: string | null
  owner_email: string | null
  my_access: Access
  created_at: string
  updated_at: string
  total_count: number | string
}

export interface PermissionRow {
  id: string
  user_id: string
  display_name: string | null
  email: string
  permission: 'read' | 'edit'
  granted_at: string
}

export interface VersionRow {
  version: number
  original_filename: string
  mime_type: string
  size_bytes: number
  sha256: string
  created_by: string
  created_at: string
}

export interface DocumentDetail {
  document: DocumentRecord
  my_access: Access
  permissions: PermissionRow[] | null
  versions: VersionRow[]
}

export interface AuditEvent {
  seq: number | string
  id?: string
  occurred_at: string
  actor_id: string | null
  actor_email?: string | null
  document_id: string | null
  action: string
  outcome: 'success' | 'denied' | 'error'
  request_id?: string
  details?: Record<string, unknown> | null
  event_hash?: string
}

export interface AuditQueryResult {
  events: AuditEvent[]
  total: number
  head: { seq: number | string; hash: string } | null
  chain?: { valid: boolean; checked: number; first_broken_seq: number | null; head_matches: boolean }
}

export interface DashboardStats {
  owned_count: number
  shared_count: number
  owned_bytes: number
}
