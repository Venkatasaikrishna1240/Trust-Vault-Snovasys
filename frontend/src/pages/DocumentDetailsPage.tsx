import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAsync } from '../hooks/useAsync'
import { getDocument } from '../services/documents'
import { NOT_FOUND_MESSAGE } from '../services/api'
import { PageHeader } from '../components/ui/Card'
import { Skeleton } from '../components/ui/Skeleton'
import { ErrorNotice } from '../components/ui/EmptyState'
import { AccessBadge } from '../components/ui/Badge'
import { cx } from '../components/ui/cx'
import { OverviewTab } from '../features/documents/OverviewTab'
import { SharingTab } from '../features/documents/SharingTab'
import { HistoryTab } from '../features/documents/HistoryTab'
import { StatusView } from '../components/StatusView'
import { SearchX } from 'lucide-react'

type Tab = 'overview' | 'sharing' | 'history'

export default function DocumentDetailsPage() {
  const { id = '' } = useParams()
  const [tab, setTab] = useState<Tab>('overview')
  const res = useAsync(() => getDocument(id), [id])

  if (res.loading && !res.data) return <div className="space-y-4" role="status" aria-label="Loading document"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-10 w-64" /><Skeleton className="h-64 w-full" /></div>
  if (res.error === NOT_FOUND_MESSAGE) return <StatusView icon={SearchX} title="Document not found" message={NOT_FOUND_MESSAGE} />
  if (res.error || !res.data) return <ErrorNotice message={res.error ?? 'Could not load the document.'} onRetry={res.reload} />

  const detail = res.data
  const isOwner = detail.my_access === 'owner'
  const tabs: { id: Tab; label: string }[] = [{ id: 'overview', label: 'Overview' }]
  if (isOwner) tabs.push({ id: 'sharing', label: 'Sharing' })
  tabs.push({ id: 'history', label: 'History' })
  const active = tabs.some((t) => t.id === tab) ? tab : 'overview'

  return (
    <>
      <Link to="/documents" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900"><ArrowLeft className="h-4 w-4" aria-hidden="true" />All documents</Link>
      <PageHeader title={detail.document.title} actions={<AccessBadge access={detail.my_access} />} />
      <div role="tablist" aria-label="Document sections" className="mb-6 flex gap-1 border-b border-slate-200">
        {tabs.map((t) => (
          <button key={t.id} role="tab" type="button" id={`tab-${t.id}`} aria-selected={active === t.id} aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cx('-mb-px border-b-2 px-4 py-2.5 text-sm font-medium', active === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-900')}>
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`}>
        {active === 'overview' && <OverviewTab detail={detail} onChanged={res.reload} />}
        {active === 'sharing' && isOwner && <SharingTab documentId={detail.document.id} permissions={detail.permissions ?? []} isGlobal={detail.document.is_global === true} onChanged={res.reload} />}
        {active === 'history' && <HistoryTab documentId={detail.document.id} versions={detail.versions} currentVersion={detail.document.current_version} canDownloadOld={isOwner || detail.my_access === 'edit'} />}
      </div>
    </>
  )
}
