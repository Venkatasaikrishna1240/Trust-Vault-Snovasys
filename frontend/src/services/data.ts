import { supabase } from '../lib/supabase'
import { toNumber } from '../lib/format'
import type { AuditEvent, DashboardStats, DocumentRow, Profile } from '../types'

export interface SearchParams {
  query?: string; category?: string; owner?: string; from?: string; to?: string
  scope: 'all' | 'owned' | 'shared'; limit: number; offset: number
}

function fail(error: { message: string } | null): never | void {
  if (error) throw new Error(error.message || 'Could not load data.')
}

export async function searchDocuments(p: SearchParams): Promise<{ rows: DocumentRow[]; total: number }> {
  const { data, error } = await supabase.rpc('search_documents', {
    p_query: p.query || null,
    p_category: p.category || null,
    p_owner: p.owner || null,
    p_from: p.from ? new Date(p.from).toISOString() : null,
    p_to: p.to ? new Date(`${p.to}T23:59:59.999`).toISOString() : null,
    p_scope: p.scope,
    p_limit: p.limit,
    p_offset: p.offset,
  })
  fail(error)
  const rows = (data ?? []) as DocumentRow[]
  return { rows, total: rows.length ? toNumber(rows[0].total_count) : 0 }
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const { data, error } = await supabase.rpc('dashboard_stats')
  fail(error)
  const r = (Array.isArray(data) ? data[0] : data) ?? {}
  return { owned_count: toNumber(r.owned_count), shared_count: toNumber(r.shared_count), owned_bytes: toNumber(r.owned_bytes) }
}

export async function getRecentActivity(): Promise<AuditEvent[]> {
  const { data, error } = await supabase
    .from('audit_events')
    .select('seq,occurred_at,actor_id,document_id,action,outcome')
    .order('seq', { ascending: false })
    .limit(8)
  fail(error)
  return (data ?? []) as AuditEvent[]
}

export async function listProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles').select('id,email,display_name,role,created_at').order('created_at')
  fail(error)
  return (data ?? []) as Profile[]
}

export async function getMyProfile(id: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles').select('id,email,display_name,role').eq('id', id).maybeSingle()
  fail(error)
  return (data as Profile | null) ?? null
}
