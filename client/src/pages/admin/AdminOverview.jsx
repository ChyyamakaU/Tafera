import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/common/Button'
import { fetchAdminOverview } from '../../services/admin'
import { getErrorMessage } from '../../services/errors'

const formatTimestamp = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

const ACTION_LABELS = {
  'user.suspend': 'Suspended user account',
  'user.restore': 'Restored user account',
  'user.role_change': 'Changed user role',
  'destination.create': 'Created destination',
  'destination.update': 'Updated destination',
  'destination.publish': 'Published destination',
  'destination.unpublish': 'Unpublished destination',
  'destination.delete': 'Deleted destination',
  'destination_image.delete': 'Removed destination photo',
  'report.under_review': 'Marked report under review',
  'report.resolved': 'Resolved moderation report',
  'report.dismissed': 'Dismissed moderation report',
  'post.delete': 'Removed social post',
  'comment.delete': 'Removed comment',
  'trip.update_status': 'Updated group trip status',
  'trip.delete': 'Deleted group trip',
}

export default function AdminOverview() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadOverview = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchAdminOverview()
      setData(result)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadOverview()
  }, [loadOverview])

  const metrics = data?.metrics || {}
  const recentActivity = data?.recentActivity || []

  const statCards = [
    {
      label: 'Total registered users',
      value: metrics.totalUsers ?? 0,
      sub: `${metrics.suspendedUsers ?? 0} suspended`,
      to: '/admin/users',
    },
    {
      label: 'Verified email accounts',
      value: metrics.verifiedUsers ?? 0,
      sub:
        metrics.totalUsers > 0
          ? `${Math.round(((metrics.verifiedUsers ?? 0) / metrics.totalUsers) * 100)}% of users`
          : 'No users yet',
      to: '/admin/users',
    },
    {
      label: 'Total destinations',
      value: metrics.totalDestinations ?? 0,
      sub: `${metrics.publishedDestinations ?? 0} published · ${metrics.draftDestinations ?? 0} draft`,
      to: '/admin/destinations',
    },
    {
      label: 'Active group trips',
      value: metrics.activeGroupTrips ?? 0,
      sub: `${metrics.totalGroupTrips ?? 0} total group trips`,
      to: '/admin/trips',
    },
    {
      label: 'Total social posts',
      value: metrics.totalPosts ?? 0,
      sub: 'Across traveller feed',
      to: '/admin/moderation',
    },
    {
      label: 'Pending moderation reports',
      value: metrics.pendingReports ?? 0,
      sub: `${metrics.totalReports ?? 0} total reports`,
      to: '/admin/moderation',
      highlight: (metrics.pendingReports ?? 0) > 0,
    },
  ]

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-tafera-primary">
            Dashboard overview
          </p>
          <h1 className="mt-1 font-heading text-2xl font-bold text-tafera-text sm:text-3xl">
            Platform Summary
          </h1>
          <p className="mt-1 text-sm text-tafera-text-muted">
            Live metrics and recent administrative actions across Tafera.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={loadOverview} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh data'}
        </Button>
      </header>

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-tafera-text"
        >
          <span>{error}</span>
          <Button type="button" size="sm" variant="outline" onClick={loadOverview}>
            Retry
          </Button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading dashboard metrics">
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <div
              key={item}
              className="rounded-xl border border-tafera-border bg-tafera-card p-5"
            >
              <div className="h-3.5 w-1/2 animate-pulse rounded bg-tafera-surface" />
              <div className="mt-3 h-8 w-20 animate-pulse rounded bg-tafera-surface" />
              <div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-tafera-surface" />
            </div>
          ))}
        </div>
      ) : (
        <section aria-label="Key platform metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {statCards.map((card) => (
            <Link
              key={card.label}
              to={card.to}
              className="group rounded-xl border border-tafera-border bg-tafera-card p-5 shadow-soft transition-colors hover:border-tafera-primary"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-tafera-text-muted">
                  {card.label}
                </p>
                {card.highlight && (
                  <span className="rounded-full bg-tafera-lime px-2 py-0.5 text-[10px] font-bold text-tafera-ink">
                    Action needed
                  </span>
                )}
              </div>
              <p className="mt-2 font-heading text-3xl font-extrabold text-tafera-text group-hover:text-tafera-primary">
                {card.value}
              </p>
              <p className="mt-1.5 text-xs text-tafera-text-muted">{card.sub}</p>
            </Link>
          ))}
        </section>
      )}

      <section
        aria-label="Recent administrative activity"
        className="rounded-xl border border-tafera-border bg-tafera-surface p-5 sm:p-6"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-heading text-lg font-bold text-tafera-text">
              Recent Admin Activity
            </h2>
            <p className="text-xs text-tafera-text-muted">
              Audit trail of account, destination, moderation, and trip actions.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((row) => (
              <div
                key={row}
                className="h-14 animate-pulse rounded-lg border border-tafera-border bg-tafera-card"
              />
            ))}
          </div>
        ) : recentActivity.length === 0 ? (
          <p className="rounded-lg border border-dashed border-tafera-border bg-tafera-card px-4 py-8 text-center text-sm text-tafera-text-muted">
            No administrative actions have been recorded yet.
          </p>
        ) : (
          <ul className="divide-y divide-tafera-border overflow-hidden rounded-lg border border-tafera-border bg-tafera-card">
            {recentActivity.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-col gap-1 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-tafera-text">
                    {ACTION_LABELS[entry.action] || entry.action}
                  </p>
                  <p className="text-xs text-tafera-text-muted">
                    By {entry.admin?.fullName || 'Admin'} · Target: {entry.targetType}
                    {entry.reason ? ` — “${entry.reason}”` : ''}
                  </p>
                </div>
                <time className="shrink-0 text-xs text-tafera-text-muted">
                  {formatTimestamp(entry.timestamp || entry.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
