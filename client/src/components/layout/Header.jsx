import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

const PUBLIC_NAV = [
  {
    label: 'Discover',
    items: [
      { label: 'Destinations', to: '/destinations' },
      { label: 'Travel Stories', to: '/social' },
      { label: 'Community', to: '/social' },
    ],
  },
  {
    label: 'How It Works',
    to: '/how-it-works',
  },
  {
    label: 'Features',
    items: [
      { label: 'Destination Discovery', to: '/destinations' },
      { label: 'Traveller Community', to: '/social' },
      { label: 'Social Feed', to: '/social' },
      { label: 'Trip Planning', to: '/trips' },
      { label: 'Group Travel', to: '/group-travel' },
      { label: 'Travel Scrapbooks', to: '/scrapbooks' },
      { label: 'Destination Photo Galleries', to: '/destinations' },
    ],
  },
  {
    label: 'Partners',
    to: '/partners',
  },
]

const PROFILE_MENU_ITEMS = [
  { to: '/profile', label: 'My Profile' },
  { to: '/scrapbooks', label: 'My Scrapbooks' },
  { to: '/photos', label: 'My Photos' },
  { to: '/settings', label: 'Settings' },
  { to: null, label: 'Log out' },
]

export default function Header() {
  const { user, isAuthenticated, isEmailVerified, isLoading, logout, resendVerification } = useAuth()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [openDropdown, setOpenDropdown] = useState(null)
  const [scrolled, setScrolled] = useState(false)
  const [logoutLoading, setLogoutLoading] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendError, setResendError] = useState(null)
  const navigate = useNavigate()

  const isActive = (to) => location.pathname === to

  const toggleMenu = () => setMenuOpen((prev) => !prev)
  const closeMenu = () => setMenuOpen(false)
  const toggleProfileMenu = () => {
    setProfileMenuOpen((prev) => !prev)
    setResendError(null)
  }
  const closeProfileMenu = () => setProfileMenuOpen(false)
  const toggleDropdown = (label) =>
    setOpenDropdown((prev) => (prev === label ? null : label))

  const handleResendVerification = async () => {
    setResendLoading(true)
    try {
      await resendVerification()
      closeProfileMenu()
    } catch (err) {
      setResendError(err.message || 'Failed to resend verification email.')
    } finally {
      setResendLoading(false)
    }
  }

  const handleLogout = async () => {
    setLogoutLoading(true)
    try {
      await logout()
      navigate('/')
    } catch {
      // Logout error: session is already cleared on the server side in most cases.
      // Ensure UI reflects unauthenticated state regardless.
      navigate('/')
    } finally {
      setLogoutLoading(false)
    }
  }

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 0)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const navLinkItem = (section) => {
    if (section.to) {
      return (
        <Link
          key={section.label}
          to={section.to}
          className="px-4 py-2 rounded-md font-nav font-medium text-base text-tafera-text transition-colors hover:text-tafera-accent"
          aria-current={isActive(section.to) ? 'page' : undefined}
        >
          {section.label}
        </Link>
      )
    }
    return (
      <div key={section.label} className="relative group">
        <button
          onClick={() => toggleDropdown(section.label)}
          className="flex items-center gap-1 px-4 py-2 rounded-md font-nav font-medium text-base text-tafera-text transition-colors hover:text-tafera-accent"
          aria-haspopup="true"
          aria-expanded={openDropdown === section.label}
        >
          {section.label}
          <svg
            className="w-3 h-3 ml-1 text-tafera-text-muted transition-transform duration-200"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
            fill="none"
            style={{
              transform: openDropdown === section.label
                ? 'rotate(180deg)'
                : 'rotate(0deg)',
            }}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {openDropdown === section.label && (
          <div className="absolute top-full left-0 mt-2 w-56 rounded-md border border-tafera-border bg-white shadow-card py-3 z-50">
            {section.items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="block px-4 py-2.5 text-sm text-tafera-text transition-colors hover:bg-tafera-surface hover:text-tafera-accent"
              >
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    )
  }

  const desktopAuth = () => {
    if (isAuthenticated) {
      return (
        <div className="relative inline-flex items-center">
          <button
            onClick={toggleProfileMenu}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md font-nav font-medium text-base text-tafera-text transition-colors hover:bg-tafera-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-tafera-primary"
            aria-haspopup="true"
            aria-expanded={profileMenuOpen}
          >
            <span className="w-6 h-6 rounded-full bg-tafera-surface border border-tafera-border flex items-center justify-center text-sm font-semibold text-tafera-text">
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
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {profileMenuOpen && (
            <div
              className="fixed right-4 top-14 w-[240px] rounded-md border border-tafera-border bg-white shadow-card py-2 z-[60] max-h-[calc(100vh-6rem)] overflow-y-auto"
            >
              {renderProfileLinks()}
            </div>
          )}
        </div>
      )
    }
    return (
      <div className="flex items-center gap-3">
        <Link
          to="/login"
          className="text-base font-nav font-medium text-tafera-text hover:text-tafera-accent transition-colors"
        >
          Sign in
        </Link>
        <Link
          to="/register"
          className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-md bg-tafera-accent text-white font-semibold transition-colors hover:bg-tafera-accent/90"
        >
          Join for Free
        </Link>
      </div>
    )
  }

  const renderProfileLinks = () => (
    <>
      {!isEmailVerified && (
        <>
          <Link
            key="verify-email"
            to="/verify-email"
            onClick={closeProfileMenu}
            className="font-nav font-medium text-base block px-4 py-2.5 text-tafera-text hover:bg-tafera-surface hover:text-tafera-accent transition-colors"
          >
            Verify your email
          </Link>
          <button
            key="resend-verification"
            onClick={handleResendVerification}
            disabled={resendLoading}
            className="font-nav font-medium text-base block w-full text-left px-4 py-2.5 text-tafera-text hover:bg-tafera-surface hover:text-tafera-accent transition-colors"
          >
            {resendLoading ? 'Sending...' : 'Resend verification email'}
          </button>
          <button
            key="log-out"
            onClick={handleLogout}
            disabled={logoutLoading}
            className="font-nav font-medium text-base block w-full text-left px-4 py-2.5 text-tafera-text hover:bg-tafera-surface hover:text-tafera-accent transition-colors"
          >
            {logoutLoading ? 'Signing out...' : 'Log out'}
          </button>
          {resendError && (
            <div className="mb-3 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
              {resendError}
            </div>
          )}
        </>
      )}
      {isEmailVerified && (
        <>
          {PROFILE_MENU_ITEMS.map((item) =>
            item.to ? (
              <Link
                key={item.to}
                to={item.to}
                onClick={closeProfileMenu}
                className="font-nav font-medium text-base block px-4 py-2.5 text-tafera-text hover:bg-tafera-surface hover:text-tafera-accent transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                onClick={handleLogout}
                disabled={logoutLoading}
                className="font-nav font-medium text-base block w-full text-left px-4 py-2.5 text-tafera-text hover:bg-tafera-surface hover:text-tafera-accent transition-colors"
              >
                {logoutLoading ? 'Signing out...' : item.label}
              </button>
            ),
          )}
        </>
      )}
    </>
  )

  const mobileMenuButton = () => (
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
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
          fill="none"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      ) : (
        <svg
          className="w-5 h-5"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
          fill="none"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      )}
    </button>
  )

  const mobileDrawer = () => (
    <nav
      id="tafera-mobile-menu"
      className={`md:hidden ${
        menuOpen
          ? 'max-h-[calc(100vh-4rem)] overflow-y-auto opacity-100'
          : 'max-h-0 overflow-hidden opacity-0'
      } transition-all duration-300 ease-in-out border-t border-tafera-border mt-0`}
      aria-label="Mobile navigation"
    >
      <div className="px-3 py-4 space-y-4">
        {PUBLIC_NAV.map((section) => (
          <div key={section.label}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center justify-between w-full px-3 py-3 rounded-md text-sm font-nav font-medium text-tafera-text transition-colors hover:bg-tafera-surface"
              aria-expanded={menuOpen}
            >
              {section.label}
              <svg
                className="w-4 h-4 text-tafera-text-muted transition-transform duration-200"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
                fill="none"
                style={{ transform: menuOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {menuOpen && section.items && (
              <div className="ml-4 space-y-2 border-l border-tafera-border pl-4">
                {section.items.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={closeMenu}
                    className="block px-3 py-2 text-sm text-tafera-text hover:bg-tafera-surface hover:text-tafera-accent transition-colors"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="pt-4 border-t border-tafera-border space-y-1">
          {isAuthenticated ? renderMobileAuthLinks() : renderMobileGuestLinks()}
        </div>
      </div>
    </nav>
  )

  const renderMobileGuestLinks = () => (
    <>
      <div
        className="px-3 py-3 rounded-md border border-tafera-border text-tafera-text font-medium text-center transition-colors hover:bg-tafera-surface hover:text-tafera-accent cursor-pointer"
        onClick={() => {
          setMenuOpen(false)
          navigate('/login')
        }}
      >
        Sign in
      </div>
      <div
        className="px-3 py-3 rounded-md bg-tafera-accent text-white font-medium text-center transition-colors hover:bg-tafera-accent/90 cursor-pointer"
        onClick={() => {
          setMenuOpen(false)
          navigate('/register')
        }}
      >
        Join for Free
      </div>
    </>
  )

  const renderMobileAuthLinks = () => (
    <>
      {!isEmailVerified && (
        <>
          <Link
            key="verify-email"
            to="/verify-email"
            onClick={closeMenu}
            className="block px-3 py-3 rounded-md text-sm font-nav font-medium text-tafera-text hover:bg-tafera-surface hover:text-tafera-accent transition-colors"
          >
            Verify your email
          </Link>
          <button
            key="resend-verification"
            onClick={handleResendVerification}
            disabled={resendLoading}
            className="block px-3 py-3 rounded-md text-sm font-nav font-medium text-tafera-text hover:bg-tafera-surface hover:text-tafera-accent transition-colors text-left w-full"
          >
            {resendLoading ? 'Sending...' : 'Resend verification email'}
          </button>
          <button
            key="log-out"
            onClick={handleLogout}
            disabled={logoutLoading}
            className="block px-3 py-3 rounded-md text-sm font-nav font-medium text-tafera-text hover:bg-tafera-surface hover:text-tafera-accent transition-colors text-left w-full"
          >
            {logoutLoading ? 'Signing out...' : 'Log out'}
          </button>
          {resendError && (
            <div className="mb-3 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
              {resendError}
            </div>
          )}
        </>
      )}
      {isEmailVerified && (
        <>
          {PROFILE_MENU_ITEMS.map((item) =>
            item.to ? (
              <Link
                key={item.to}
                to={item.to}
                onClick={closeMenu}
                className="block px-3 py-3 rounded-md text-sm font-nav font-medium text-tafera-text hover:bg-tafera-surface hover:text-tafera-accent transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                onClick={handleLogout}
                disabled={logoutLoading}
                className="block px-3 py-3 rounded-md text-sm font-nav font-medium text-tafera-text hover:bg-tafera-surface hover:text-tafera-accent transition-colors text-left w-full"
              >
                {logoutLoading ? 'Signing out...' : item.label}
              </button>
            ),
          )}
        </>
      )}
    </>
  )

  return (
    <header
      className={`sticky top-0 z-50 border-b border-tafera-border px-0 md:px-15 ${
        scrolled ? 'shadow-sm' : ''
      }`}
      style={{
        backgroundColor: scrolled ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 1)',
      }}
    >
      <div className="px-[15px] py-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <div className="justify-self-start">
            <Link
              to="/"
              className="flex items-center gap-3 shrink-0"
              aria-label="Tafera — travel platform home"
            >
              <img src="/Tafera logo.svg" alt="Tafera" width="40" height="40" />
              <span className="font-heading font-bold text-xl tracking-tight text-tafera-text">
                Tafera
              </span>
            </Link>
          </div>

          <nav className="hidden md:flex justify-self-center gap-8">
            {PUBLIC_NAV.map(navLinkItem)}
          </nav>

          <div className="justify-self-end hidden md:flex">
            {desktopAuth()}
          </div>

          <div className="justify-self-end md:hidden">
            {mobileMenuButton()}
          </div>
        </div>
      </div>

      {mobileDrawer()}
    </header>
  )
}
