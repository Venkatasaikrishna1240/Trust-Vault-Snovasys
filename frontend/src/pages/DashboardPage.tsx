import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Activity,
  FileText,
  HardDrive,
  Search,
  Share2,
  Upload,
  ArrowRight,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '../features/auth/AuthContext'
import { useAsync } from '../hooks/useAsync'
import { getDashboardStats, getRecentActivity, searchDocuments } from '../services/data'
import { Card, CardHeader } from '../components/ui/Card'
import { Skeleton, SkeletonRows } from '../components/ui/Skeleton'
import { EmptyState, ErrorNotice } from '../components/ui/EmptyState'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Field'
import { actionLabel, formatBytes, formatDateTime } from '../lib/format'
import { DocumentTable } from '../features/documents/DocumentTable'

function Stat({
  icon: Icon,
  label,
  value,
  subtext,
  loading,
}: {
  icon: typeof FileText
  label: string
  value?: string
  subtext?: string
  loading: boolean
}) {
  return (
    <Card className="relative overflow-hidden p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-center gap-4">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-blue-200/70 bg-gradient-to-br from-blue-50 to-indigo-50/80 text-blue-600 shadow-2xs">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
          {loading ? (
            <Skeleton className="mt-1 h-7 w-20" />
          ) : (
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold tracking-tight text-slate-900">{value}</p>
              {subtext && <span className="text-2xs text-slate-400 font-medium">{subtext}</span>}
            </div>
          )}
        </div>
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

  const onSearch = (e: FormEvent) => {
    e.preventDefault()
    navigate(`/documents?q=${encodeURIComponent(q.trim())}`)
  }

  return (
    <>
      {/* Top Banner / Welcome with security quote */}
      <div className="mb-6 rounded-2xl border border-blue-900/40 bg-gradient-to-r from-slate-900 via-slate-850 to-indigo-950 p-6 text-white shadow-xl relative overflow-hidden">
        <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-blue-500/10 blur-2xl" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-300 mb-2">
              <Sparkles className="h-3 w-3 text-blue-400" aria-hidden="true" />
              <span>Private storage. Access checked for each request.</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Welcome back{profile?.display_name ? `, ${profile.display_name}` : ''}
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-300">
              Files are stored in a private bucket, authorized server-side, and checked with SHA-256 integrity hashes.
            </p>
          </div>
          {profile && (
            <Link
              to="/documents/new"
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 text-sm font-semibold text-white shadow-md shadow-blue-500/25 hover:from-blue-500 hover:to-indigo-500 transition-all hover:-translate-y-0.5 active:translate-y-0"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              <span>Upload document</span>
            </Link>
          )}
        </div>
      </div>

      {stats.error && (
        <div className="mb-4">
          <ErrorNotice message={stats.error} onRetry={stats.reload} />
        </div>
      )}

      {/* Quick stats grid */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          icon={FileText}
          label="Documents I own"
          value={String(stats.data?.owned_count ?? 0)}
          loading={stats.loading}
        />
        <Stat
          icon={Share2}
          label="Shared with me"
          value={String(stats.data?.shared_count ?? 0)}
          subtext="accessible"
          loading={stats.loading}
        />
        <Stat
          icon={HardDrive}
          label="Storage used"
          value={formatBytes(stats.data?.owned_bytes ?? 0)}
          loading={stats.loading}
        />
      </div>

      {/* Global document search card */}
      <Card className="mt-6 p-5">
        <form onSubmit={onSearch} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input
              label="Search documents"
              placeholder="Search by title or original file name…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Button type="submit">
            <Search className="h-4 w-4" aria-hidden="true" />
            <span>Search</span>
          </Button>
        </form>
      </Card>

      {/* Content grid: Recent documents & Recent activity */}
      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader
            title="Recent documents"
            description="Your latest files and shared items"
            action={
              <Link
                to="/documents"
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline"
              >
                <span>View all</span>
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            }
          />
          {recent.loading ? (
            <SkeletonRows rows={4} quote="Scanning vault records…" />
          ) : recent.error ? (
            <div className="p-4">
              <ErrorNotice message={recent.error} onRetry={recent.reload} />
            </div>
          ) : recent.data && recent.data.rows.length > 0 ? (
            <DocumentTable rows={recent.data.rows} />
          ) : (
            <EmptyState
              icon={FileText}
              title="No documents yet"
              quote="Even a vault needs its first treasure."
              description={
                profile
                  ? 'Upload your first document to get started.'
                  : 'Documents shared with you will appear here.'
              }
              action={
                profile ? (
                  <Link
                    to="/documents/new"
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-xs hover:bg-blue-700 transition-colors"
                  >
                    <Upload className="h-4 w-4" aria-hidden="true" />
                    <span>Upload document</span>
                  </Link>
                ) : undefined
              }
            />
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Recent activity" description="Tamper-evident log of document actions" />
          {activity.loading ? (
            <SkeletonRows rows={5} quote="Verifying audit ledger…" />
          ) : activity.error ? (
            <div className="p-4">
              <ErrorNotice message={activity.error} onRetry={activity.reload} />
            </div>
          ) : activity.data && activity.data.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {activity.data.map((ev) => (
                <li key={String(ev.seq)} className="flex items-start gap-3 px-5 py-3.5 hover:bg-slate-50/60 transition-colors">
                  <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 border border-slate-200">
                    <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-800">{actionLabel(ev.action)}</p>
                    <p className="text-2xs text-slate-400 font-mono mt-0.5">{formatDateTime(ev.occurred_at)}</p>
                  </div>
                  {ev.outcome !== 'success' ? (
                    <Badge tone={ev.outcome === 'denied' ? 'amber' : 'red'}>{ev.outcome}</Badge>
                  ) : (
                    <Badge tone="green">success</Badge>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Activity}
              title="No activity yet"
              quote="A quiet vault is a secure vault."
              description="Actions on your documents will show up here."
            />
          )}
        </Card>
      </div>
    </>
  )
}
