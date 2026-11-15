import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'

const PUBLIC_NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/destinations', label: 'Destinations' },
  { to: '/social', label: 'Social Feed' },
]

const AUTHENTICATED_NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/destinations', label: 'Destinations' },
  { to: '/social', label: 'Social Feed' },
  { to: '/trips', label: 'My Trips' },
  { to: '/group-travel', label: 'Group Travel' },
  { to: '/notifications', label: 'Notifications' },
]

const AUTH_ACTIONS = [
  { to: '/login', label: 'Log in', variant: 'outline' },
  { to: '/register', label: 'Sign up', variant: 'primary' },
]

const PROFILE_MENU_ITEMS = [
  { to: '/profile', label: 'My Profile' },
  { to: '/scrapbooks', label: 'My Scrapbooks' },
  { to: '/photos', label: 'My Photos' },
  { to: '/settings', label: 'Settings' },
  { to: null, label: 'Log out' },
]

export default function Header({ isAuthenticated = false } = {}) {
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)

  const isActive = (to) => location.pathname === to

  const toggleMenu = () => setMenuOpen((prev) => !prev)
  const closeMenu = () => setMenuOpen(false)
  const toggleProfileMenu = () => setProfileMenuOpen((prev) => !prev)
  const closeProfileMenu = () => setProfileMenuOpen(false)

  const navLinks = isAuthenticated
    ? AUTHENTICATED_NAV_LINKS
    : PUBLIC_NAV_LINKS

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
            <span className="font-heading font-bold text-xl tracking-tight text-tafera-text">
              Tafera
            </span>
          </Link>

          {/* Desktop navigation */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-tafera-text">
            {navLinks.map((link) => (
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
            {isAuthenticated ? (
              <div className="relative inline-flex items-center">
                <button
                  onClick={toggleProfileMenu}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-tafera-text transition-colors hover:bg-tafera-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-tafera-primary"
                  aria-haspopup="true"
                  aria-expanded={profileMenuOpen}
                >
                  <span className="w-6 h-6 rounded-full bg-tafera-surface border border-tafera-border flex items-center justify-center text-xs font-semibold text-tafera-text">
                    U
                  </span>
                  <span>Profile</span>
                  <svg
                    className="w-4 h-4 text-tafera-text-muted"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>
                {profileMenuOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-md border border-tafera-border bg-white shadow-card py-2 z-50">
                    {PROFILE_MENU_ITEMS.map((item) =>
                      item.to ? (
                        <Link
                          key={item.to}
                          to={item.to}
                          onClick={closeProfileMenu}
                          className="block px-4 py-2.5 text-sm text-tafera-text hover:bg-tafera-surface hover:text-tafera-accent transition-colors"
                        >
                          {item.label}
                        </Link>
                      ) : (
                        <button
                          key={item.label}
                          onClick={closeProfileMenu}
                          className="block w-full text-left px-4 py-2.5 text-sm text-tafera-text hover:bg-tafera-surface hover:text-tafera-accent transition-colors text-left"
                        >
                          {item.label}
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-3">
                {AUTH_ACTIONS.map((action) => (
                  <Link
                    key={action.to}
                    to={action.to}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                      action.variant === 'primary'
                        ? 'bg-tafera-accent text-white border-tafera-accent hover:bg-tafera-accent/90'
                        : 'border-tafera-border text-tafera-text hover:bg-tafera-surface hover:text-tafera-accent'
                    }`}
                  >
                    {action.label}
                  </Link>
                ))}
              </div>
            )}

            {/* Mobile menu button */}
            <button
              onClick={toggleMenu}
              className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-md text-tafera-text hover:bg-tafera-surface focus:outline-none"
              aria-expanded={menuOpen}
              aria-controls="tafera-mobile-menu"
              aria-label="Toggle navigation menu"
            >
              {menuOpen ? (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              ) : (
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              )}
            </button>
          </nav>
        </div>
      </div>

      {/* Mobile navigation drawer */}
      <nav
        id="tafera-mobile-menu"
        className={`md:hidden ${
          menuOpen
            ? 'max-h-[calc(100vh-4rem)] overflow-y-auto opacity-100'
            : 'max-h-0 overflow-hidden opacity-0'
        } transition-all duration-300 ease-in-out border-t border-tafera-border mt-0`}
        aria-label="Mobile navigation"
      >
        <div className="px-4 py-4 space-y-1">
          {navLinks.map((link) => (
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
            {!isAuthenticated ? (
              <>
                {AUTH_ACTIONS.map((action) => (
                  <Link
                    key={action.to}
                    to={action.to}
                    onClick={closeMenu}
                    className={`block w-full text-center px-3 py-3 rounded-md text-sm font-medium border border-tafera-border text-tafera-text transition-colors ${
                      action.variant === 'primary'
                        ? 'bg-tafera-accent text-white border-tafera-accent hover:bg-tafera-accent/90'
                        : 'hover:bg-tafera-surface hover:text-tafera-accent'
                    }`}
                  >
                    {action.label}
                  </Link>
                ))}
              </>
            ) : (
              <>
                {PROFILE_MENU_ITEMS.map((item) =>
                  item.to ? (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={closeMenu}
                      className="block w-full text-left px-3 py-3 rounded-md border-b border-tafera-border/50 text-sm font-medium text-tafera-text hover:bg-tafera-surface hover:text-tafera-accent transition-colors"
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <button
                      key={item.label}
                      onClick={closeMenu}
                      className="block w-full text-left px-3 py-3 rounded-md border-b border-tafera-border/50 text-sm font-medium text-tafera-text hover:bg-tafera-surface hover:text-tafera-accent transition-colors"
                    >
                      {item.label}
                    </button>
                  ),
                )}
              </>
            )}
          </div>
        </div>
      </nav>
    </header>
  )
}
