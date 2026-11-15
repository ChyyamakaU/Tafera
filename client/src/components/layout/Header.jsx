import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/destinations', label: 'Destinations' },
  { to: '/trips', label: 'Trips' },
  { to: '/group-travel', label: 'Group Travel' },
  { to: '/social', label: 'Social Feed' },
  { to: '/scrapbooks', label: 'Scrapbooks' },
]

const AUTH_LINKS = [
  { to: '/login', label: 'Log in' },
  { to: '/register', label: 'Register' },
]

const LogoMark = () => (
  <svg
    className="w-7 h-7"
    viewBox="0 0 32 32"
    fill="none"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    {/* Earth / globe outline */}
    <circle cx="16" cy="16" r="13" stroke="var(--color-tafera-primary)" stroke-width="2.5" fill="none" />
    {/* Horizon / exploration arc */}
    <path
      d="M4 20 Q16 25 28 20"
      stroke="var(--color-tafera-secondary)"
      stroke-width="2.5"
      fill="none"
    />
    {/* Landmark / destination peak */}
    <path
      d="M16 9 L10 18 L22 18 Z"
      fill="var(--color-tafera-primary)"
    />
  </svg>
)

export default function Header() {
  const location = useLocation()
  const [open, setOpen] = useState(false)

  const isActive = (to) => location.pathname === to

  const toggleMenu = () => setOpen((prev) => !prev)
  const closeMenu = () => setOpen(false)

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-tafera-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 py-3">
          {/* Brand */}
          <Link
            to="/"
            className="flex items-center gap-2 text-tafera-primary font-heading font-bold text-xl tracking-tight"
            aria-label="Tafera — travel platform home"
          >
            <LogoMark />
            <span>Tafera</span>
          </Link>

          {/* Desktop navigation */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-tafera-text-muted">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`px-3 py-2 rounded-lg transition-colors ${
                  isActive(link.to)
                    ? 'bg-tafera-primary/10 text-tafera-primary font-semibold'
                    : 'hover:bg-tafera-bg hover:text-tafera-text'
                }`}
                aria-current={isActive(link.to) ? 'page' : undefined}
              >
                {link.label}
              </Link>
            ))}
            <div className="flex items-center gap-2">
              {AUTH_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="px-3 py-2 rounded-lg text-tafera-text-muted transition-colors hover:bg-tafera-bg hover:text-tafera-text"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </nav>

          {/* Mobile menu button + admin link (desktop only) */}
          <div className="flex items-center gap-2">
            <Link
              to="/admin"
              className="hidden md:flex items-center gap-2 px-3 py-2 rounded-lg text-tafera-text-muted font-medium transition-colors hover:bg-tafera-bg hover:text-tafera-text"
            >
              Admin
            </Link>
            <button
              onClick={toggleMenu}
              className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg text-tafera-text-muted hover:bg-tafera-bg hover:text-tafera-text focus:outline-none"
              aria-expanded={open}
              aria-controls="tafera-mobile-menu"
              aria-label="Toggle navigation menu"
            >
              {open ? (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width="1.5"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              ) : (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width="1.5"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile navigation drawer */}
      <nav
        id="tafera-mobile-menu"
        className={`md:hidden ${
          open
            ? 'max-h-[calc(100vh-4rem)] overflow-y-auto opacity-100'
            : 'max-h-0 overflow-hidden opacity-0'
        } transition-all duration-300 ease-in-out border-t border-tafera-border mt-1`}
        aria-label="Mobile navigation"
      >
        <div className="px-4 py-4 space-y-2">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={closeMenu}
              className={`block px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                isActive(link.to)
                  ? 'bg-tafera-primary/10 text-tafera-primary'
                  : 'text-tafera-text-muted hover:bg-tafera-bg hover:text-tafera-text'
              }`}
              aria-current={isActive(link.to) ? 'page' : undefined}
            >
              {link.label}
            </Link>
          ))}
          <div className="pt-4 border-t border-tafera-border space-y-2">
            {AUTH_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={closeMenu}
                className="block w-full text-center px-3 py-3 rounded-lg text-sm font-medium text-tafera-text-muted transition-colors hover:bg-tafera-bg hover:text-tafera-text"
              >
                {link.label}
              </Link>
            ))}
            <Link
              to="/admin"
              onClick={closeMenu}
              className="block w-full text-center px-3 py-3 rounded-lg text-sm font-medium text-tafera-text-muted transition-colors hover:bg-tafera-bg hover:text-tafera-text"
            >
              Admin
            </Link>
          </div>
        </div>
      </nav>
    </header>
  )
}
