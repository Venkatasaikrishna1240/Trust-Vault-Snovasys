import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { FileText, LayoutDashboard, LogOut, Menu, ScrollText, ShieldCheck, Upload, Users, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../features/auth/AuthContext'
import { cx } from '../components/ui/cx'
import { Badge } from '../components/ui/Badge'

interface NavItem { to: string; label: string; icon: LucideIcon; end?: boolean }

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate: () => void }) {
  return (
    <ul className="space-y-1">
      {items.map(({ to, label, icon: Icon, end }) => (
        <li key={to}>
          <NavLink to={to} end={end} onClick={onNavigate}
            className={({ isActive }) => cx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
              isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')}>
            <Icon className="h-4 w-4" aria-hidden="true" />{label}
          </NavLink>
        </li>
      ))}
    </ul>
  )
}

export default function AppLayout() {
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setOpen(false), [pathname])

  const main: NavItem[] = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/documents', label: 'Documents', icon: FileText, end: true },
  ]
  if (profile) main.push({ to: '/documents/new', label: 'Upload', icon: Upload })
  const admin: NavItem[] = profile?.role === 'admin'
    ? [{ to: '/admin/audit', label: 'Audit log', icon: ScrollText }, { to: '/admin/users', label: 'Users', icon: Users }]
    : []

  const nav = (
    <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      <NavList items={main} onNavigate={() => setOpen(false)} />
      {admin.length > 0 && (
        <div>
          <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Administration</p>
          <NavList items={admin} onNavigate={() => setOpen(false)} />
        </div>
      )}
    </nav>
  )

  const account = (
    <div className="border-t border-slate-200 p-3">
      <div className="mb-2 flex items-center justify-between gap-2 px-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">{profile?.display_name || profile?.email || 'Account'}</p>
          {profile?.display_name && <p className="truncate text-xs text-slate-500">{profile.email}</p>}
        </div>
        {profile && <Badge tone="indigo">{profile.role}</Badge>}
      </div>
      <button type="button" onClick={() => void signOut()}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
        <LogOut className="h-4 w-4" aria-hidden="true" />Sign out
      </button>
    </div>
  )

  const brand = (
    <div className="flex items-center gap-2 px-5 text-slate-900">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white"><ShieldCheck className="h-5 w-5" aria-hidden="true" /></span>
      <span className="text-lg font-semibold tracking-tight">TrustVault</span>
    </div>
  )

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:fixed lg:inset-y-0 lg:flex">
        <div className="flex h-16 items-center">{brand}</div>
        {nav}{account}
      </aside>

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white lg:hidden">
        <div className="flex h-14 items-center justify-between pr-3">
          {brand}
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'} className="rounded-md p-2 text-slate-600 hover:bg-slate-100">
            {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
        {open && <div id="mobile-nav" className="flex max-h-[80vh] flex-col border-t border-slate-200">{nav}{account}</div>}
      </header>

      <main id="content" className="min-w-0 flex-1 lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8"><Outlet /></div>
      </main>
    </div>
  )
}
