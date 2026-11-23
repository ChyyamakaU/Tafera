import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/common/Button'
import TripForm from '../components/trips/TripForm'
import { useAuth } from '../contexts/AuthContext'
import {
  createTrip,
  fetchMyParticipation,
  fetchMyTrips,
  fetchPublicTrips,
  leaveTrip,
  requestToJoinTrip,
} from '../services/trips'
import { getErrorMessage } from '../services/errors'

const DISCOVER_PAGE_SIZE = 12

const statusLabel = (status) => ({
  pending: 'Request pending',
  approved: 'You’re going',
  rejected: 'Request was declined',
  cancelled: 'You left this trip',
}[status] || '')

const buildPageItems = (currentPage, totalPages) => {
  if (!totalPages || totalPages <= 1) return []
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const pages = [1]
  const start = Math.max(2, currentPage - 1)
  const end = Math.min(totalPages - 1, currentPage + 1)

  if (start > 2) pages.push('ellipsis-start')
  for (let page = start; page <= end; page += 1) pages.push(page)
  if (end < totalPages - 1) pages.push('ellipsis-end')
  pages.push(totalPages)

  return pages
}

function TripCardSkeleton({ count = 4, label = 'Loading group trips' }) {
  return (
    <div
      className="grid grid-cols-1 gap-4 md:grid-cols-2"
      aria-label={label}
      aria-busy="true"
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="rounded-lg border border-tafera-border bg-tafera-surface p-5 shadow-soft"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="h-5 w-2/3 animate-pulse rounded bg-tafera-border/70" />
            <div className="h-6 w-20 animate-pulse rounded-full bg-tafera-border/70" />
          </div>
          <div className="mt-3 h-4 w-1/2 animate-pulse rounded bg-tafera-border/60" />
          <div className="mt-4 space-y-2">
            <div className="h-3.5 w-full animate-pulse rounded bg-tafera-border/50" />
            <div className="h-3.5 w-4/5 animate-pulse rounded bg-tafera-border/50" />
          </div>
          <div className="mt-5 flex items-center gap-3">
            <div className="h-4 w-24 animate-pulse rounded bg-tafera-border/60" />
            <div className="h-8 w-28 animate-pulse rounded-md bg-tafera-border/70" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function GroupTravel() {
  const { user, isAuthenticated, isEmailVerified, isLoading: authLoading } = useAuth()
  const [discoverTrips, setDiscoverTrips] = useState([])
  const [discoverPagination, setDiscoverPagination] = useState(null)
  const [discoverPage, setDiscoverPage] = useState(1)
  const [discoverLoading, setDiscoverLoading] = useState(true)
  const [discoverError, setDiscoverError] = useState(null)

  const [myTrips, setMyTrips] = useState([])
  const [myTripsLoading, setMyTripsLoading] = useState(false)
  const [participations, setParticipations] = useState({})

  const [saving, setSaving] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)

  const discoverSectionRef = useRef(null)
  const discoverRequestId = useRef(0)
  const canUseMemberTrips = isAuthenticated && isEmailVerified

  const loadMyGroupTrips = useCallback(async () => {
    if (!canUseMemberTrips) {
      setMyTrips([])
      setMyTripsLoading(false)
      return
    }
    setMyTripsLoading(true)
    try {
      const ownedResult = await fetchMyTrips({ page: 1, limit: 50 })
      const ownedGroups = (ownedResult.trips || []).filter((trip) => trip.tripType === 'group')
      setMyTrips(ownedGroups)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setMyTripsLoading(false)
    }
  }, [canUseMemberTrips])

  const loadDiscoverTrips = useCallback(async (requestedPage = 1) => {
    const requestId = ++discoverRequestId.current
    setDiscoverLoading(true)
    setDiscoverError(null)
    try {
      const publicResult = await fetchPublicTrips({
        page: requestedPage,
        limit: DISCOVER_PAGE_SIZE,
      })
      if (requestId !== discoverRequestId.current) return

      const publicGroups = (publicResult.trips || []).filter((trip) => trip.tripType === 'group')
      setDiscoverTrips(publicGroups)
      setDiscoverPagination(publicResult.pagination || null)

      if (canUseMemberTrips) {
        const entries = await Promise.all(
          publicGroups
            .filter((trip) => trip.creator?.id !== user?.id)
            .map(async (trip) => {
              try {
                return [trip.id, await fetchMyParticipation(trip.id)]
              } catch {
                return [trip.id, null]
              }
            }),
        )
        if (requestId !== discoverRequestId.current) return
        setParticipations((existing) => ({
          ...existing,
          ...Object.fromEntries(entries),
        }))
      } else {
        setParticipations({})
      }
    } catch (err) {
      if (requestId !== discoverRequestId.current) return
      setDiscoverError(getErrorMessage(err))
    } finally {
      if (requestId === discoverRequestId.current) {
        setDiscoverLoading(false)
      }
    }
  }, [canUseMemberTrips, user?.id])

  useEffect(() => {
    if (!authLoading) loadMyGroupTrips()
  }, [authLoading, loadMyGroupTrips])

  useEffect(() => {
    if (!authLoading) loadDiscoverTrips(discoverPage)
  }, [authLoading, discoverPage, loadDiscoverTrips])

  const handlePageChange = (nextPage) => {
    const maxPage = discoverPagination?.totalPages
    const clampedPage = maxPage
      ? Math.min(Math.max(nextPage, 1), maxPage)
      : Math.max(nextPage, 1)

    if (clampedPage === discoverPage) return
    setDiscoverPage(clampedPage)
    if (typeof discoverSectionRef.current?.scrollIntoView === 'function') {
      discoverSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const createGroup = async (input) => {
    setSaving(true)
    setError(null)
    try {
      await createTrip({ ...input, tripType: 'group' })
      setShowCreate(false)
      await loadMyGroupTrips()
      if (discoverPage === 1) {
        await loadDiscoverTrips(1)
      } else {
        setDiscoverPage(1)
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const handleJoinOrLeave = async (trip) => {
    const current = participations[trip.id]
    setActionLoading(trip.id)
    setError(null)
    try {
      const next = current && ['pending', 'approved'].includes(current.status)
        ? await leaveTrip(trip.id)
        : await requestToJoinTrip(trip.id)
      setParticipations((existing) => ({ ...existing, [trip.id]: next }))
      await loadDiscoverTrips(discoverPage)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setActionLoading(null)
    }
  }

  const currentPage = discoverPagination?.page ?? discoverPage
  const totalPages = discoverPagination?.totalPages ?? null
  const hasPreviousPage = Boolean(discoverPagination?.hasPreviousPage ?? currentPage > 1)
  const hasNextPage = Boolean(discoverPagination?.hasNextPage)
  const showPagination = Boolean(
    discoverPagination && (totalPages > 1 || hasPreviousPage || hasNextPage),
  )
  const pageItems = buildPageItems(currentPage, totalPages)

  if (authLoading) {
    return (
      <main className="app-container py-12">
        <TripCardSkeleton count={4} label="Loading group trips" />
      </main>
    )
  }

  return (
    <main className="app-container py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-tafera-text sm:text-3xl">Group travel</h1>
          <p className="mt-2 text-tafera-text-muted">Discover published group trips or organise one of your own.</p>
        </div>
        {canUseMemberTrips && (
          <Button onClick={() => setShowCreate((value) => !value)}>
            {showCreate ? 'Close form' : 'Create a group trip'}
          </Button>
        )}
      </header>

      {!isAuthenticated && (
        <div className="mb-6 rounded-lg border border-tafera-border bg-tafera-surface p-4 text-sm text-tafera-text-muted">
          Sign in to request a place on a trip.{' '}
          <Link to="/login" className="font-medium text-tafera-primary hover:underline">Sign in</Link>
        </div>
      )}
      {isAuthenticated && !isEmailVerified && (
        <div className="mb-6 rounded-lg border border-tafera-border bg-tafera-surface p-4 text-sm text-tafera-text-muted">
          Verify your email to create or join group trips.{' '}
          <Link to="/verify-email" className="font-medium text-tafera-primary hover:underline">Verify email</Link>
        </div>
      )}
      {error && (
        <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-tafera-text">
          <span>{error}</span>
          <button
            type="button"
            className="font-semibold text-tafera-primary underline"
            onClick={() => {
              loadMyGroupTrips()
              loadDiscoverTrips(discoverPage)
            }}
          >
            Retry
          </button>
        </div>
      )}

      {showCreate && canUseMemberTrips && (
        <section className="mb-10 rounded-lg border border-tafera-border bg-tafera-surface p-5 shadow-soft sm:p-6">
          <h2 className="mb-4 font-heading text-lg font-bold text-tafera-text">Organise a group trip</h2>
          <TripForm tripType="group" busy={saving} onSubmit={createGroup} onCancel={() => setShowCreate(false)} />
        </section>
      )}

      {canUseMemberTrips && (
        <section className="mb-12">
          <h2 className="mb-4 font-heading text-xl font-bold text-tafera-text">Trips you organise</h2>
          {myTripsLoading ? (
            <TripCardSkeleton count={2} label="Loading trips you organise" />
          ) : myTrips.length === 0 ? (
            <p className="rounded-lg border border-tafera-border bg-tafera-surface p-5 text-sm text-tafera-text-muted">
              You haven’t created a group trip yet.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {myTrips.map((trip) => (
                <li key={trip.id} className="rounded-lg border border-tafera-border bg-tafera-surface p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-heading font-bold text-tafera-text">
                      <Link to={`/trips/${trip.id}`} className="hover:text-tafera-primary hover:underline">
                        {trip.title}
                      </Link>
                    </h3>
                    <span className="rounded-full border border-tafera-border bg-tafera-bg px-3 py-1 text-xs capitalize text-tafera-text">
                      {trip.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-tafera-text-muted">{trip.startDate} – {trip.endDate}</p>
                  <Link
                    to={`/trips/${trip.id}`}
                    className="mt-3 inline-block text-sm font-semibold text-tafera-primary hover:underline"
                  >
                    Manage itinerary and participants →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section ref={discoverSectionRef} className="scroll-mt-24">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-heading text-xl font-bold text-tafera-text">Discover group trips</h2>
          {showPagination && (
            <p className="text-sm text-tafera-text-muted">
              {totalPages ? `Page ${currentPage} of ${totalPages}` : `Page ${currentPage}`}
            </p>
          )}
        </div>

        {discoverError && (
          <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-tafera-text">
            <span>{discoverError}</span>
            <button
              type="button"
              className="font-semibold text-tafera-primary underline"
              onClick={() => loadDiscoverTrips(discoverPage)}
            >
              Retry
            </button>
          </div>
        )}

        {discoverLoading ? (
          <TripCardSkeleton count={4} label="Loading group trips" />
        ) : discoverTrips.length === 0 ? (
          <div className="rounded-lg border border-dashed border-tafera-border bg-tafera-surface px-6 py-12 text-center">
            <p className="text-sm font-medium text-tafera-text">
              {showPagination
                ? 'No published group trips appear on this page.'
                : 'No published group trips are available right now.'}
            </p>
            <p className="mt-1 text-xs text-tafera-text-muted">
              {showPagination
                ? 'Use the pagination controls below to browse other pages.'
                : canUseMemberTrips
                  ? 'Start the community off by organising a group trip above.'
                  : 'Check back soon as travellers publish upcoming journeys.'}
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {discoverTrips.map((trip) => {
              const ownTrip = trip.creator?.id === user?.id
              const participation = participations[trip.id]
              const activeParticipation = participation && ['pending', 'approved'].includes(participation.status)
              return (
                <li key={trip.id} className="rounded-lg border border-tafera-border bg-tafera-surface p-5 shadow-soft">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-heading text-lg font-bold text-tafera-text">
                      <Link to={`/trips/${trip.id}`} className="hover:text-tafera-primary hover:underline">
                        {trip.title}
                      </Link>
                    </h3>
                    <span className="rounded-full border border-tafera-border bg-tafera-bg px-3 py-1 text-xs capitalize text-tafera-text">
                      {trip.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-tafera-text-muted">{trip.startDate} – {trip.endDate}</p>
                  {trip.description && <p className="mt-3 line-clamp-3 text-sm text-tafera-text-muted">{trip.description}</p>}
                  <p className="mt-3 text-sm text-tafera-text-muted">Organised by {trip.creator?.fullName || 'a Tafera traveller'}</p>
                  <p className="mt-1 text-sm font-medium text-tafera-text">
                    {trip.maxParticipants === null ? 'Unlimited places' : `${trip.spotsRemaining} ${trip.spotsRemaining === 1 ? 'place' : 'places'} remaining`}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Link to={`/trips/${trip.id}`} className="text-sm font-semibold text-tafera-primary hover:underline">Trip details</Link>
                    {ownTrip ? <span className="text-sm text-tafera-text-muted">Your trip</span> : canUseMemberTrips ? (
                      activeParticipation ? (
                        <>
                          <span className="text-sm text-tafera-text-muted">{statusLabel(participation.status)}</span>
                          <Button size="sm" variant="outline" disabled={actionLoading === trip.id} onClick={() => handleJoinOrLeave(trip)}>
                            {actionLoading === trip.id ? 'Updating...' : 'Leave trip'}
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" disabled={actionLoading === trip.id || trip.spotsRemaining === 0} onClick={() => handleJoinOrLeave(trip)}>
                          {actionLoading === trip.id ? 'Requesting...' : participation ? 'Request again' : 'Request to join'}
                        </Button>
                      )
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {showPagination && (
          <nav
            aria-label="Discover group trips pagination"
            className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-tafera-border pt-6"
          >
            <Button
              variant="outline"
              size="sm"
              disabled={discoverLoading || !hasPreviousPage}
              onClick={() => handlePageChange(currentPage - 1)}
            >
              Previous
            </Button>

            {pageItems.length > 0 ? (
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {pageItems.map((item) =>
                  typeof item === 'string' ? (
                    <span
                      key={item}
                      aria-hidden="true"
                      className="px-2 text-sm text-tafera-text-muted"
                    >
                      …
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      aria-label={`Page ${item}`}
                      aria-current={item === currentPage ? 'page' : undefined}
                      disabled={discoverLoading}
                      onClick={() => handlePageChange(item)}
                      className={`min-h-8 min-w-8 rounded-md border px-2.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-tafera-primary disabled:pointer-events-none disabled:opacity-50 ${
                        item === currentPage
                          ? 'border-tafera-primary bg-tafera-surface text-tafera-primary'
                          : 'border-tafera-border bg-tafera-bg text-tafera-text hover:bg-tafera-surface hover:text-tafera-primary'
                      }`}
                    >
                      {item}
                    </button>
                  ),
                )}
              </div>
            ) : (
              <span className="text-sm text-tafera-text-muted">Page {currentPage}</span>
            )}

            <Button
              variant="outline"
              size="sm"
              disabled={discoverLoading || !hasNextPage}
              onClick={() => handlePageChange(currentPage + 1)}
            >
              Next
            </Button>
          </nav>
        )}

        <p className="mt-4 text-xs text-tafera-text-muted">
          Participant names and approval controls are available to trip organisers only.
        </p>
      </section>
    </main>
  )
}
