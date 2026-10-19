import { useState } from 'react'
import { Copy, ScrollText, ShieldAlert, ShieldCheck, Sparkles } from 'lucide-react'
import { useAsync } from '../hooks/useAsync'
import { queryAudit, type AuditFilters } from '../services/admin'
import { listProfiles } from '../services/data'
import { errorMessage } from '../services/api'
import { Card, CardHeader, PageHeader } from '../components/ui/Card'
import { Input, Select } from '../components/ui/Field'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { SkeletonRows } from '../components/ui/Skeleton'
import { EmptyState, ErrorNotice } from '../components/ui/EmptyState'
import { Pagination } from '../components/ui/Pagination'
import { Table, TBody, Td, Th, THead, Tr } from '../../src/components/ui/Table'
import { useToast } from '../components/ui/Toast'
import { actionLabel, formatDateTime } from '../lib/format'
import type { AuditQueryResult } from '../types'

const PAGE = 20
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default function AuditPage() {
  const toast = useToast()
  const [action, setAction] = useState('')
  const [outcome, setOutcome] = useState('')
  const [documentId, setDocumentId] = useState('')
  const [actorId, setActorId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [verifying, setVerifying] = useState(false)
  const [chain, setChain] = useState<AuditQueryResult['chain'] | null>(null)
  const people = useAsync(listProfiles, [])

  const idError = (v: string) => (v && !UUID.test(v.trim()) ? 'Enter a valid ID (UUID)' : undefined)
  const filtersValid = !idError(documentId) && !idError(actorId)

  const buildFilters = (): AuditFilters => {
    const f: AuditFilters = {}
    if (action.trim()) f.action = action.trim()
    if (outcome) f.outcome = outcome as AuditFilters['outcome']
    if (documentId.trim()) f.document_id = documentId.trim()
    if (actorId.trim()) f.actor_id = actorId.trim()
    if (from) f.from = new Date(from).toISOString()
    if (to) f.to = new Date(`${to}T23:59:59.999`).toISOString()
    return f
  }

  const res = useAsync(async () => {
    if (!filtersValid) return null
    return queryAudit(buildFilters(), PAGE, (page - 1) * PAGE)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, outcome, documentId, actorId, from, to, page])

  const set = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v)
    setPage(1)
    setChain(null)
  }

  const verify = async () => {
    setVerifying(true)
    try {
      const r = await queryAudit(buildFilters(), 1, 0, true)
      setChain(r.chain ?? null)
      if (!r.chain) toast.error('The server returned no verification result.')
      else if (r.chain.valid && r.chain.head_matches) toast.success('Cryptographic chain verified: zero tampering.')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setVerifying(false)
    }
  }

  const copyHead = async (hash: string) => {
    try {
      await navigator.clipboard.writeText(hash)
      toast.success('Head hash copied.')
    } catch {
      toast.error('Could not copy. Select the hash and copy it manually.')
    }
  }

  const data = res.data
  const personById = new Map((people.data ?? []).map((person) => [person.id, person]))

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every access, change and denied attempt, in order."
        actions={
          <Button variant="secondary" onClick={verify} loading={verifying}>
            <ShieldCheck className="h-4 w-4 text-blue-600" aria-hidden="true" />
            <span>Verify integrity</span>
          </Button>
        }
      />

      {/* Cryptographic Integrity Card */}
      <Card className="mb-6 border-blue-200/80 bg-gradient-to-br from-white via-white to-blue-50/20">
        <CardHeader
          title="Integrity"
          description="Tamper-evident SHA-256 recursive hash chain"
        />
        <div className="space-y-4 p-6 text-sm text-slate-600">
          {chain && (
            <div
              role="status"
              className={`flex items-center gap-2.5 rounded-xl border p-3.5 text-xs font-semibold ${
                chain.valid && chain.head_matches
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-rose-200 bg-rose-50 text-rose-800'
              }`}
            >
              {chain.valid && chain.head_matches ? (
                <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0" aria-hidden="true" />
              )}
              <span>
                {chain.valid && chain.head_matches
                  ? `Chain verified: ${chain.checked} events checked, no breaks found.`
                  : `Verification failed${
                      chain.first_broken_seq != null ? ` at event #${chain.first_broken_seq}` : ''
                    }${!chain.head_matches ? '; head does not match' : ''} (${chain.checked} checked).`}
              </span>
            </div>
          )}

          {data?.head && (
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4">
              <div className="flex items-center justify-between">
                <p className="text-2xs font-bold uppercase tracking-wider text-slate-500">
                  Current head (event #{String(data.head.seq)})
                </p>
                <span className="text-2xs font-mono text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full font-bold">
                  ACTIVE HEAD
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-2">
                <code className="break-all font-mono text-xs text-slate-800 font-medium">
                  {data.head.hash}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void copyHead(data.head!.hash)}
                  aria-label="Copy head hash"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
              <p className="mt-2 text-2xs text-slate-500">
                Copy this hash to independent storage (for example a separate system or offline record). Comparing it
                later reveals if past history was altered.
              </p>
            </div>
          )}

          <div className="flex items-center gap-2 text-2xs text-slate-400">
            <Sparkles className="h-3.5 w-3.5 text-blue-500" aria-hidden="true" />
            <span>
              The hash chain is tamper-evident, not tamper-proof: it makes changes to past events detectable, but it
              cannot prevent them.
            </span>
          </div>
        </div>
      </Card>

      {/* Audit Log Filters and Table Card */}
      <Card>
        <div className="grid gap-4 border-b border-slate-100 bg-slate-50/50 p-4 sm:grid-cols-2 lg:grid-cols-3 rounded-t-xl">
          <Input
            label="Action"
            placeholder="e.g. document.download"
            value={action}
            onChange={(e) => set(setAction)(e.target.value)}
          />
          <Select label="Outcome" value={outcome} onChange={(e) => set(setOutcome)(e.target.value)}>
            <option value="">Any outcome</option>
            <option value="success">Success</option>
            <option value="denied">Denied</option>
            <option value="error">Error</option>
          </Select>
          <Input
            label="Document ID"
            value={documentId}
            error={idError(documentId)}
            onChange={(e) => set(setDocumentId)(e.target.value)}
          />
          <Input
            label="Actor ID"
            value={actorId}
            error={idError(actorId)}
            onChange={(e) => set(setActorId)(e.target.value)}
          />
          <Input label="From" type="date" value={from} onChange={(e) => set(setFrom)(e.target.value)} />
          <Input label="To" type="date" value={to} onChange={(e) => set(setTo)(e.target.value)} />
        </div>

        {res.loading && !data ? (
          <SkeletonRows rows={8} quote="Querying security audit ledger…" />
        ) : res.error ? (
          <div className="p-4">
            <ErrorNotice message={res.error} onRetry={res.reload} />
          </div>
        ) : data && data.events.length > 0 ? (
          <>
            <Table caption="Audit events">
              <THead>
                <Th>#</Th>
                <Th>Time</Th>
                <Th>Actor</Th>
                <Th>Other user</Th>
                <Th>Action</Th>
                <Th>Details</Th>
                <Th>Outcome</Th>
                <Th>Request</Th>
              </THead>
              <TBody>
                {data.events.map((ev) => (
                  <Tr key={String(ev.seq)}>
                    <Td className="font-mono text-xs font-semibold text-slate-500">#{String(ev.seq)}</Td>
                    <Td className="whitespace-nowrap font-mono text-2xs text-slate-500">
                      {formatDateTime(ev.occurred_at)}
                    </Td>
                    <Td className="max-w-[12rem] truncate font-medium text-xs text-slate-800">
                      {ev.actor_email ?? 'System'}
                    </Td>
                    <Td className="max-w-[14rem] truncate text-xs text-slate-600">
                      {(() => {
                        const targetId = String(ev.details?.grantee_id ?? ev.details?.target_id ?? '')
                        return targetId ? personById.get(targetId)?.email ?? targetId : '—'
                      })()}
                    </Td>
                    <Td>
                      <span className="block font-semibold text-xs text-slate-800">{actionLabel(ev.action)}</span>
                      <span className="block font-mono text-2xs text-slate-400">{ev.action}</span>
                    </Td>
                    <Td className="text-xs text-slate-600">
                      {String(
                        ev.details?.permission ??
                          (ev.details?.from && ev.details?.to
                            ? `${ev.details.from} → ${ev.details.to}`
                            : ev.details?.is_global !== undefined
                            ? ev.details.is_global
                              ? 'Visible to all signed-in users'
                              : 'Private'
                            : ev.details?.reason ?? '—'),
                      )}
                    </Td>
                    <Td>
                      <Badge tone={ev.outcome === 'success' ? 'green' : ev.outcome === 'denied' ? 'amber' : 'red'}>
                        {ev.outcome}
                      </Badge>
                    </Td>
                    <Td>
                      <code className="text-2xs font-mono text-slate-400">
                        {ev.request_id ? ev.request_id.slice(0, 8) : '—'}
                      </code>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            <Pagination page={page} pageSize={PAGE} total={data.total} onChange={setPage} />
          </>
        ) : (
          <EmptyState
            icon={ScrollText}
            title="No events found"
            quote="The vault ledger reports absolute quiet."
            description="No audit events match these filters."
          />
        )}
      </Card>
    </>
  )
}
