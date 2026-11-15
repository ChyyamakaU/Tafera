import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

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

export default function Header() {
  const location = useLocation()
  const [open, setOpen] = useState(false)

  const isActive = (to) => location.pathname === to

  const toggleMenu = () => setOpen((prev) => !prev)
  const closeMenu = () => setOpen(false)

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-tafera-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 py-4">
          {/* Brand — logo symbol + wordmark */}
          <Link
            to="/"
            className="flex items-center gap-3"
            aria-label="Tafera — travel platform home"
          >
            <img
              src="/Tafera logo.svg"
              alt="Tafera"
              width="40"
              height="40"
            />
            <span className="font-heading font-bold text-xl tracking-tight">
              Tafera
            </span>
          </Link>

          {/* Desktop navigation */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-tafera-text">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`transition-colors ${
                  isActive(link.to)
                    ? 'text-tafera-primary font-semibold'
                    : 'hover:text-tafera-accent'
                }`}
                aria-current={isActive(link.to) ? 'page' : undefined}
              >
                {link.label}
              </Link>
            ))}
            <div className="flex items-center gap-3">
              {AUTH_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="px-3 py-1.5 rounded-md text-sm font-medium border border-tafera-border text-tafera-text transition-colors hover:bg-tafera-surface hover:text-tafera-accent"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </nav>

          {/* Mobile menu button */}
          <button
            onClick={toggleMenu}
            className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-md text-tafera-text hover:bg-tafera-surface focus:outline-none"
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

      {/* Mobile navigation drawer */}
      <nav
        id="tafera-mobile-menu"
        className={`md:hidden ${
          open
            ? 'max-h-[calc(100vh-4rem)] overflow-y-auto opacity-100'
            : 'max-h-0 overflow-hidden opacity-0'
        } transition-all duration-300 ease-in-out border-t border-tafera-border mt-0`}
        aria-label="Mobile navigation"
      >
        <div className="px-4 py-4 space-y-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={closeMenu}
              className={`block px-3 py-3 rounded-md text-sm font-medium transition-colors ${
                isActive(link.to)
                  ? 'bg-tafera-surface text-tafera-primary'
                  : 'text-tafera-text hover:bg-tafera-surface hover:text-tafera-accent'
              }`}
              aria-current={isActive(link.to) ? 'page' : undefined}
            >
              {link.label}
            </Link>
          ))}
          <div className="pt-4 border-t border-tafera-border space-y-1">
            {AUTH_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={closeMenu}
                className="block w-full text-center px-3 py-3 rounded-md text-sm font-medium border border-tafera-border text-tafera-text transition-colors hover:bg-tafera-surface hover:text-tafera-accent"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>
    </header>
  )
}
