import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/common/Button'
import { fetchAdminReports, moderateAdminReport } from '../../services/admin'
import { getErrorMessage } from '../../services/errors'

const inputClass =
  'mt-1 w-full rounded-lg border border-tafera-border bg-tafera-card px-3 py-2 text-sm text-tafera-text placeholder:text-tafera-text-muted focus:border-tafera-primary focus:outline-none focus:ring-2 focus:ring-tafera-primary'

const REASON_LABELS = {
  spam: 'Spam',
  harassment: 'Harassment',
  inappropriate_content: 'Inappropriate content',
  impersonation: 'Impersonation',
  misinformation: 'Misinformation',
  other: 'Other',
}

const formatDate = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export default function AdminModeration() {
  const [reports, setReports] = useState([])
  const [pagination, setPagination] = useState(null)
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState({ status: 'pending', targetType: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  const [selectedReport, setSelectedReport] = useState(null)
  const [resolutionNote, setResolutionNote] = useState('')
  const [busyId, setBusyId] = useState(null)

  const loadReports = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchAdminReports({
        page,
        limit: 15,
        status: filters.status,
        targetType: filters.targetType,
      })
      setReports(result.reports || [])
      setPagination(result.pagination || null)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [page, filters])

  useEffect(() => {
    loadReports()
  }, [loadReports])

  const handleDecision = async (report, { status, action = 'none' }) => {
    setBusyId(report.id)
    setError(null)
    setNotice(null)
    try {
      const updated = await moderateAdminReport(report.id, {
        status,
        action,
        resolutionNote: resolutionNote.trim() || null,
      })
      setReports((current) =>
        current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      )
      setSelectedReport(null)
      setResolutionNote('')
      setNotice(`Report updated to ${updated.status.replace('_', ' ')}.`)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-tafera-primary">
            Content moderation
          </p>
          <h1 className="mt-1 font-heading text-2xl font-bold text-tafera-text sm:text-3xl">
            Moderation Queue
          </h1>
          <p className="mt-1 text-sm text-tafera-text-muted">
            Review reported posts, comments, accounts, and group trips and record decisions.
          </p>
        </div>
        <Link
          to="/admin/destinations"
          className="inline-flex items-center rounded-md border border-tafera-border bg-tafera-card px-3.5 py-2 text-xs font-semibold text-tafera-text transition-colors hover:bg-tafera-surface hover:text-tafera-primary"
        >
          Review destination photos →
        </Link>
      </header>

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-tafera-border bg-tafera-surface p-4 sm:grid-cols-2">
        <label className="text-xs font-semibold text-tafera-text">
          Report status
          <select
            aria-label="Filter reports by status"
            value={filters.status}
            onChange={(e) => {
              setPage(1)
              setFilters((c) => ({ ...c, status: e.target.value }))
            }}
            className={inputClass}
          >
            <option value="" className="bg-tafera-card text-tafera-text">All statuses</option>
            <option value="pending" className="bg-tafera-card text-tafera-text">Pending</option>
            <option value="under_review" className="bg-tafera-card text-tafera-text">Under review</option>
            <option value="resolved" className="bg-tafera-card text-tafera-text">Resolved</option>
            <option value="dismissed" className="bg-tafera-card text-tafera-text">Dismissed</option>
          </select>
        </label>

        <label className="text-xs font-semibold text-tafera-text">
          Target type
          <select
            aria-label="Filter reports by target type"
            value={filters.targetType}
            onChange={(e) => {
              setPage(1)
              setFilters((c) => ({ ...c, targetType: e.target.value }))
            }}
            className={inputClass}
          >
            <option value="" className="bg-tafera-card text-tafera-text">All targets</option>
            <option value="post" className="bg-tafera-card text-tafera-text">Posts</option>
            <option value="comment" className="bg-tafera-card text-tafera-text">Comments</option>
            <option value="user" className="bg-tafera-card text-tafera-text">Accounts</option>
            <option value="trip" className="bg-tafera-card text-tafera-text">Group trips</option>
          </select>
        </label>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3.5 text-sm text-tafera-text">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-lg border border-tafera-primary/30 bg-tafera-card p-3.5 text-sm text-tafera-text">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="space-y-3" aria-label="Loading moderation reports">
          {[1, 2, 3].map((row) => (
            <div key={row} className="h-24 animate-pulse rounded-xl border border-tafera-border bg-tafera-card" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <p className="rounded-xl border border-dashed border-tafera-border bg-tafera-surface px-4 py-12 text-center text-sm text-tafera-text-muted">
          No moderation reports match these filters.
        </p>
      ) : (
        <ul className="space-y-3">
          {reports.map((report) => {
            const isOpen = report.status === 'pending' || report.status === 'under_review'
            return (
              <li
                key={report.id}
                className="rounded-xl border border-tafera-border bg-tafera-card p-4 shadow-soft sm:p-5"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-tafera-lime px-2.5 py-0.5 text-[11px] font-bold uppercase text-tafera-ink">
                        {report.targetType}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${
                          isOpen
                            ? 'bg-tafera-accent text-tafera-on-accent'
                            : 'border border-tafera-border bg-tafera-surface text-tafera-text-muted'
                        }`}
                      >
                        {report.status.replace('_', ' ')}
                      </span>
                      <span className="text-xs font-semibold text-tafera-text">
                        {REASON_LABELS[report.reason] || report.reason}
                      </span>
                    </div>

                    <p className="line-clamp-2 text-sm font-medium text-tafera-text">
                      {report.targetSummary?.label || `Target ${report.targetId}`}
                    </p>
                    {report.targetSummary?.subtitle && (
                      <p className="text-xs text-tafera-text-muted">
                        {report.targetSummary.subtitle}
                      </p>
                    )}
                    {report.description && (
                      <p className="rounded-md border border-tafera-border bg-tafera-surface px-3 py-2 text-xs text-tafera-text-muted">
                        Reporter note: “{report.description}”
                      </p>
                    )}
                    <p className="text-xs text-tafera-text-muted">
                      Reported by {report.reporter?.fullName || 'Anonymous'} · {formatDate(report.createdAt)}
                      {report.resolutionNote ? ` · Resolution: ${report.resolutionNote}` : ''}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    {isOpen ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedReport(report)
                          setResolutionNote(report.resolutionNote || '')
                        }}
                      >
                        Review &amp; act
                      </Button>
                    ) : (
                      <span className="text-xs text-tafera-text-muted">
                        Reviewed {formatDate(report.reviewedAt)}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!pagination.hasPreviousPage}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-xs text-tafera-text-muted">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!pagination.hasNextPage}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      {/* Moderation Decision Modal */}
      {selectedReport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          onClick={() => setSelectedReport(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="moderation-decision-title"
        >
          <div
            className="w-full max-w-lg rounded-xl border border-tafera-border bg-tafera-card p-6 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-tafera-border pb-4">
              <div>
                <h2 id="moderation-decision-title" className="font-heading text-lg font-bold text-tafera-text">
                  Moderation Decision
                </h2>
                <p className="text-xs text-tafera-text-muted">
                  {selectedReport.targetType.toUpperCase()} · {REASON_LABELS[selectedReport.reason] || selectedReport.reason}
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => setSelectedReport(null)}>
                Close
              </Button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="rounded-lg border border-tafera-border bg-tafera-surface p-3.5 text-sm text-tafera-text">
                <p className="font-semibold">Reported target</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-xs text-tafera-text-muted">
                  {selectedReport.targetSummary?.label || selectedReport.targetId}
                </p>
              </div>

              <label className="block text-xs font-semibold text-tafera-text">
                Resolution note (logged to audit trail)
                <textarea
                  rows="3"
                  maxLength="1000"
                  value={resolutionNote}
                  onChange={(e) => setResolutionNote(e.target.value)}
                  placeholder="Document why this report was dismissed, resolved, or enforced."
                  className={inputClass}
                />
              </label>

              <div className="flex flex-wrap gap-2 pt-2">
                {selectedReport.status === 'pending' && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busyId === selectedReport.id}
                    onClick={() =>
                      handleDecision(selectedReport, { status: 'under_review', action: 'none' })
                    }
                  >
                    Mark under review
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busyId === selectedReport.id}
                  onClick={() =>
                    handleDecision(selectedReport, { status: 'dismissed', action: 'none' })
                  }
                >
                  Dismiss report
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="accent"
                  disabled={busyId === selectedReport.id}
                  onClick={() =>
                    handleDecision(selectedReport, { status: 'resolved', action: 'none' })
                  }
                >
                  Resolve only
                </Button>
                {selectedReport.targetType !== 'user' && selectedReport.targetSummary?.exists && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busyId === selectedReport.id}
                    onClick={() =>
                      handleDecision(selectedReport, {
                        status: 'resolved',
                        action: 'remove_content',
                      })
                    }
                  >
                    {selectedReport.targetType === 'trip'
                      ? 'Cancel trip & resolve'
                      : 'Remove content & resolve'}
                  </Button>
                )}
                {selectedReport.targetSummary?.ownerId && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busyId === selectedReport.id}
                    onClick={() =>
                      handleDecision(selectedReport, {
                        status: 'resolved',
                        action: 'suspend_user',
                      })
                    }
                  >
                    Suspend account &amp; resolve
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
