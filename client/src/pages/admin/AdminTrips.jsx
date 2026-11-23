import { useCallback, useEffect, useState } from 'react'
import { Button } from '../../components/common/Button'
import {
  deleteAdminGroupTrip,
  fetchAdminGroupTripDetail,
  fetchAdminGroupTrips,
  updateAdminGroupTripStatus,
} from '../../services/admin'
import { getErrorMessage } from '../../services/errors'

const inputClass =
  'mt-1 w-full rounded-lg border border-tafera-border bg-tafera-card px-3 py-2 text-sm text-tafera-text placeholder:text-tafera-text-muted focus:border-tafera-primary focus:outline-none focus:ring-2 focus:ring-tafera-primary'

export default function AdminTrips() {
  const [trips, setTrips] = useState([])
  const [pagination, setPagination] = useState(null)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [filters, setFilters] = useState({ search: '', status: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  const [selectedTrip, setSelectedTrip] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [actionReason, setActionReason] = useState('')
  const [busyId, setBusyId] = useState(null)

  const loadTrips = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchAdminGroupTrips({
        page,
        limit: 15,
        search: filters.search,
        status: filters.status,
      })
      setTrips(result.trips || [])
      setPagination(result.pagination || null)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [page, filters])

  useEffect(() => {
    loadTrips()
  }, [loadTrips])

  const openDetail = async (tripRow) => {
    setSelectedTrip(tripRow)
    setActionReason('')
    setDetailLoading(true)
    try {
      const detail = await fetchAdminGroupTripDetail(tripRow.id)
      setSelectedTrip(detail)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setDetailLoading(false)
    }
  }

  const handleStatusChange = async (trip, nextStatus) => {
    setBusyId(trip.id)
    setError(null)
    setNotice(null)
    try {
      const updated = await updateAdminGroupTripStatus(trip.id, {
        status: nextStatus,
        reason: actionReason.trim() || null,
      })
      setTrips((current) =>
        current.map((item) => (item.id === updated.id ? { ...item, status: updated.status } : item)),
      )
      setSelectedTrip((current) =>
        current?.id === updated.id ? { ...current, status: updated.status } : current,
      )
      setActionReason('')
      setNotice(`Updated “${trip.title}” status to ${nextStatus}.`)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const handleDeleteTrip = async (trip) => {
    if (!window.confirm(`Permanently remove group trip “${trip.title}”?`)) return
    setBusyId(trip.id)
    setError(null)
    setNotice(null)
    try {
      await deleteAdminGroupTrip(trip.id, actionReason.trim() || null)
      setTrips((current) => current.filter((item) => item.id !== trip.id))
      setSelectedTrip(null)
      setActionReason('')
      setNotice(`Deleted group trip “${trip.title}”.`)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-tafera-primary">
          Group trip management
        </p>
        <h1 className="mt-1 font-heading text-2xl font-bold text-tafera-text sm:text-3xl">
          Group Trips
        </h1>
        <p className="mt-1 text-sm text-tafera-text-muted">
          Inspect group trips, organisers, participant rosters, and moderate reported itineraries.
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          setPage(1)
          setFilters((c) => ({ ...c, search: searchInput.trim() }))
        }}
        className="grid grid-cols-1 gap-3 rounded-xl border border-tafera-border bg-tafera-surface p-4 sm:grid-cols-[1.5fr_0.8fr_auto] sm:items-end"
      >
        <label className="text-xs font-semibold text-tafera-text">
          Search group trips
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Trip title or description"
            className={inputClass}
          />
        </label>
        <label className="text-xs font-semibold text-tafera-text">
          Status
          <select
            aria-label="Filter group trips by status"
            value={filters.status}
            onChange={(e) => {
              setPage(1)
              setFilters((c) => ({ ...c, status: e.target.value }))
            }}
            className={inputClass}
          >
            <option value="" className="bg-tafera-card text-tafera-text">All statuses</option>
            <option value="published" className="bg-tafera-card text-tafera-text">Published</option>
            <option value="draft" className="bg-tafera-card text-tafera-text">Draft</option>
            <option value="cancelled" className="bg-tafera-card text-tafera-text">Cancelled</option>
            <option value="completed" className="bg-tafera-card text-tafera-text">Completed</option>
          </select>
        </label>
        <Button type="submit">Search</Button>
      </form>

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

      <div className="overflow-x-auto rounded-xl border border-tafera-border bg-tafera-card shadow-soft">
        {loading ? (
          <div className="space-y-2 p-5" aria-label="Loading group trips">
            {[1, 2, 3].map((row) => (
              <div key={row} className="h-14 animate-pulse rounded bg-tafera-surface" />
            ))}
          </div>
        ) : trips.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-tafera-text-muted">
            No group trips match the current filters.
          </p>
        ) : (
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-tafera-border bg-tafera-surface text-xs uppercase tracking-wider text-tafera-text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Trip</th>
                <th className="px-4 py-3 font-semibold">Organiser</th>
                <th className="px-4 py-3 font-semibold">Participants</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tafera-border">
              {trips.map((trip) => (
                <tr key={trip.id} className="hover:bg-tafera-surface/60">
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-tafera-text">{trip.title}</span>
                      {trip.openReportsCount > 0 && (
                        <span className="rounded-full bg-tafera-lime px-2 py-0.5 text-[10px] font-bold text-tafera-ink">
                          {trip.openReportsCount} report{trip.openReportsCount === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-tafera-text-muted">
                      {trip.startDate} – {trip.endDate}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <p className="font-medium text-tafera-text">
                      {trip.creator?.fullName || 'Unknown'}
                    </p>
                    <p className="text-tafera-text-muted">{trip.creator?.email || ''}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-tafera-text-muted">
                    {trip.participantCount ?? 0}
                    {trip.maxParticipants ? ` / ${trip.maxParticipants}` : ''} approved
                    {trip.pendingParticipantCount > 0
                      ? ` · ${trip.pendingParticipantCount} pending`
                      : ''}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 font-semibold capitalize ${
                        trip.status === 'published'
                          ? 'bg-tafera-accent text-tafera-on-accent'
                          : 'border border-tafera-border bg-tafera-surface text-tafera-text-muted'
                      }`}
                    >
                      {trip.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button type="button" size="sm" variant="outline" onClick={() => openDetail(trip)}>
                      Inspect
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

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

      {/* Group Trip Detail & Moderation Modal */}
      {selectedTrip && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          onClick={() => setSelectedTrip(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-trip-modal-title"
        >
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-tafera-border bg-tafera-card shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-tafera-border px-5 py-4">
              <div>
                <h2 id="admin-trip-modal-title" className="font-heading text-lg font-bold text-tafera-text">
                  {selectedTrip.title}
                </h2>
                <p className="text-xs text-tafera-text-muted">
                  {selectedTrip.startDate} – {selectedTrip.endDate} · Status:{' '}
                  <span className="font-semibold capitalize text-tafera-text">{selectedTrip.status}</span>
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => setSelectedTrip(null)}>
                Close
              </Button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {selectedTrip.description && (
                <p className="text-sm text-tafera-text-muted">{selectedTrip.description}</p>
              )}

              <div className="rounded-lg border border-tafera-border bg-tafera-surface p-3.5 text-xs">
                <p className="font-semibold text-tafera-text">Organiser</p>
                <p className="mt-1 text-tafera-text-muted">
                  {selectedTrip.creator?.fullName || 'Unknown'} · {selectedTrip.creator?.email || 'No email'} · Account:{' '}
                  <span className="capitalize">{selectedTrip.creator?.status || 'active'}</span>
                </p>
              </div>

              {detailLoading ? (
                <div className="h-24 animate-pulse rounded-lg bg-tafera-surface" />
              ) : (
                <>
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-tafera-text-muted">
                      Participants ({selectedTrip.participants?.length || 0})
                    </h3>
                    {!selectedTrip.participants?.length ? (
                      <p className="rounded-lg border border-dashed border-tafera-border bg-tafera-surface p-3 text-xs text-tafera-text-muted">
                        No participants registered for this trip.
                      </p>
                    ) : (
                      <ul className="divide-y divide-tafera-border rounded-lg border border-tafera-border bg-tafera-surface">
                        {selectedTrip.participants.map((p) => (
                          <li key={p.id} className="flex items-center justify-between px-3.5 py-2.5 text-xs">
                            <div>
                              <p className="font-semibold text-tafera-text">{p.user?.fullName || 'Traveller'}</p>
                              <p className="text-tafera-text-muted">{p.user?.email || ''}</p>
                            </div>
                            <span className="rounded-full border border-tafera-border bg-tafera-card px-2 py-0.5 font-semibold capitalize text-tafera-text">
                              {p.status}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {selectedTrip.reports?.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-tafera-text-muted">
                        Associated Reports ({selectedTrip.reports.length})
                      </h3>
                      <ul className="space-y-2">
                        {selectedTrip.reports.map((rep) => (
                          <li
                            key={rep.id}
                            className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-tafera-text"
                          >
                            <span className="font-semibold capitalize">{rep.reason}</span> ·{' '}
                            <span className="capitalize">{rep.status.replace('_', ' ')}</span>
                            {rep.description ? ` — “${rep.description}”` : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}

              <label className="block text-xs font-semibold text-tafera-text">
                Moderation reason (optional, saved to audit log)
                <input
                  type="text"
                  maxLength="500"
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="Reason for unpublishing, cancelling, or removing this trip"
                  className={inputClass}
                />
              </label>

              <div className="flex flex-wrap gap-2 pt-1">
                {selectedTrip.status !== 'published' && (
                  <Button
                    type="button"
                    size="sm"
                    variant="accent"
                    disabled={busyId === selectedTrip.id}
                    onClick={() => handleStatusChange(selectedTrip, 'published')}
                  >
                    Publish trip
                  </Button>
                )}
                {selectedTrip.status === 'published' && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busyId === selectedTrip.id}
                    onClick={() => handleStatusChange(selectedTrip, 'draft')}
                  >
                    Unpublish to draft
                  </Button>
                )}
                {selectedTrip.status !== 'cancelled' && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busyId === selectedTrip.id}
                    onClick={() => handleStatusChange(selectedTrip, 'cancelled')}
                  >
                    Cancel trip
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busyId === selectedTrip.id}
                  onClick={() => handleDeleteTrip(selectedTrip)}
                >
                  Delete trip
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
