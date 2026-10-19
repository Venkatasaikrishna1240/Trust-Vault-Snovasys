import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FileSearch, FileText, RotateCcw, Upload } from 'lucide-react'
import { useAuth } from '../features/auth/AuthContext'
import { useAsync } from '../hooks/useAsync'
import { useDebounce } from '../hooks/useDebounce'
import { searchDocuments } from '../services/data'
import { Card, PageHeader } from '../components/ui/Card'
import { Input, Select } from '../components/ui/Field'
import { Button } from '../components/ui/Button'
import { SkeletonRows } from '../components/ui/Skeleton'
import { EmptyState, ErrorNotice } from '../components/ui/EmptyState'
import { Pagination } from '../components/ui/Pagination'
import { cx } from '../components/ui/cx'
import { DocumentTable } from '../features/documents/DocumentTable'
import { CATEGORIES } from '../types'

const PAGE_SIZE = 10
type Scope = 'all' | 'owned' | 'shared'
const SCOPES: { value: Scope; label: string }[] = [
  { value: 'all', label: 'All documents' },
  { value: 'owned', label: 'Owned by me' },
  { value: 'shared', label: 'Shared with me' },
]

export default function DocumentsPage() {
  const { profile } = useAuth()
  const [params] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [owner, setOwner] = useState('')
  const [category, setCategory] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [scope, setScope] = useState<Scope>('all')
  const [page, setPage] = useState(1)
  const dq = useDebounce(query),
    downer = useDebounce(owner)

  const res = useAsync(
    () =>
      searchDocuments({
        query: dq.trim(),
        owner: downer.trim(),
        category,
        from,
        to,
        scope,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
    [dq, downer, category, from, to, scope, page],
  )

  const filtered = Boolean(dq || downer || category || from || to || scope !== 'all')
  const reset = () => {
    setQuery('')
    setOwner('')
    setCategory('')
    setFrom('')
    setTo('')
    setScope('all')
    setPage(1)
  }
  const upd = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setPage(1)
  }

  return (
    <>
      <PageHeader
        title="Documents"
        description="Search and manage documents you own or that were shared with you."
        actions={
          profile ? (
            <Link
              to="/documents/new"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 text-sm font-semibold text-white shadow-xs hover:from-blue-700 hover:to-indigo-700 transition-all hover:-translate-y-px active:translate-y-0"
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              <span>Upload document</span>
            </Link>
          ) : undefined
        }
      />

      {/* Scope Segmented Controller */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Document scope"
          className="inline-flex rounded-xl border border-slate-200/90 bg-white p-1 shadow-2xs"
        >
          {SCOPES.map((s) => (
            <button
              key={s.value}
              role="tab"
              type="button"
              aria-selected={scope === s.value}
              onClick={() => upd(setScope)(s.value)}
              className={cx(
                'cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-semibold tracking-tight transition-all duration-150',
                scope === s.value
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        {filtered && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900 shadow-2xs transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reset filters</span>
          </button>
        )}
      </div>

      {/* Filters and Table Card */}
      <Card>
        <div className="grid gap-4 border-b border-slate-100 bg-slate-50/50 p-4 sm:grid-cols-2 lg:grid-cols-5 rounded-t-xl">
          <div className="lg:col-span-2">
            <Input
              label="Search"
              placeholder="Title or original file name…"
              value={query}
              onChange={(e) => upd(setQuery)(e.target.value)}
            />
          </div>
          <Input
            label="Owner"
            placeholder="Name or e-mail…"
            value={owner}
            onChange={(e) => upd(setOwner)(e.target.value)}
          />
          <Select label="Category" value={category} onChange={(e) => upd(setCategory)(e.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Input label="From" type="date" value={from} onChange={(e) => upd(setFrom)(e.target.value)} />
            <Input label="To" type="date" value={to} onChange={(e) => upd(setTo)(e.target.value)} />
          </div>
        </div>

        {res.loading ? (
          <SkeletonRows rows={6} quote="Retrieving authorized documents…" />
        ) : res.error ? (
          <div className="p-4">
            <ErrorNotice message={res.error} onRetry={res.reload} />
          </div>
        ) : res.data && res.data.rows.length > 0 ? (
          <>
            <DocumentTable rows={res.data.rows} />
            <Pagination page={page} pageSize={PAGE_SIZE} total={res.data.total} onChange={setPage} />
          </>
        ) : res.data && res.data.total > 0 ? (
          <EmptyState
            icon={FileSearch}
            title="No results on this page"
            quote="Navigating into unexplored sectors of the vault."
            action={
              <Button variant="secondary" onClick={() => setPage(1)}>
                Go to first page
              </Button>
            }
          />
        ) : filtered ? (
          <EmptyState
            icon={FileSearch}
            title="No matching documents"
            description="Try changing or clearing your filters."
            quote="No documents matched your security radar."
            action={
              <Button variant="secondary" onClick={reset}>
                Clear filters
              </Button>
            }
          />
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
    </>
  )
}
