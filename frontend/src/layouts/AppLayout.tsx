import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Upload,
  Users,
  X,
  Lock,
  Sparkles,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../features/auth/AuthContext'
import { cx } from '../components/ui/cx'
import { Badge } from '../components/ui/Badge'
import NotificationCenter from '../components/NotificationCenter'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate: () => void }) {
  return (
    <ul className="space-y-1">
      {items.map(({ to, label, icon: Icon, end }) => (
        <li key={to}>
          <NavLink
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cx(
                'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
                isActive
                  ? 'bg-blue-600/20 text-white font-semibold shadow-xs border-l-2 border-blue-500 pl-2.5'
                  : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200 border-l-2 border-transparent',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  className={cx(
                    'h-4 w-4 transition-transform duration-150 group-hover:scale-110',
                    isActive ? 'text-blue-400' : 'text-slate-400 group-hover:text-slate-200',
                  )}
                  aria-hidden="true"
                />
                <span className="flex-1">{label}</span>
              </>
            )}
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
  if (profile) main.push({ to: '/documents/new', label: 'Upload document', icon: Upload })

  const admin: NavItem[] =
    profile?.role === 'admin'
      ? [
          { to: '/admin/audit', label: 'Audit log', icon: ScrollText },
          { to: '/admin/users', label: 'Users & Roles', icon: Users },
        ]
      : []

  const nav = (
    <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto px-3.5 py-4">
      <div>
        <p className="mb-2 px-3 text-2xs font-bold uppercase tracking-wider text-slate-400">Vault Navigation</p>
        <NavList items={main} onNavigate={() => setOpen(false)} />
      </div>
      {admin.length > 0 && (
        <div>
          <p className="mb-2 px-3 text-2xs font-bold uppercase tracking-wider text-slate-400">Administration</p>
          <NavList items={admin} onNavigate={() => setOpen(false)} />
        </div>
      )}
    </nav>
  )

  const account = (
    <div className="border-t border-slate-800/90 p-3.5 bg-slate-950/40">
      {/* Mini security status pill */}
      <div className="mb-3 flex items-center justify-between rounded-lg bg-slate-850/80 px-2.5 py-1.5 border border-slate-800 text-2xs">
        <div className="flex items-center gap-1.5 text-slate-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
          </span>
          <span className="font-semibold text-slate-300">Vault Active</span>
        </div>
        <span className="font-mono text-slate-400 text-2xs">256-bit AES</span>
      </div>

      <div className="mb-2.5 flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-xs font-bold text-white shadow-xs">
            {profile?.display_name ? profile.display_name.charAt(0).toUpperCase() : profile?.email ? profile.email.charAt(0).toUpperCase() : 'U'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-slate-200">
              {profile?.display_name || profile?.email || 'Account'}
            </p>
            {profile?.display_name && (
              <p className="truncate text-2xs text-slate-400 font-mono">{profile.email}</p>
            )}
          </div>
        </div>
        {profile && (
          <Badge tone={profile.role === 'admin' ? 'amber' : profile.role === 'owner' ? 'indigo' : 'slate'}>
            {profile.role}
          </Badge>
        )}
      </div>

      <button
        type="button"
        onClick={() => void signOut()}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs font-medium text-slate-300 hover:border-slate-700 hover:bg-slate-800 hover:text-white transition-all duration-150"
      >
        <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Sign out</span>
      </button>
    </div>
  )

  const brand = (
    <Link to="/" className="flex items-center gap-3 px-5 group">
      <img
        src="/logo-icon.png"
        alt="TrustVault"
        className="h-10 w-auto object-contain drop-shadow-md transition-transform duration-200 group-hover:scale-105"
      />
      <div>
        <span className="text-base font-extrabold tracking-tight text-white block">TrustVault</span>
        <p className="text-2xs text-slate-400 font-medium tracking-wider uppercase">Secure · Manage · Share</p>
      </div>
    </Link>
  )

  return (
    <div className="flex min-h-screen flex-col bg-slate-900 text-slate-900 lg:flex-row">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2.5 focus:font-semibold focus:shadow-xl focus:ring-2 focus:ring-blue-600"
      >
        Skip to content
      </a>

      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-800/90 bg-slate-900 text-slate-300 lg:fixed lg:inset-y-0 lg:flex">
        <div className="flex h-16 items-center border-b border-slate-800/90">{brand}</div>
        {nav}
        {account}
      </aside>

      {/* Mobile Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900 text-white lg:hidden w-full">
        <div className="flex h-16 items-center justify-between pr-16">
          {brand}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
        {open && (
          <div id="mobile-nav" className="flex max-h-[85vh] flex-col border-t border-slate-800 bg-slate-900">
            {nav}
            {account}
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <div className="min-w-0 flex-1 lg:pl-64 flex flex-col bg-slate-50">
        {/* Desktop Top Header Bar */}
        <div className="hidden lg:flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/95 px-8 pr-20 sticky top-0 z-20 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/80 px-3 py-1 text-xs font-semibold text-emerald-800">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
              <span>Vault Guarded</span>
            </span>
            <span className="text-xs text-slate-400 font-mono">|</span>
            <span className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-blue-500" aria-hidden="true" />
              <span>Tamper-evident cryptographic ledger active</span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            {profile && (
              <Link
                to="/documents/new"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition-colors"
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Upload</span>
              </Link>
            )}
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200 text-xs text-slate-600">
              <Lock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              <span className="font-mono">{profile?.role || 'viewer'}</span>
            </div>
          </div>
        </div>

        <main id="content" className="min-w-0 flex-1">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <Outlet />
          </div>
        </main>
      </div>
      {profile && (
        <div className="fixed right-4 top-3 z-[60] lg:right-8">
          <NotificationCenter userId={profile.id} />
        </div>
      )}
    </div>
  )
}
