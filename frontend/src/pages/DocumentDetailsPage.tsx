import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Clock, FileText, SearchX, Share2 } from 'lucide-react'
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

type Tab = 'overview' | 'sharing' | 'history'

export default function DocumentDetailsPage() {
  const { id = '' } = useParams()
  const [tab, setTab] = useState<Tab>('overview')
  const res = useAsync(() => getDocument(id), [id])

  if (res.loading && !res.data) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading document">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-12 w-80" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    )
  }

  if (res.error === NOT_FOUND_MESSAGE) {
    return (
      <StatusView
        icon={SearchX}
        title="Document not found"
        message={NOT_FOUND_MESSAGE}
        quote="The vault was searched, but this document has vanished or was never stored."
      />
    )
  }

  if (res.error || !res.data) {
    return <ErrorNotice message={res.error ?? 'Could not load the document.'} onRetry={res.reload} />
  }

  const detail = res.data
  const isOwner = detail.my_access === 'owner'
  const tabs: { id: Tab; label: string; icon: typeof FileText }[] = [
    { id: 'overview', label: 'Overview', icon: FileText },
  ]
  if (isOwner) tabs.push({ id: 'sharing', label: 'Sharing', icon: Share2 })
  tabs.push({ id: 'history', label: 'History', icon: Clock })
  const active = tabs.some((t) => t.id === tab) ? tab : 'overview'

  return (
    <>
      <div className="mb-4">
        <Link
          to="/documents"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors group"
        >
          <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" />
          <span>All documents</span>
        </Link>
      </div>

      <PageHeader
        title={detail.document.title}
        description={detail.document.description || undefined}
        actions={
          <div className="flex items-center gap-2">
            <AccessBadge access={detail.my_access} />
          </div>
        }
      />

      {/* Tab Navigation */}
      <div
        role="tablist"
        aria-label="Document sections"
        className="mb-6 flex gap-2 border-b border-slate-200/90"
      >
        {tabs.map((t) => {
          const Icon = t.icon
          const isSelected = active === t.id
          return (
            <button
              key={t.id}
              role="tab"
              type="button"
              id={`tab-${t.id}`}
              aria-selected={isSelected}
              aria-controls={`panel-${t.id}`}
              onClick={() => setTab(t.id)}
              className={cx(
                'group -mb-px inline-flex cursor-pointer items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-all duration-150',
                isSelected
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800',
              )}
            >
              <Icon
                className={cx(
                  'h-4 w-4',
                  isSelected ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600',
                )}
                aria-hidden="true"
              />
              <span>{t.label}</span>
            </button>
          )
        })}
      </div>

      <div role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`}>
        {active === 'overview' && <OverviewTab detail={detail} onChanged={res.reload} />}
        {active === 'sharing' && isOwner && (
          <SharingTab
            documentId={detail.document.id}
            permissions={detail.permissions ?? []}
            isGlobal={detail.document.is_global === true}
            onChanged={res.reload}
          />
        )}
        {active === 'history' && (
          <HistoryTab
            documentId={detail.document.id}
            versions={detail.versions}
            currentVersion={detail.document.current_version}
            canDownloadOld={isOwner || detail.my_access === 'edit'}
          />
        )}
      </div>
    </>
  )
}
