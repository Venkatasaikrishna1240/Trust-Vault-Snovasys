import { useState } from 'react'
import { Users } from 'lucide-react'
import { useAsync } from '../hooks/useAsync'
import { listProfiles } from '../services/data'
import { setRole } from '../services/admin'
import { errorMessage } from '../services/api'
import { useAuth } from '../features/auth/AuthContext'
import { Card, PageHeader } from '../components/ui/Card'
import { Select } from '../components/ui/Field'
import { Badge } from '../components/ui/Badge'
import { SkeletonRows } from '../components/ui/Skeleton'
import { EmptyState, ErrorNotice } from '../components/ui/EmptyState'
import { Table, TBody, Td, Th, THead, Tr } from '../components/ui/Table'
import { useToast } from '../components/ui/Toast'
import { formatDate } from '../lib/format'

export default function UsersPage() {
  const { profile } = useAuth()
  const toast = useToast()
  const res = useAsync(listProfiles, [])
  const [busy, setBusy] = useState<string | null>(null)

  const change = async (id: string, role: 'owner' | 'viewer') => {
    setBusy(id)
    try { await setRole(id, role); toast.success('Role updated.'); res.reload() }
    catch (e) { toast.error(errorMessage(e)) } finally { setBusy(null) }
  }

  return (
    <>
      <PageHeader title="Users" description="Manage account roles. Every signed-in user can upload and own documents; private document access is controlled separately by each document owner." />
      <Card>
        {res.loading && !res.data ? <SkeletonRows />
          : res.error ? <div className="p-4"><ErrorNotice message={res.error} onRetry={res.reload} /></div>
          : !res.data?.length ? <EmptyState icon={Users} title="No users found" />
          : (
            <Table caption="Users">
              <THead><Th>User</Th><Th>Role</Th><Th>Joined</Th><Th>Change role</Th></THead>
              <TBody>
                {res.data.map((u) => {
                  const locked = u.role === 'admin' || u.id === profile?.id
                  return (
                    <Tr key={u.id}>
                      <Td><span className="block font-medium text-slate-900">{u.display_name || u.email}</span>{u.display_name && <span className="block text-xs text-slate-500">{u.email}</span>}</Td>
                      <Td><Badge tone={u.role === 'admin' ? 'amber' : u.role === 'owner' ? 'indigo' : 'slate'}>{u.role}</Badge></Td>
                      <Td>{u.created_at ? formatDate(u.created_at) : '—'}</Td>
                      <Td className="w-48">
                        {locked ? <span className="text-xs text-slate-400">Not changeable</span> : (
                          <Select label={`Role for ${u.email}`} hideLabel value={u.role} disabled={busy === u.id}
                            onChange={(e) => void change(u.id, e.target.value as 'owner' | 'viewer')}>
                            <option value="viewer">Viewer</option>
                            <option value="owner">Owner</option>
                          </Select>
                        )}
                      </Td>
                    </Tr>
                  )
                })}
              </TBody>
            </Table>
          )}
      </Card>
    </>
  )
}
