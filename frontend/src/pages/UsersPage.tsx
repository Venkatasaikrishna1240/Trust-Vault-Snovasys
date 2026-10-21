import { useState } from 'react'
import { Shield, Users } from 'lucide-react'
import { useAsync } from '../hooks/useAsync'
import { changeAccountStatus, listAdminAccounts, setRole, type AccountAction } from '../services/admin'
import { errorMessage } from '../services/api'
import { useAuth } from '../features/auth/AuthContext'
import { Card, PageHeader } from '../components/ui/Card'
import { Input, Select } from '../components/ui/Field'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { ConfirmDialog, Dialog } from '../components/ui/Dialog'
import { SkeletonRows } from '../components/ui/Skeleton'
import { EmptyState, ErrorNotice } from '../components/ui/EmptyState'
import { Table, TBody, Td, Th, THead, Tr } from '../components/ui/Table'
import { useToast } from '../components/ui/Toast'
import { formatDate } from '../lib/format'
import type { AdminAccount } from '../types'

interface PendingAction {
  account: AdminAccount
  action: AccountAction
}

const references = (account: AdminAccount) =>
  account.owned_documents + account.created_versions + account.issued_grants

export default function UsersPage() {
  const { profile } = useAuth()
  const toast = useToast()
  const res = useAsync(listAdminAccounts, [])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [typedEmail, setTypedEmail] = useState('')
  const [search, setSearch] = useState('')
  const selected = res.data?.find((account) => account.id === selectedId) ?? null
  const isAdmin = profile?.role === 'admin'
  const matches = (res.data ?? []).filter((account) =>
    `${account.display_name ?? ''} ${account.email}`.toLowerCase().includes(search.trim().toLowerCase()),
  )

  const change = async (id: string, role: 'owner' | 'viewer') => {
    setBusyId(id)
    try {
      await setRole(id, role)
      toast.success('Role updated.')
      res.reload()
    } catch (error) {
      toast.error(errorMessage(error))
    } finally {
      setBusyId(null)
    }
  }

  const runAccountAction = async () => {
    if (!pending || busyId) return
    const { account, action } = pending
    setBusyId(account.id)
    try {
      const result = await changeAccountStatus(account.id, action)
      toast.success(
        action === 'deactivate'
          ? `Account deactivated. Its documents remain retained; ${result.revoked_grants ?? 0} incoming share(s) were revoked.`
          : action === 'reactivate'
            ? 'Account reactivated. Previously revoked shares must be granted again.'
            : 'Account permanently removed. Retained audit history remains available.',
      )
      setPending(null)
      setTypedEmail('')
      if (action === 'remove') setSelectedId(null)
      res.reload()
    } catch (error) {
      toast.error(errorMessage(error))
      res.reload()
    } finally {
      setBusyId(null)
    }
  }

  const openAction = (account: AdminAccount, action: AccountAction) => {
    setTypedEmail('')
    setPending({ account, action })
  }

  const selectedBusy = selected !== null && busyId === selected.id
  const removalBlocked = selected !== null && references(selected) > 0
  const canRemoveAccount = (account: AdminAccount | null) => Boolean(
    account && !account.is_active && references(account) === 0 && account.role !== 'admin' &&
    account.id !== profile?.id,
  )
  const canRemove = canRemoveAccount(selected)
  const pendingCanRemove = canRemoveAccount(pending?.account ?? null)
  const removeConfirmed = Boolean(
    pending?.action === 'remove' &&
    typedEmail.trim().toLowerCase() === pending.account.email.toLowerCase(),
  )

  return (
    <>
      <PageHeader
        title="Users"
        description="Manage account roles and employee offboarding. Document access is enforced by TrustVault's database and server-side authorization."
      />
      <Card>
        {res.loading && !res.data ? (
          <SkeletonRows rows={5} quote="Fetching registered users from directory…" />
        ) : res.error ? (
          <div className="p-4">
            <ErrorNotice message={res.error} onRetry={res.reload} />
          </div>
        ) : !res.data?.length ? (
          <EmptyState
            icon={Users}
            title="No users found"
            quote="The user registry is currently deserted."
          />
        ) : (
          <>
          <div className="relative p-4 sm:max-w-md">
            <Input
              label="Search users"
              placeholder="Search by name or email…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              autoComplete="off"
            />
            {search.trim() && matches.length > 0 && (
              <div className="absolute inset-x-4 top-full z-10 max-h-60 overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg sm:right-auto sm:w-[calc(100%-2rem)]">
                {matches.slice(0, 6).map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    className="block w-full rounded-md px-3 py-2 text-left hover:bg-slate-50"
                    onClick={() => { setSearch(account.email); setSelectedId(account.id) }}
                  >
                    <span className="block text-sm font-medium text-slate-900">{account.display_name || account.email}</span>
                    <span className="block text-xs text-slate-500">{account.email}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {matches.length ? <Table caption="Users">
            <THead>
              <Th>User</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>Owned documents</Th>
              <Th>Joined</Th>
              <Th>Change role</Th>
              <Th>Offboarding</Th>
            </THead>
            <TBody>
              {matches.map((account) => {
                const locked = account.role === 'admin' || account.id === profile?.id || !account.is_active
                return (
                  <Tr key={account.id}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white shadow-2xs">
                          {(account.display_name || account.email).charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <span className="block truncate font-semibold text-slate-900">
                            {account.display_name || account.email}
                          </span>
                          {account.display_name && (
                            <span className="block truncate text-2xs text-slate-400 font-mono">
                              {account.email}
                            </span>
                          )}
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <Badge
                        tone={account.role === 'admin' ? 'amber' : account.role === 'owner' ? 'indigo' : 'slate'}
                      >
                        {account.role}
                      </Badge>
                    </Td>
                    <Td>
                      <Badge tone={account.is_active ? 'green' : 'red'} showDot>
                        {account.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </Td>
                    <Td>{account.owned_documents}</Td>
                    <Td className="text-xs text-slate-500 font-mono">
                      {account.created_at ? formatDate(account.created_at) : '—'}
                    </Td>
                    <Td className="w-44">
                      {locked ? (
                        <span className="inline-flex items-center gap-1.5 text-2xs font-semibold text-slate-400">
                          <Shield className="h-3 w-3 text-slate-400" aria-hidden="true" />
                          <span>Not changeable</span>
                        </span>
                      ) : (
                        <Select
                          label={`Role for ${account.email}`}
                          hideLabel
                          value={account.role}
                          disabled={busyId === account.id}
                          onChange={(event) => void change(account.id, event.target.value as 'owner' | 'viewer')}
                        >
                          <option value="viewer">Viewer</option>
                          <option value="owner">Owner</option>
                        </Select>
                      )}
                    </Td>
                    <Td>
                      {isAdmin && account.role !== 'admin' && account.id !== profile?.id ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={Boolean(busyId)}
                          aria-pressed={selectedId === account.id}
                          onClick={() => setSelectedId(selectedId === account.id ? null : account.id)}
                        >
                          {selectedId === account.id ? 'Close details' : 'Manage'}
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-400">Unavailable</span>
                      )}
                    </Td>
                  </Tr>
                )
              })}
            </TBody>
          </Table> : <div className="p-6 text-sm text-slate-500">No users match your search.</div>}
          </>
        )}
      </Card>

      {selected && isAdmin && (
        <Card className="mt-5">
          <div className="flex flex-col gap-5 p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Employee account details</h2>
                <p className="mt-1 text-sm text-slate-500">{selected.display_name || selected.email}</p>
              </div>
              <Badge tone={selected.is_active ? 'green' : 'red'} showDot>
                {selected.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div><dt className="text-xs font-semibold uppercase text-slate-500">Email</dt><dd className="mt-1 break-all font-medium text-slate-800">{selected.email}</dd></div>
              <div><dt className="text-xs font-semibold uppercase text-slate-500">Role</dt><dd className="mt-1 font-medium text-slate-800">{selected.role}</dd></div>
              <div><dt className="text-xs font-semibold uppercase text-slate-500">Owned documents</dt><dd className="mt-1 font-medium text-slate-800">{selected.owned_documents}</dd></div>
              <div><dt className="text-xs font-semibold uppercase text-slate-500">Active incoming named grants</dt><dd className="mt-1 font-medium text-slate-800">{selected.active_incoming_grants}</dd></div>
              <div><dt className="text-xs font-semibold uppercase text-slate-500">Authored versions</dt><dd className="mt-1 font-medium text-slate-800">{selected.created_versions}</dd></div>
              <div><dt className="text-xs font-semibold uppercase text-slate-500">Permission records issued</dt><dd className="mt-1 font-medium text-slate-800">{selected.issued_grants}</dd></div>
            </dl>
            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold text-slate-900">Offboarding actions</h3>
              <p className="mt-1 text-sm text-slate-600">
                Deactivation blocks protected access and revokes shares to this employee. Their documents and audit records are retained.
              </p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {selected.is_active ? (
                  <Button
                    variant="danger"
                    disabled={selectedBusy}
                    onClick={() => openAction(selected, 'deactivate')}
                  >
                    Deactivate account
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    disabled={selectedBusy}
                    onClick={() => openAction(selected, 'reactivate')}
                  >
                    Reactivate account
                  </Button>
                )}
                <Button
                  variant="danger"
                  disabled={!canRemove || Boolean(busyId)}
                  title={removalBlocked ? 'Resolve retained document and permission references before removal.' : undefined}
                  onClick={() => openAction(selected, 'remove')}
                >
                  Permanently remove account
                </Button>
              </div>
              {removalBlocked && (
                <p className="mt-3 text-sm text-amber-800" role="status">
                  Permanent removal is blocked until an administrator resolves the retained references above.
                  TrustVault will not delete or silently transfer documents.
                </p>
              )}
              {selected.is_active && (
                <p className="mt-3 text-xs text-slate-500">
                  Permanent removal is available only after deactivation and after document ownership, authored versions, and issued permissions are resolved.
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={pending?.action === 'deactivate'}
        title="Deactivate employee account?"
        message={
          <div className="space-y-2">
            <p><strong>{pending?.account.display_name || pending?.account.email}</strong> will be blocked from logging in and using protected TrustVault operations.</p>
            <p>{pending?.account.active_incoming_grants} active named grant(s) to this employee will be revoked. Global document visibility will also stop applying to this inactive profile. Documents, authored history, and audit records will be retained. Reactivation will not restore revoked grants.</p>
          </div>
        }
        confirmLabel="Deactivate account"
        onConfirm={() => void runAccountAction()}
        onCancel={() => setPending(null)}
        loading={Boolean(pending && busyId === pending.account.id)}
      />

      <ConfirmDialog
        open={pending?.action === 'reactivate'}
        title="Reactivate employee account?"
        message={
          <p><strong>{pending?.account.display_name || pending?.account.email}</strong> will be allowed to sign in again. Previously revoked document shares remain revoked and must be explicitly granted again.</p>
        }
        confirmLabel="Reactivate account"
        onConfirm={() => void runAccountAction()}
        onCancel={() => setPending(null)}
        loading={Boolean(pending && busyId === pending.account.id)}
        danger={false}
      />

      <Dialog
        open={pending?.action === 'remove'}
        title="Permanently remove employee account?"
        onClose={busyId ? () => {} : () => { setPending(null); setTypedEmail('') }}
        footer={(
          <>
            <Button
              variant="secondary"
              disabled={Boolean(busyId)}
              onClick={() => { setPending(null); setTypedEmail('') }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!removeConfirmed || Boolean(busyId) || !pendingCanRemove}
              loading={Boolean(pending && busyId === pending.account.id)}
              onClick={() => void runAccountAction()}
            >
              Permanently remove
            </Button>
          </>
        )}
      >
        {pending?.action === 'remove' && (
          <div className="space-y-3">
            <p>
              This irreversibly removes <strong>{pending.account.display_name || pending.account.email}</strong>'s TrustVault and Supabase Auth account. Recovery may require administrator intervention.
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Login and protected access will end.</li>
              <li>Documents and authored versions are never deleted or transferred by this operation.</li>
              <li>Removal is blocked while {pending.account.owned_documents} owned document(s), {pending.account.created_versions} authored version(s), or {pending.account.issued_grants} issued permission record(s) remain.</li>
              <li>Audit history and employee identity snapshots are retained.</li>
            </ul>
            <Input
              label="Type the employee's email to confirm"
              value={typedEmail}
              onChange={(event) => setTypedEmail(event.target.value)}
              autoComplete="off"
              disabled={Boolean(busyId)}
            />
          </div>
        )}
      </Dialog>
    </>
  )
}
