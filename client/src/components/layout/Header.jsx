import { useState, useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { fetchUnreadCount } from '../../services/notifications'

const MOBILE_TRAVEL_LINKS = [
  { label: 'My Trips', to: '/trips' },
  { label: 'Scrapbooks', to: '/scrapbooks' },
  { label: 'My Destinations', to: '/my-destinations' },
  { label: 'My Group Trips', to: '/group-travel' },
]

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

const AUTHENTICATED_NAV = [
  { label: 'Feed', to: '/social' },
  { label: 'Explore', to: '/destinations' },
  { label: 'Group Trips', to: '/group-travel' },
  { label: 'My Trips', to: '/trips' },
  { label: 'Scrapbooks', to: '/scrapbooks' },
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
  const { isDark, toggleTheme } = useTheme()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [mobileAccountOpen, setMobileAccountOpen] = useState(false)
  const [openDropdown, setOpenDropdown] = useState(null)
  const [mobileOpenSection, setMobileOpenSection] = useState(null)
  const [mobileTravelsOpen, setMobileTravelsOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [scrolled, setScrolled] = useState(false)
  const [logoutLoading, setLogoutLoading] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [resendError, setResendError] = useState(null)
  const navigate = useNavigate()
  const featuresDropdownRef = useRef(null)
  const profileDropdownRef = useRef(null)
  const mobileAccountRef = useRef(null)
  const platformAuthenticated = isAuthenticated && isEmailVerified

  const isActive = (to) => location.pathname === to

  const toggleMenu = () => setMenuOpen((prev) => !prev)
  const closeMenu = () => {
    setMenuOpen(false)
    setProfileMenuOpen(false)
    setMobileAccountOpen(false)
  }
  const toggleProfileMenu = () => {
    setProfileMenuOpen((prev) => !prev)
    setResendError(null)
  }
  const closeProfileMenu = () => {
    setProfileMenuOpen(false)
    setMobileAccountOpen(false)
  }
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

  useEffect(() => {
    const closeOnOutsidePointer = (event) => {
      if (
        openDropdown &&
        !featuresDropdownRef.current?.contains(event.target)
      ) {
        setOpenDropdown(null)
      }
      if (
        profileMenuOpen &&
        !profileDropdownRef.current?.contains(event.target)
      ) {
        setProfileMenuOpen(false)
      }
      if (mobileAccountOpen && !mobileAccountRef.current?.contains(event.target)) {
        setMobileAccountOpen(false)
      }
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setOpenDropdown(null)
        setMobileOpenSection(null)
        setMenuOpen(false)
        setProfileMenuOpen(false)
        setMobileAccountOpen(false)
      }
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [openDropdown, profileMenuOpen, mobileAccountOpen])

  useEffect(() => {
    setOpenDropdown(null)
    setMenuOpen(false)
    setMobileOpenSection(null)
    setMobileTravelsOpen(false)
    setProfileMenuOpen(false)
    setMobileAccountOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!platformAuthenticated) {
      setUnreadCount(0)
      return undefined
    }

    let active = true
    let requestSeq = 0

    const refreshUnreadCount = async () => {
      const currentSeq = ++requestSeq
      try {
        const count = await fetchUnreadCount()
        if (active && currentSeq === requestSeq && typeof count === 'number') {
          setUnreadCount(count)
        }
      } catch {
        // Unread badge failure should never disrupt navigation.
      }
    }

    const handleNotificationsUpdated = (event) => {
      const detail = event?.detail
      if (typeof detail?.unreadCount === 'number') {
        requestSeq += 1
        setUnreadCount(Math.max(0, detail.unreadCount))
      } else if (typeof detail?.delta === 'number') {
        requestSeq += 1
        setUnreadCount((count) => Math.max(0, count + detail.delta))
      }
      refreshUnreadCount()
    }

    refreshUnreadCount()
    window.addEventListener('tafera:notifications-updated', handleNotificationsUpdated)
    return () => {
      active = false
      window.removeEventListener('tafera:notifications-updated', handleNotificationsUpdated)
    }
  }, [platformAuthenticated])

  const navLinkItem = (section) => {
    if (section.to) {
      return (
        <Link
          key={section.label}
          to={section.to}
          className={`px-2 py-2 rounded-md font-nav font-medium text-sm text-tafera-text transition-colors hover:text-tafera-accent ${isActive(section.to) ? 'text-tafera-primary' : ''}`}
          aria-current={isActive(section.to) ? 'page' : undefined}
        >
          {section.label}
        </Link>
      )
    }
    return (
      <div
        key={section.label}
        ref={section.label === 'Features' ? featuresDropdownRef : undefined}
        className="relative group"
      >
        <button
          onClick={() => toggleDropdown(section.label)}
          className="flex items-center gap-1 px-4 py-2 rounded-md font-nav font-medium text-base text-tafera-text transition-colors hover:text-tafera-accent"
          aria-haspopup="true"
          aria-expanded={openDropdown === section.label}
          aria-controls={`${section.label.toLowerCase().replaceAll(' ', '-')}-menu`}
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
          <div id={`${section.label.toLowerCase().replaceAll(' ', '-')}-menu`} className="absolute top-full left-0 mt-2 w-56 rounded-md border border-tafera-border bg-tafera-card shadow-card py-3 z-50">
            {section.items.map((item) => (
              <Link
                key={`${item.label}-${item.to}`}
                to={item.to}
                onClick={() => setOpenDropdown(null)}
                className="block px-4 py-2.5 text-sm text-tafera-text transition-colors hover:bg-tafera-surface hover:text-tafera-primary"
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
        <div ref={profileDropdownRef} className="relative inline-flex items-center">
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
              className="fixed right-4 top-14 w-[240px] rounded-md border border-tafera-border bg-tafera-card shadow-card py-2 z-[60] max-h-[calc(100vh-6rem)] overflow-y-auto"
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
          className="text-base font-nav font-medium text-tafera-text hover:text-tafera-primary transition-colors"
        >
          Sign in
        </Link>
        <Link
          to="/register"
          className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-md bg-tafera-accent text-tafera-on-accent font-semibold transition-colors hover:bg-tafera-accent/90"
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
            <div className="mb-3 p-3 rounded-md bg-red-500/10 border border-red-500/30 text-tafera-text text-sm">
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
      type="button"
      onClick={toggleMenu}
      className="lg:hidden inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-tafera-border bg-tafera-card text-tafera-text transition-colors hover:bg-tafera-surface hover:text-tafera-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-tafera-accent"
      aria-expanded={menuOpen}
      aria-controls="tafera-mobile-menu"
      aria-label="Toggle navigation menu"
    >
      {menuOpen ? (
        <svg
          className="h-5 w-5"
          viewBox="0 0 24 24"
          strokeWidth="1.75"
          stroke="currentColor"
          fill="none"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      ) : (
        <svg
          className="h-5 w-5"
          viewBox="0 0 24 24"
          strokeWidth="1.75"
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
      className={`lg:hidden ${
        menuOpen
          ? 'max-h-[calc(100vh-4rem)] overflow-y-auto opacity-100'
          : 'max-h-0 overflow-hidden opacity-0'
      } transition-all duration-300 ease-in-out border-t border-tafera-border mt-0`}
      aria-label="Mobile navigation"
    >
      <div className="app-container py-4 space-y-2">
        {platformAuthenticated ? AUTHENTICATED_NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            onClick={closeMenu}
            aria-current={isActive(item.to) ? 'page' : undefined}
            className="block px-3 py-3 rounded-md text-sm font-nav font-medium text-tafera-text hover:bg-tafera-surface hover:text-tafera-accent"
          >
            {item.label}
          </Link>
        )) : PUBLIC_NAV.map((section) => (
          section.to ? (
            <Link
              key={section.label}
              to={section.to}
              onClick={closeMenu}
              className="block px-3 py-3 rounded-md text-sm font-nav font-medium text-tafera-text transition-colors hover:bg-tafera-surface hover:text-tafera-accent"
            >
              {section.label}
            </Link>
          ) : (
            <div key={section.label}>
              <button
                type="button"
                onClick={() => setMobileOpenSection((current) => current === section.label ? null : section.label)}
                className="flex items-center justify-between w-full px-3 py-3 rounded-md text-sm font-nav font-medium text-tafera-text transition-colors hover:bg-tafera-surface"
                aria-expanded={mobileOpenSection === section.label}
              >
                {section.label}
                <svg
                  className="w-4 h-4 text-tafera-text-muted transition-transform duration-200"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                  fill="none"
                  style={{ transform: mobileOpenSection === section.label ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {mobileOpenSection === section.label && section.items && (
                <div className="ml-4 space-y-1 border-l border-tafera-border pl-4">
                  {section.items.map((item) => (
                    <Link
                      key={`${item.label}-${item.to}`}
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
          )
        ))}
        <div className="pt-4 border-t border-tafera-border space-y-3">
          {isAuthenticated ? renderMobileAuthLinks() : renderMobileGuestLinks()}

          <div className="pt-3 border-t border-tafera-border">
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-tafera-text-muted">
              Appearance
            </p>
            <button
              type="button"
              onClick={toggleTheme}
              aria-pressed={isDark}
              className="flex w-full items-center justify-between rounded-md border border-tafera-border bg-tafera-card px-3 py-2.5 text-sm font-nav font-medium text-tafera-text transition-colors hover:bg-tafera-surface"
            >
              <span>Theme: {isDark ? 'Dark' : 'Light'}</span>
              <span className="text-xs font-medium text-tafera-primary">
                Switch to {isDark ? 'light' : 'dark'}
              </span>
            </button>
          </div>
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
        className="px-3 py-3 rounded-md bg-tafera-accent text-tafera-on-accent font-semibold text-center transition-colors hover:bg-tafera-accent/90 cursor-pointer"
        onClick={() => {
          setMenuOpen(false)
          navigate('/register')
        }}
      >
        Join for Free
      </div>
    </>
  )

  const userInitial = (user?.fullName || user?.email || 'U').slice(0, 1).toUpperCase()

  const renderMobileAuthLinks = () => (
    <div className="space-y-2">
      <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-tafera-text-muted">
        Your Profile
      </p>

      {!isEmailVerified ? (
        <>
          <div className="flex items-center gap-3 rounded-lg border border-tafera-border bg-tafera-surface px-3 py-2.5">
            {user?.profileImage ? (
              <img
                src={user.profileImage}
                alt={user?.fullName || 'Your profile'}
                className="h-9 w-9 shrink-0 rounded-full border border-tafera-border object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-tafera-border bg-tafera-card text-sm font-semibold text-tafera-primary"
              >
                {userInitial}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-tafera-text">
                {user?.fullName || 'Your account'}
              </p>
              {user?.email && (
                <p className="truncate text-xs text-tafera-text-muted">{user.email}</p>
              )}
            </div>
          </div>
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
            type="button"
            onClick={handleResendVerification}
            disabled={resendLoading}
            className="block px-3 py-3 rounded-md text-sm font-nav font-medium text-tafera-text hover:bg-tafera-surface hover:text-tafera-accent transition-colors text-left w-full"
          >
            {resendLoading ? 'Sending...' : 'Resend verification email'}
          </button>
          <button
            key="log-out"
            type="button"
            onClick={handleLogout}
            disabled={logoutLoading}
            className="block px-3 py-3 rounded-md text-sm font-nav font-medium text-tafera-text hover:bg-tafera-surface hover:text-tafera-accent transition-colors text-left w-full"
          >
            {logoutLoading ? 'Signing out...' : 'Log out'}
          </button>
          {resendError && (
            <div className="mb-3 p-3 rounded-md bg-red-500/10 border border-red-500/30 text-tafera-text text-sm">
              {resendError}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-1 rounded-lg border border-tafera-border bg-tafera-surface p-2">
          <Link
            to="/profile"
            onClick={closeMenu}
            className="flex items-center gap-3 rounded-md px-2.5 py-2 transition-colors hover:bg-tafera-card"
          >
            {user?.profileImage ? (
              <img
                src={user.profileImage}
                alt={user?.fullName || 'Your profile'}
                className="h-9 w-9 shrink-0 rounded-full border border-tafera-border object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-tafera-border bg-tafera-card text-sm font-semibold text-tafera-primary"
              >
                {userInitial}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-tafera-text">
                {user?.fullName || 'My Profile'}
              </p>
              <p className="text-xs font-medium text-tafera-primary">My Profile</p>
            </div>
          </Link>

          <div className="border-t border-tafera-border pt-1">
            <button
              type="button"
              onClick={() => setMobileTravelsOpen((open) => !open)}
              aria-expanded={mobileTravelsOpen}
              aria-controls="mobile-drawer-travels"
              className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm font-nav font-medium text-tafera-text transition-colors hover:bg-tafera-card hover:text-tafera-primary"
            >
              <span>My Travels</span>
              <svg
                className="h-4 w-4 text-tafera-text-muted transition-transform duration-200"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
                style={{ transform: mobileTravelsOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {mobileTravelsOpen && (
              <div
                id="mobile-drawer-travels"
                className="ml-3 mb-1 space-y-0.5 border-l border-tafera-border pl-3"
              >
                {MOBILE_TRAVEL_LINKS.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={closeMenu}
                    className="block rounded-md px-3 py-2 text-sm text-tafera-text transition-colors hover:bg-tafera-card hover:text-tafera-primary"
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}

            <Link
              to="/notifications"
              onClick={closeMenu}
              className="flex items-center justify-between rounded-md px-3 py-2.5 text-sm font-nav font-medium text-tafera-text transition-colors hover:bg-tafera-card hover:text-tafera-primary"
            >
              <span>Notifications</span>
              {unreadCount > 0 && (
                <span
                  className="inline-flex min-w-5 items-center justify-center rounded-full bg-tafera-accent px-1.5 py-0.5 text-[10px] font-bold text-tafera-on-accent"
                  aria-label={`${unreadCount} unread notifications`}
                >
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Link>
          </div>

          <div className="border-t border-tafera-border pt-1">
            {PROFILE_MENU_ITEMS.filter((item) => item.to !== '/profile' && item.to !== '/scrapbooks').map((item) =>
              item.to ? (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={closeMenu}
                  className="block rounded-md px-3 py-2.5 text-sm font-nav font-medium text-tafera-text transition-colors hover:bg-tafera-card hover:text-tafera-primary"
                >
                  {item.label}
                </Link>
              ) : (
                <button
                  key={item.label}
                  type="button"
                  onClick={handleLogout}
                  disabled={logoutLoading}
                  className="block w-full rounded-md px-3 py-2.5 text-left text-sm font-nav font-medium text-tafera-text transition-colors hover:bg-tafera-card hover:text-tafera-primary"
                >
                  {logoutLoading ? 'Signing out...' : item.label}
                </button>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  )

  const mobileNotificationsButton = () => (
    <Link
      to="/notifications"
      aria-label={
        unreadCount > 0
          ? `Notifications (${unreadCount} unread)`
          : 'Notifications'
      }
      className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-tafera-border bg-tafera-card text-tafera-text transition-colors hover:bg-tafera-surface hover:text-tafera-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-tafera-accent"
    >
      <svg
        className="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
        />
      </svg>
      {unreadCount > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 inline-flex min-w-[1.125rem] items-center justify-center rounded-full bg-tafera-accent px-1 py-0.5 text-[10px] font-bold leading-none text-tafera-on-accent"
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Link>
  )

  const themeToggleButton = () => (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-tafera-border bg-tafera-card text-tafera-text transition-colors hover:bg-tafera-surface hover:text-tafera-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-tafera-accent lg:h-9 lg:w-9"
    >
      {isDark ? (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
        </svg>
      ) : (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
        </svg>
      )}
    </button>
  )

  return (
      <header
      className={`sticky top-0 z-50 border-b border-tafera-border bg-tafera-bg/95 backdrop-blur-sm transition-colors ${
        scrolled ? 'shadow-sm' : ''
      }`}
    >
      <div className="app-container py-3 sm:py-4">
        {/* Mobile header bar (< 768px only) */}
        <div
          data-testid="mobile-header-bar"
          className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 md:hidden"
        >
          <div className="min-w-0 justify-self-start">
            <Link
              to="/"
              className="flex items-center gap-2 shrink-0"
              aria-label="Tafera — travel platform home"
            >
              <img src="/Tafera logo.svg" alt="Tafera" width="32" height="32" className="h-8 w-8" />
              <span className="font-heading font-bold text-lg tracking-tight text-tafera-text">
                Tafera
              </span>
            </Link>
          </div>

          <div className="justify-self-center">
            {isAuthenticated ? (
              <Link
                to="/profile"
                aria-label="Open profile"
                className="inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-tafera-border bg-tafera-surface text-sm font-semibold text-tafera-primary transition-colors hover:border-tafera-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-tafera-accent"
              >
                {user?.profileImage ? (
                  <img
                    src={user.profileImage}
                    alt={user?.fullName ? `${user.fullName}'s avatar` : 'Profile avatar'}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span aria-hidden="true">{userInitial}</span>
                )}
              </Link>
            ) : (
              <span className="block h-9 w-9" aria-hidden="true" />
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2.5 justify-self-end">
            {platformAuthenticated && mobileNotificationsButton()}
            {mobileMenuButton()}
          </div>
        </div>

        {/* Tablet & Desktop header bar (>= 768px — unchanged) */}
        <div
          data-testid="desktop-header-bar"
          className="hidden md:flex md:items-center md:justify-between md:gap-3 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:gap-4"
        >
          <div className="min-w-0 shrink-0 lg:justify-self-start">
            <Link
              to="/"
              className="flex items-center gap-3 shrink-0"
              aria-label="Tafera — travel platform home"
            >
              <img src="/Tafera logo.svg" alt="Tafera" width="40" height="40" className="h-10 w-10" />
              <span className="font-heading font-bold text-xl tracking-tight text-tafera-text">
                Tafera
              </span>
            </Link>
          </div>

          <nav className="hidden lg:flex justify-self-center items-center gap-1">
          {(platformAuthenticated ? AUTHENTICATED_NAV : PUBLIC_NAV).map((item) =>
            navLinkItem(item)
          )}
          </nav>

          <div className="justify-self-end hidden lg:flex items-center gap-3">
            {themeToggleButton()}
            {desktopAuth()}
          </div>

          <div className="flex shrink-0 items-center gap-2.5 lg:hidden">
            {themeToggleButton()}
            {mobileMenuButton()}
          </div>
        </div>
      </div>

      {mobileDrawer()}
    </header>
  )
}
