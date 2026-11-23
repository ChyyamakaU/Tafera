import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../common/Button'
import { getFollowers, getFollowing, unfollowUser } from '../../services/users'
import { getErrorMessage } from '../../services/errors'

const MODAL_TABS = [
  { key: 'followers', label: 'Followers', empty: 'No followers yet.' },
  { key: 'following', label: 'Following', empty: 'Not following anyone yet.' },
]

function formatFollowedDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString()
}

export default function FollowConnectionsModal({
  isOpen,
  type = 'followers',
  userId,
  profileName = 'Traveller',
  canUnfollow = false,
  onClose,
  onTypeChange,
  onFollowingChanged,
}) {
  const [items, setItems] = useState([])
  const [pagination, setPagination] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [unfollowingId, setUnfollowingId] = useState(null)
  const requestVersionRef = useRef(0)

  const activeConfig =
    MODAL_TABS.find((tab) => tab.key === type) || MODAL_TABS[0]

  const loadList = useCallback(
    async ({ page = 1, append = false } = {}) => {
      if (!userId) return
      const version = ++requestVersionRef.current
      setError(null)
      if (append) {
        setLoadingMore(true)
      } else {
        setLoading(true)
      }

      try {
        const data =
          type === 'following'
            ? await getFollowing(userId, { page, limit: 20 })
            : await getFollowers(userId, { page, limit: 20 })

        if (requestVersionRef.current !== version) return

        const incoming =
          type === 'following' ? data?.following || [] : data?.followers || []

        setItems((current) =>
          append
            ? [
                ...current,
                ...incoming.filter(
                  (row) => !current.some((prev) => prev.user?.id === row.user?.id),
                ),
              ]
            : incoming,
        )
        setPagination(data?.pagination || null)
      } catch (err) {
        if (requestVersionRef.current !== version) return
        setError(getErrorMessage(err))
      } finally {
        if (requestVersionRef.current === version) {
          setLoading(false)
          setLoadingMore(false)
        }
      }
    },
    [type, userId],
  )

  useEffect(() => {
    if (!isOpen || !userId) return undefined
    setActionError(null)
    setItems([])
    setPagination(null)
    loadList({ page: 1, append: false })
    return undefined
  }, [isOpen, type, userId, loadList])

  useEffect(() => {
    if (!isOpen) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleUnfollow = async (targetUser) => {
    if (!targetUser?.id || unfollowingId) return
    setUnfollowingId(targetUser.id)
    setActionError(null)
    try {
      await unfollowUser(targetUser.id)
      setItems((current) => current.filter((row) => row.user?.id !== targetUser.id))
      setPagination((current) =>
        current
          ? { ...current, total: Math.max(0, (current.total ?? 1) - 1) }
          : current,
      )
      onFollowingChanged?.(-1, targetUser.id)
    } catch (err) {
      if (err?.code === 'FOLLOW_NOT_FOUND' || err?.status === 404) {
        setItems((current) => current.filter((row) => row.user?.id !== targetUser.id))
        onFollowingChanged?.(-1, targetUser.id)
      } else {
        setActionError(getErrorMessage(err))
      }
    } finally {
      setUnfollowingId(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="follow-connections-modal-title"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-tafera-border bg-tafera-card shadow-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-tafera-border px-5 py-4">
          <div className="min-w-0">
            <h2
              id="follow-connections-modal-title"
              className="truncate font-heading text-lg font-bold text-tafera-text"
            >
              {activeConfig.label}
            </h2>
            <p className="truncate text-xs text-tafera-text-muted">{profileName}</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>

        <div
          role="tablist"
          aria-label="Connections list"
          className="flex border-b border-tafera-border bg-tafera-surface px-4"
        >
          {MODAL_TABS.map((tab) => {
            const isSelected = tab.key === type
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => onTypeChange?.(tab.key)}
                className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                  isSelected
                    ? 'border-tafera-primary text-tafera-primary'
                    : 'border-transparent text-tafera-text-muted hover:text-tafera-text'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {actionError && (
            <p
              role="alert"
              className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-tafera-text"
            >
              {actionError}
            </p>
          )}

          {loading ? (
            <div className="space-y-3" aria-label={`Loading ${activeConfig.label.toLowerCase()}`}>
              {[1, 2, 3].map((row) => (
                <div
                  key={row}
                  className="flex items-center gap-3 rounded-lg border border-tafera-border bg-tafera-surface p-3"
                >
                  <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-tafera-border/60" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-1/3 animate-pulse rounded bg-tafera-border/60" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-tafera-border/60" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div
              role="alert"
              className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-center text-sm text-tafera-text"
            >
              <p>{error}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => loadList({ page: 1, append: false })}
              >
                Retry
              </Button>
            </div>
          ) : items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-tafera-border bg-tafera-surface px-4 py-10 text-center text-sm text-tafera-text-muted">
              {activeConfig.empty}
            </p>
          ) : (
            <>
              <ul className="divide-y divide-tafera-border">
                {items.map((item) => {
                  const person = item.user
                  if (!person) return null
                  const followedDate = formatFollowedDate(item.followedAt)
                  return (
                    <li
                      key={person.id}
                      className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <Link
                        to={`/users/${person.id}`}
                        onClick={onClose}
                        className="group flex min-w-0 flex-1 items-center gap-3"
                      >
                        {person.profileImage ? (
                          <img
                            src={person.profileImage}
                            alt={`${person.fullName}'s profile picture`}
                            className="h-10 w-10 shrink-0 rounded-full border border-tafera-border object-cover"
                          />
                        ) : (
                          <span
                            aria-hidden="true"
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-tafera-border bg-tafera-surface text-sm font-bold text-tafera-primary"
                          >
                            {(person.fullName || 'T').slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-tafera-text group-hover:text-tafera-primary">
                            {person.fullName}
                          </p>
                          {person.username ? (
                            <p className="truncate text-xs text-tafera-text-muted">
                              @{person.username}
                            </p>
                          ) : followedDate ? (
                            <p className="truncate text-xs text-tafera-text-muted">
                              followed {followedDate}
                            </p>
                          ) : null}
                          {person.bio && (
                            <p className="mt-0.5 line-clamp-1 text-xs text-tafera-text-muted">
                              {person.bio}
                            </p>
                          )}
                        </div>
                      </Link>

                      {canUnfollow && type === 'following' && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={unfollowingId === person.id}
                          onClick={() => handleUnfollow(person)}
                        >
                          {unfollowingId === person.id ? 'Unfollowing…' : 'Unfollow'}
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>

              {pagination?.hasNextPage && (
                <div className="mt-4 flex justify-center">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={loadingMore}
                    onClick={() =>
                      loadList({ page: (pagination.page || 1) + 1, append: true })
                    }
                  >
                    {loadingMore ? 'Loading…' : `Load more ${activeConfig.label.toLowerCase()}`}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
