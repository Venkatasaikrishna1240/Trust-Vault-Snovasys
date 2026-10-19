import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Activity, FileText, HardDrive, Search, Share2, Upload } from 'lucide-react'
import { useAuth } from '../features/auth/AuthContext'
import { useAsync } from '../hooks/useAsync'
import { getDashboardStats, getRecentActivity, searchDocuments } from '../services/data'
import { Card, CardHeader, PageHeader } from '../components/ui/Card'
import { Skeleton, SkeletonRows } from '../components/ui/Skeleton'
import { EmptyState, ErrorNotice } from '../components/ui/EmptyState'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { actionLabel, formatBytes, formatDateTime } from '../lib/format'
import { DocumentTable } from '../features/documents/DocumentTable'

function Stat({ icon: Icon, label, value, loading }: { icon: typeof FileText; label: string; value?: string; loading: boolean }) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <span className="grid h-11 w-11 place-items-center rounded-lg bg-brand-50 text-brand-600"><Icon className="h-5 w-5" aria-hidden="true" /></span>
      <div>
        <p className="text-sm text-slate-500">{label}</p>
        {loading ? <Skeleton className="mt-1 h-7 w-16" /> : <p className="text-2xl font-semibold tracking-tight text-slate-900">{value}</p>}
      </div>
    </Card>
  )
}

export default function DashboardPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const stats = useAsync(getDashboardStats, [])
  const activity = useAsync(getRecentActivity, [])
  const recent = useAsync(() => searchDocuments({ scope: 'all', limit: 5, offset: 0 }), [])

  const onSearch = (e: FormEvent) => { e.preventDefault(); navigate(`/documents?q=${encodeURIComponent(q.trim())}`) }

  return (
    <>
      <PageHeader title={`Welcome${profile?.display_name ? `, ${profile.display_name}` : ''}`}
        description="Your documents and recent activity at a glance."
        actions={profile ? <Link to="/documents/new" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"><Upload className="h-4 w-4" aria-hidden="true" />Upload document</Link> : undefined} />

      {stats.error && <div className="mb-4"><ErrorNotice message={stats.error} onRetry={stats.reload} /></div>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon={FileText} label="Documents I own" value={String(stats.data?.owned_count ?? 0)} loading={stats.loading} />
        <Stat icon={Share2} label="Shared with me" value={String(stats.data?.shared_count ?? 0)} loading={stats.loading} />
        <Stat icon={HardDrive} label="Storage used" value={formatBytes(stats.data?.owned_bytes ?? 0)} loading={stats.loading} />
      </div>

      <Card className="mt-6 p-5">
        <form onSubmit={onSearch} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1"><Input label="Search documents" placeholder="Search by title or file name" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Button type="submit"><Search className="h-4 w-4" aria-hidden="true" />Search</Button>
        </form>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Recent documents" action={<Link to="/documents" className="text-sm font-medium text-brand-600 hover:underline">View all</Link>} />
          {recent.loading ? <SkeletonRows rows={4} />
            : recent.error ? <div className="p-4"><ErrorNotice message={recent.error} onRetry={recent.reload} /></div>
            : recent.data && recent.data.rows.length > 0 ? <DocumentTable rows={recent.data.rows} />
            : <EmptyState icon={FileText} title="No documents yet"
                description={profile ? 'Upload your first document to get started.' : 'Documents shared with you will appear here.'}
                action={profile ? <Link to="/documents/new" className="inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700">Upload document</Link> : undefined} />}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Recent activity" />
          {activity.loading ? <SkeletonRows rows={5} />
            : activity.error ? <div className="p-4"><ErrorNotice message={activity.error} onRetry={activity.reload} /></div>
            : activity.data && activity.data.length > 0 ? (
              <ul className="divide-y divide-slate-100">
                {activity.data.map((ev) => (
                  <li key={String(ev.seq)} className="flex items-start gap-3 px-5 py-3">
                    <Activity className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-800">{actionLabel(ev.action)}</p>
                      <p className="text-xs text-slate-500">{formatDateTime(ev.occurred_at)}</p>
                    </div>
                    {ev.outcome !== 'success' && <Badge tone={ev.outcome === 'denied' ? 'amber' : 'red'}>{ev.outcome}</Badge>}
                  </li>
                ))}
              </ul>
            ) : <EmptyState icon={Activity} title="No activity yet" description="Actions on your documents will show up here." />}
        </Card>
      </div>
    </>
  )
}
