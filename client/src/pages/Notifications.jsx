import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from '../services/notifications'

const notificationTarget = (item) => {
  if (item.referenceType === 'post' && item.referenceId) return `/social?post=${encodeURIComponent(item.referenceId)}`
  if (item.actor?.id) return `/users/${encodeURIComponent(item.actor.id)}`
  return '/notifications'
}

export default function Notifications() {
  const navigate = useNavigate()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  // Notifications are marked read as they are opened. The ref prevents rapid
  // repeat clicks from sending the same PATCH request more than once.
  const markingIds = useRef(new Set())
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await fetchNotifications({ page: 1, limit: 50 })
      if (mountedRef.current) {
        setNotifications(result.notifications || [])
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message || 'Notifications could not be loaded.')
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const markRead = async (item) => {
    if (item.isRead || markingIds.current.has(item.id)) return false

    markingIds.current.add(item.id)
    if (mountedRef.current) setError('')
    try {
      const updated = await markNotificationRead(item.id)
      if (mountedRef.current) {
        setNotifications((current) =>
          current.map((row) =>
            row.id === item.id ? { ...row, ...(updated || {}), isRead: true } : row,
          ),
        )
      }
      window.dispatchEvent(
        new CustomEvent('tafera:notifications-updated', {
          detail: { delta: -1 },
        }),
      )
      return true
    } catch (err) {
      markingIds.current.delete(item.id)
      if (mountedRef.current) {
        setError(err.message || 'This notification could not be marked as read.')
      }
      return false
    }
  }

  const handleOpenNotification = async (event, item) => {
    if (item.isRead) return

    const isModifiedClick =
      event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0

    if (isModifiedClick) {
      void markRead(item)
      return
    }

    event.preventDefault()
    if (markingIds.current.has(item.id)) return

    const target = notificationTarget(item)
    await markRead(item)
    if (mountedRef.current && target !== '/notifications') {
      navigate(target)
    }
  }

  const markAllRead = async () => {
    setBusyId('all')
    setError('')
    try {
      await markAllNotificationsRead()
      if (mountedRef.current) {
        setNotifications((current) => current.map((row) => ({ ...row, isRead: true })))
      }
      window.dispatchEvent(
        new CustomEvent('tafera:notifications-updated', {
          detail: { unreadCount: 0 },
        }),
      )
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message || 'Notifications could not be marked as read.')
      }
    } finally {
      if (mountedRef.current) {
        setBusyId(null)
      }
    }
  }

  const unreadCount = notifications.filter((item) => !item.isRead).length

  return (
    <section className="bg-tafera-bg py-10 sm:py-14">
      <div className="app-container max-w-4xl">
        <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-tafera-primary">Your account</p>
            <h1 className="mt-1 text-3xl font-heading font-bold text-tafera-text">Notifications</h1>
            <p className="mt-2 text-sm text-tafera-text-muted">Updates from your Tafera community.</p>
          </div>
          <button type="button" disabled={!unreadCount || busyId === 'all'} onClick={markAllRead} className="min-h-10 rounded-lg border border-tafera-border bg-white px-4 py-2 text-sm font-semibold text-tafera-text hover:bg-tafera-surface disabled:cursor-not-allowed disabled:opacity-50">
            {busyId === 'all' ? 'Updating…' : 'Mark all as read'}
          </button>
        </div>
        {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {loading ? <p className="py-12 text-center text-sm text-tafera-text-muted">Loading notifications…</p> : notifications.length === 0 ? (
          <p className="rounded-xl border border-dashed border-tafera-border bg-white px-5 py-12 text-center text-sm text-tafera-text-muted">You’re all caught up. New notifications will appear here.</p>
        ) : (
          <ul className="divide-y divide-tafera-border overflow-hidden rounded-xl border border-tafera-border bg-white">
            {notifications.map((item) => (
              <li key={item.id} className={`flex items-start gap-3 p-4 sm:p-5 ${item.isRead ? '' : 'bg-tafera-primary/[0.035]'}`}>
                <span aria-hidden="true" className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${item.isRead ? 'bg-transparent' : 'bg-tafera-accent'}`} />
                <div className="min-w-0 flex-1">
                  <Link
                    to={notificationTarget(item)}
                    onClick={(event) => handleOpenNotification(event, item)}
                    onAuxClick={(event) => {
                      if (event.button === 1 && !item.isRead) void markRead(item)
                    }}
                    className="text-sm font-medium leading-relaxed text-tafera-text hover:text-tafera-primary"
                  >
                    {item.message}
                  </Link>
                  <p className="mt-1 text-xs text-tafera-text-muted">{item.createdAt ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt)) : ''}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
