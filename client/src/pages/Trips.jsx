import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/common/Button'
import TripForm from '../components/trips/TripForm'
import { useAuth } from '../contexts/AuthContext'
import { createTrip, fetchMyTrips } from '../services/trips'
import { getErrorMessage } from '../services/errors'

const dateRange = (trip) => `${trip.startDate} – ${trip.endDate}`

export default function Trips() {
  const { isAuthenticated, isEmailVerified, isLoading: authLoading } = useAuth()
  const [trips, setTrips] = useState([])
  const [pagination, setPagination] = useState(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState(null)

  const loadTrips = useCallback(async (requestedPage = 1, append = false) => {
    if (!isAuthenticated) {
      setTrips([])
      setLoading(false)
      return
    }
    if (append) setLoadingMore(true)
    else setLoading(true)
    setError(null)
    try {
      const result = await fetchMyTrips({ page: requestedPage, limit: 20 })
      const personalTrips = (result.trips || []).filter((trip) => trip.tripType === 'personal')
      setTrips((current) => append ? [...current, ...personalTrips] : personalTrips)
      setPagination(result.pagination)
      setPage(requestedPage)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (!authLoading) loadTrips()
  }, [authLoading, loadTrips])

  const submitTrip = async (input) => {
    setSaving(true)
    setError(null)
    try {
      const trip = await createTrip({ ...input, tripType: 'personal' })
      setTrips((current) => [trip, ...current])
      setShowCreate(false)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (authLoading || loading) {
    return <main className="app-container py-12"><div className="h-36 animate-pulse rounded-lg border border-tafera-border bg-tafera-surface" aria-label="Loading trips" /></main>
  }

  return (
    <main className="app-container py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-tafera-text sm:text-3xl">My trips</h1>
          <p className="mt-2 text-tafera-text-muted">Plan personal journeys and manage their itineraries.</p>
        </div>
        {isAuthenticated && isEmailVerified && <Button onClick={() => setShowCreate((value) => !value)}>{showCreate ? 'Close form' : 'Create personal trip'}</Button>}
      </header>

      {!isAuthenticated && (
        <div className="rounded-lg border border-tafera-border bg-tafera-surface p-6">
          <p className="text-tafera-text">Sign in to view and manage your trips.</p>
          <Link to="/login" className="mt-4 inline-block"><Button>Sign in</Button></Link>
        </div>
      )}
      {isAuthenticated && !isEmailVerified && (
        <p className="mb-6 rounded-lg border border-tafera-border bg-tafera-surface p-4 text-sm text-tafera-text-muted">
          Verify your email to create or change trips. <Link className="font-medium text-tafera-primary hover:underline" to="/verify-email">Verify email</Link>
        </p>
      )}
      {error && <div role="alert" className="mb-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {showCreate && isAuthenticated && (
        <section className="mb-8 rounded-lg border border-tafera-border bg-tafera-surface p-5 shadow-soft sm:p-6">
          <h2 className="mb-4 font-heading text-lg font-bold text-tafera-text">Create personal trip</h2>
          <TripForm tripType="personal" busy={saving} onSubmit={submitTrip} onCancel={() => setShowCreate(false)} />
        </section>
      )}

      {isAuthenticated && !error && trips.length === 0 ? (
        <div className="rounded-lg border border-tafera-border bg-tafera-surface px-6 py-12 text-center">
          <h2 className="font-heading text-lg font-bold text-tafera-text">No personal trips yet</h2>
          <p className="mt-2 text-sm text-tafera-text-muted">Create a trip to start planning your next journey.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {trips.map((trip) => (
            <article key={trip.id} className="rounded-lg border border-tafera-border bg-tafera-surface p-5 shadow-soft sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="font-heading text-lg font-bold text-tafera-text">
                    <Link className="hover:text-tafera-primary hover:underline" to={`/trips/${trip.id}`}>{trip.title}</Link>
                  </h2>
                  <p className="mt-1 text-sm text-tafera-text-muted">{dateRange(trip)}</p>
                  {trip.description && <p className="mt-3 text-sm text-tafera-text-muted">{trip.description}</p>}
                </div>
                <span className="rounded-full bg-tafera-bg px-3 py-1 text-xs font-medium capitalize text-tafera-text">{trip.status}</span>
              </div>
              <Link to={`/trips/${trip.id}`} className="mt-4 inline-block text-sm font-semibold text-tafera-primary hover:underline">View itinerary and manage trip →</Link>
            </article>
          ))}
        </div>
      )}
      {isAuthenticated && pagination?.hasNextPage && (
        <div className="mt-6 flex justify-center"><Button variant="outline" disabled={loadingMore} onClick={() => loadTrips(page + 1, true)}>{loadingMore ? 'Loading...' : 'Load more trips'}</Button></div>
      )}
    </main>
  )
}
