import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { fetchUnreadCount } from '../../services/notifications'

const travelLinks = [
  { label: 'My Trips', to: '/trips' },
  { label: 'Scrapbooks', to: '/scrapbooks' },
  { label: 'My Destinations', to: '/my-destinations' },
  { label: 'My Group Trips', to: '/group-travel' },
]

const itemClass = ({ isActive }) =>
  `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-tafera-card text-tafera-primary'
      : 'text-tafera-text hover:bg-tafera-card hover:text-tafera-primary'
  }`

export default function TravelNavigation() {
  const { isEmailVerified } = useAuth()
  const location = useLocation()
  const [expanded, setExpanded] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!isEmailVerified) {
      setUnreadCount(0)
      return undefined
    }

    let active = true
    let requestSeq = 0

    const refreshUnreadCount = async () => {
      const currentSeq = ++requestSeq
      try {
        const count = await fetchUnreadCount()
        if (active && currentSeq === requestSeq) {
          setUnreadCount(count)
        }
      } catch {
        // A failed count should never block navigation.
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
  }, [isEmailVerified])

  const travelActive = travelLinks.some((item) => location.pathname === item.to)

  return (
    <nav aria-label="Travel shortcuts" className="space-y-1">
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        aria-controls="feed-travel-submenu"
        className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors ${
          travelActive
            ? 'text-tafera-primary'
            : 'text-tafera-text hover:bg-tafera-card hover:text-tafera-primary'
        }`}
      >
        <span>My Travels</span>
        <svg
          className="h-4 w-4 text-tafera-text-muted transition-transform duration-200"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div
          id="feed-travel-submenu"
          className="ml-3 space-y-0.5 border-l border-tafera-border pl-3"
        >
          {travelLinks.map((item) => (
            <NavLink key={item.to} to={item.to} className={itemClass}>
              {item.label}
            </NavLink>
          ))}
        </div>
      )}

      <NavLink to="/notifications" className={itemClass}>
        <span className="flex items-center justify-between gap-2">
          <span>Notifications</span>
          {unreadCount > 0 && (
            <span
              className="inline-flex min-w-5 items-center justify-center rounded-full bg-tafera-accent px-1.5 py-0.5 text-[10px] font-bold text-tafera-on-accent"
              aria-label={`${unreadCount} unread notifications`}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </span>
      </NavLink>
    </nav>
  )
}
