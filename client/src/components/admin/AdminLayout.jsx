import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { Button } from '../common/Button'

const NAV_ITEMS = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/destinations', label: 'Destinations' },
  { to: '/admin/moderation', label: 'Moderation' },
  { to: '/admin/trips', label: 'Group Trips' },
  { to: '/admin/stories', label: 'Homepage Stories' },
]

const navLinkClass = ({ isActive }) =>
  `flex items-center justify-between rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-tafera-accent text-tafera-on-accent font-semibold shadow-soft'
      : 'text-tafera-text hover:bg-tafera-card hover:text-tafera-primary'
  }`

export default function AdminLayout() {
  const { user, logout } = useAuth()
  const { isDark, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    if (!sidebarOpen) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [sidebarOpen])

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await logout()
      navigate('/login')
    } finally {
      setLoggingOut(false)
    }
  }

  const renderSidebarNav = (onSelect) => (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-tafera-border px-5 py-4">
        <Link to="/admin" onClick={onSelect} className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-tafera-accent font-heading text-sm font-extrabold text-tafera-on-accent">
            T
          </span>
          <div>
            <span className="block font-heading text-sm font-bold text-tafera-text">
              Tafera Admin
            </span>
            <span className="block text-[11px] text-tafera-text-muted">
              Operations Console
            </span>
          </div>
        </Link>
        {onSelect && (
          <button
            type="button"
            onClick={onSelect}
            className="rounded-md p-1.5 text-tafera-text hover:bg-tafera-card lg:hidden"
            aria-label="Close admin menu"
          >
            ✕
          </button>
        )}
      </div>

      <nav aria-label="Admin navigation" className="flex-1 space-y-1 p-4">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onSelect}
            className={navLinkClass}
          >
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="space-y-2 border-t border-tafera-border p-4">
        <div className="rounded-lg border border-tafera-border bg-tafera-card px-3 py-2.5">
          <p className="truncate text-xs font-semibold text-tafera-text">
            {user?.fullName || 'Administrator'}
          </p>
          <p className="truncate text-[11px] text-tafera-text-muted">
            {user?.email || 'Admin session'}
          </p>
        </div>
        <Link
          to="/"
          className="flex w-full items-center justify-center rounded-lg border border-tafera-border bg-tafera-card px-3 py-2 text-xs font-semibold text-tafera-text transition-colors hover:bg-tafera-bg hover:text-tafera-primary"
        >
          ← Return to Tafera
        </Link>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-svh bg-tafera-bg text-tafera-text">
      {/* Desktop persistent sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-tafera-border bg-tafera-surface lg:block">
        <div className="sticky top-0 h-svh overflow-y-auto">
          {renderSidebarNav()}
        </div>
      </aside>

      {/* Mobile slide-over drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Admin navigation menu">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-72 max-w-[85vw] border-r border-tafera-border bg-tafera-surface shadow-card">
            {renderSidebarNav(() => setSidebarOpen(false))}
          </aside>
        </div>
      )}

      {/* Main admin column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-tafera-border bg-tafera-surface/95 px-4 py-3 backdrop-blur-xs sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-tafera-border bg-tafera-card text-tafera-text hover:bg-tafera-bg lg:hidden"
              aria-label="Open admin menu"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="inline-flex items-center rounded-full bg-tafera-lime px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-tafera-ink">
              Admin
            </span>
            <span className="hidden text-xs text-tafera-text-muted sm:inline">
              Protected administrative workspace
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              aria-pressed={isDark}
              className="inline-flex items-center gap-1.5 rounded-md border border-tafera-border bg-tafera-card px-3 py-1.5 text-xs font-semibold text-tafera-text transition-colors hover:bg-tafera-bg"
            >
              <span>{isDark ? 'Light mode' : 'Dark mode'}</span>
            </button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loggingOut}
              onClick={handleLogout}
            >
              {loggingOut ? 'Signing out…' : 'Log out'}
            </Button>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
