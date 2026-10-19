import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Globe2, Info, UserMinus, Users } from 'lucide-react'
import { Card, CardHeader } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Select, Textarea } from '../../components/ui/Field'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { EmptyState } from '../../components/ui/EmptyState'
import { Table, TBody, Td, Th, THead, Tr } from '../../components/ui/Table'
import { useToast } from '../../components/ui/Toast'
import { formatDate } from '../../lib/format'
import { grantAccess, revokeAccess, setDocumentVisibility } from '../../services/documents'
import { errorMessage } from '../../services/api'
import type { PermissionRow } from '../../types'

const formSchema = z.object({ emails: z.string().trim().min(3, 'Enter at least one e-mail address.'), permission: z.enum(['read', 'edit']) })
type Values = z.infer<typeof formSchema>
const CHANGES: Record<string, string> = {
  created: 'Access granted.', upgraded: 'Access upgraded.', downgraded: 'Access downgraded.', unchanged: 'No change: this person already had that access.',
}

export function SharingTab({ documentId, permissions, isGlobal, onChanged }: { documentId: string; permissions: PermissionRow[]; isGlobal: boolean; onChanged: () => void }) {
  const toast = useToast()
  const [target, setTarget] = useState<PermissionRow | null>(null)
  const [revoking, setRevoking] = useState(false)
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [batchRevokeOpen, setBatchRevokeOpen] = useState(false)
  const [batchRevoking, setBatchRevoking] = useState(false)
  const [updatingPermission, setUpdatingPermission] = useState<string | null>(null)
  const [visibilityConfirm, setVisibilityConfirm] = useState(false)
  const [visibilityBusy, setVisibilityBusy] = useState(false)
  const { register, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(formSchema), defaultValues: { emails: '', permission: 'read' },
  })

  const grant = handleSubmit(async (v) => {
    const emails = [...new Set(v.emails.split(/[\s,;]+/).map((email) => email.trim()).filter(Boolean))]
    const invalid = emails.find((email) => !z.string().email().safeParse(email).success)
    if (invalid) { setError('emails', { message: `Invalid e-mail address: ${invalid}` }); return }
    const outcomes: { email: string; success: boolean; message: string }[] = []
    for (const email of emails) {
      try {
        const r = await grantAccess(documentId, email, v.permission)
        outcomes.push({ email, success: true, message: CHANGES[r.change] ?? 'Sharing updated.' })
      } catch (e) { outcomes.push({ email, success: false, message: errorMessage(e) }) }
    }
    const failed = outcomes.filter((outcome) => !outcome.success)
    if (failed.length) toast.error(`${emails.length - failed.length} shared; ${failed.length} failed. ${failed.map((outcome) => `${outcome.email}: ${outcome.message}`).join(' ')}`)
    else toast.success(`${emails.length} user${emails.length === 1 ? '' : 's'} updated.`)
    reset({ emails: '', permission: v.permission }); onChanged()
  })

  const revoke = async () => {
    if (!target) return
    setRevoking(true)
    try { await revokeAccess(documentId, target.user_id); toast.success('Access revoked.'); setTarget(null); onChanged() }
    catch (e) { toast.error(errorMessage(e)); setTarget(null) } finally { setRevoking(false) }
  }

  const saveVisibility = async () => {
    setVisibilityBusy(true)
    try {
      await setDocumentVisibility(documentId, !isGlobal)
      toast.success(isGlobal ? 'Document is private again.' : 'Document shared with all signed-in users.')
      setVisibilityConfirm(false)
      onChanged()
    } catch (e) { toast.error(errorMessage(e)) } finally { setVisibilityBusy(false) }
  }

  const changePermission = async (person: PermissionRow, permission: 'read' | 'edit') => {
    setUpdatingPermission(person.user_id)
    try {
      const r = await grantAccess(documentId, person.email, permission)
      toast.success(CHANGES[r.change] ?? 'Permission updated.')
      onChanged()
    } catch (e) { toast.error(errorMessage(e)) } finally { setUpdatingPermission(null) }
  }

  const revokeSelected = async () => {
    setBatchRevoking(true)
    const results = await Promise.allSettled(selectedUsers.map((userId) => revokeAccess(documentId, userId)))
    const revokedIds = selectedUsers.filter((_, i) => results[i].status === 'fulfilled')
    const failedCount = results.length - revokedIds.length
    setSelectedUsers((current) => current.filter((id) => !revokedIds.includes(id)))
    setBatchRevokeOpen(false)
    if (failedCount) toast.error(`${revokedIds.length} revoked; ${failedCount} failed.`)
    else toast.success(`${revokedIds.length} access grant${revokedIds.length === 1 ? '' : 's'} revoked.`)
    if (revokedIds.length) onChanged()
    setBatchRevoking(false)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Visibility for signed-in users" description="Global means any signed-in TrustVault account can view and preview this document. It is not an anonymous public link." />
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-sm text-slate-600">Current setting: <strong>{isGlobal ? 'All signed-in users can view' : 'Private — owner and named users only'}</strong></p>
          <Button variant={isGlobal ? 'secondary' : 'primary'} onClick={() => setVisibilityConfirm(true)}>
            <Globe2 className="h-4 w-4" aria-hidden="true" />{isGlobal ? 'Make private' : 'Share globally'}
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Share with people" description="Enter one or more existing TrustVault e-mail addresses, separated by commas, spaces or new lines." />
        <form onSubmit={grant} noValidate className="grid gap-4 p-5 sm:grid-cols-[1fr_10rem_auto] sm:items-start">
          <Textarea label="E-mail addresses" autoComplete="off" error={errors.emails?.message} {...register('emails')} />
          <Select label="Permission" {...register('permission')}>
            <option value="read">Can view</option>
            <option value="edit">Can edit</option>
          </Select>
          <Button type="submit" className="sm:mt-[1.7rem]" loading={isSubmitting}>Share</Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="People with access" action={selectedUsers.length > 0
          ? <Button variant="danger" size="sm" onClick={() => setBatchRevokeOpen(true)}>Revoke selected ({selectedUsers.length})</Button>
          : undefined} />
        {isGlobal && <p className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-xs text-amber-900">This document is globally visible. Revoking a named grant does not remove the general signed-in-user access; make the document private above to stop that access.</p>}
        {permissions.length === 0
          ? <EmptyState icon={Users} title="Not shared yet" description="Only you can open this document. Share it using the form above." />
          : (
            <Table caption="People with access">
              <THead><Th><span className="sr-only">Select</span></Th><Th>Person</Th><Th>Permission</Th><Th>Granted</Th><Th><span className="sr-only">Actions</span></Th></THead>
              <TBody>
                {permissions.map((p) => (
                  <Tr key={p.id}>
                    <Td><input type="checkbox" aria-label={`Select ${p.email} for revocation`} checked={selectedUsers.includes(p.user_id)}
                      onChange={(e) => setSelectedUsers((current) => e.target.checked ? [...current, p.user_id] : current.filter((id) => id !== p.user_id))} /></Td>
                    <Td><span className="block font-medium text-slate-900">{p.display_name || p.email}</span>{p.display_name && <span className="block text-xs text-slate-500">{p.email}</span>}</Td>
                    <Td><Select label={`Permission for ${p.email}`} hideLabel value={p.permission} disabled={updatingPermission === p.user_id}
                      onChange={(e) => void changePermission(p, e.target.value as 'read' | 'edit')}>
                      <option value="read">Can view</option><option value="edit">Can edit</option>
                    </Select></Td>
                    <Td>{formatDate(p.granted_at)}</Td>
                    <Td className="text-right"><Button variant="ghost" size="sm" onClick={() => setTarget(p)} aria-label={`Revoke access for ${p.email}`}><UserMinus className="h-4 w-4" aria-hidden="true" />Revoke</Button></Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        <p className="flex items-start gap-2 border-t border-slate-200 px-5 py-3 text-xs text-slate-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Revocation blocks all new requests immediately; copies already downloaded cannot be recalled.
        </p>
      </Card>

      <ConfirmDialog open={!!target} title="Revoke access?" confirmLabel="Revoke access" loading={revoking}
        message={<>{target?.display_name || target?.email} will no longer be able to open this document. Copies they already downloaded cannot be recalled.</>}
        onConfirm={revoke} onCancel={() => setTarget(null)} />
      <ConfirmDialog open={batchRevokeOpen} title="Revoke selected access?" confirmLabel={`Revoke ${selectedUsers.length}`} loading={batchRevoking}
        message={`This will immediately revoke access for ${selectedUsers.length} selected user${selectedUsers.length === 1 ? '' : 's'}. Copies already received by their browsers or downloaded cannot be recalled.`}
        onConfirm={revokeSelected} onCancel={() => setBatchRevokeOpen(false)} />
      <ConfirmDialog open={visibilityConfirm} title={isGlobal ? 'Make this document private?' : 'Share this document globally?'}
        confirmLabel={isGlobal ? 'Make private' : 'Share globally'} loading={visibilityBusy} danger={false}
        message={isGlobal
          ? 'Only the owner and currently named users will be able to access it again.'
          : 'Every signed-in TrustVault user, including administrators as ordinary signed-in users, will be able to view it. The file remains in private Storage and every request is audited.'}
        onConfirm={saveVisibility} onCancel={() => setVisibilityConfirm(false)} />
    </div>
  )
}
