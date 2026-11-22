import { useCallback, useEffect, useState } from 'react'
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

const statusLabel = (status) => ({
  pending: 'Request pending',
  approved: 'You’re going',
  rejected: 'Request was declined',
  cancelled: 'You left this trip',
}[status] || '')

export default function GroupTravel() {
  const { user, isAuthenticated, isEmailVerified, isLoading: authLoading } = useAuth()
  const [discoverTrips, setDiscoverTrips] = useState([])
  const [myTrips, setMyTrips] = useState([])
  const [participations, setParticipations] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState(null)
  const [actionLoading, setActionLoading] = useState(null)

  const loadGroupTrips = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [publicResult, ownedResult] = await Promise.all([
        fetchPublicTrips({ page: 1, limit: 50 }),
        isAuthenticated ? fetchMyTrips({ page: 1, limit: 50 }) : Promise.resolve({ trips: [] }),
      ])
      const publicGroups = (publicResult.trips || []).filter((trip) => trip.tripType === 'group')
      const ownedGroups = (ownedResult.trips || []).filter((trip) => trip.tripType === 'group')
      setDiscoverTrips(publicGroups)
      setMyTrips(ownedGroups)
      if (isAuthenticated) {
        const entries = await Promise.all(publicGroups
          .filter((trip) => trip.creator?.id !== user?.id)
          .map(async (trip) => {
            try {
              return [trip.id, await fetchMyParticipation(trip.id)]
            } catch {
              return [trip.id, null]
            }
          }))
        setParticipations(Object.fromEntries(entries))
      } else {
        setParticipations({})
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, user?.id])

  useEffect(() => {
    if (!authLoading) loadGroupTrips()
  }, [authLoading, loadGroupTrips])

  const createGroup = async (input) => {
    setSaving(true)
    setError(null)
    try {
      await createTrip({ ...input, tripType: 'group' })
      setShowCreate(false)
      await loadGroupTrips()
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
      await loadGroupTrips()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setActionLoading(null)
    }
  }

  if (authLoading || loading) {
    return <main className="app-container py-12"><div className="h-40 animate-pulse rounded-lg border border-tafera-border bg-tafera-surface" aria-label="Loading group trips" /></main>
  }

  return (
    <main className="app-container py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-tafera-text sm:text-3xl">Group travel</h1>
          <p className="mt-2 text-tafera-text-muted">Discover published group trips or organise one of your own.</p>
        </div>
        {isAuthenticated && isEmailVerified && <Button onClick={() => setShowCreate((value) => !value)}>{showCreate ? 'Close form' : 'Create a group trip'}</Button>}
      </header>

      {!isAuthenticated && <div className="mb-6 rounded-lg border border-tafera-border bg-tafera-surface p-4 text-sm text-tafera-text-muted">Sign in to request a place on a trip. <Link to="/login" className="font-medium text-tafera-primary hover:underline">Sign in</Link></div>}
      {isAuthenticated && !isEmailVerified && <div className="mb-6 rounded-lg border border-tafera-border bg-tafera-surface p-4 text-sm text-tafera-text-muted">Verify your email to create or join group trips. <Link to="/verify-email" className="font-medium text-tafera-primary hover:underline">Verify email</Link></div>}
      {error && <div role="alert" className="mb-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error} <button className="ml-2 font-semibold underline" onClick={loadGroupTrips}>Retry</button></div>}

      {showCreate && isAuthenticated && isEmailVerified && (
        <section className="mb-10 rounded-lg border border-tafera-border bg-tafera-surface p-5 shadow-soft sm:p-6">
          <h2 className="mb-4 font-heading text-lg font-bold text-tafera-text">Organise a group trip</h2>
          <TripForm tripType="group" busy={saving} onSubmit={createGroup} onCancel={() => setShowCreate(false)} />
        </section>
      )}

      {isAuthenticated && (
        <section className="mb-12">
          <h2 className="mb-4 font-heading text-xl font-bold text-tafera-text">Trips you organise</h2>
          {myTrips.length === 0 ? (
            <p className="rounded-lg border border-tafera-border bg-tafera-surface p-5 text-sm text-tafera-text-muted">You haven’t created a group trip yet.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {myTrips.map((trip) => (
                <li key={trip.id} className="rounded-lg border border-tafera-border bg-tafera-surface p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-heading font-bold text-tafera-text"><Link to={`/trips/${trip.id}`} className="hover:text-tafera-primary hover:underline">{trip.title}</Link></h3>
                    <span className="rounded-full bg-tafera-bg px-3 py-1 text-xs capitalize text-tafera-text">{trip.status}</span>
                  </div>
                  <p className="mt-2 text-sm text-tafera-text-muted">{trip.startDate} – {trip.endDate}</p>
                  <Link to={`/trips/${trip.id}`} className="mt-3 inline-block text-sm font-semibold text-tafera-primary hover:underline">Manage itinerary and participants →</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section>
        <h2 className="mb-4 font-heading text-xl font-bold text-tafera-text">Discover group trips</h2>
        {discoverTrips.length === 0 ? (
          <div className="rounded-lg border border-tafera-border bg-tafera-surface px-6 py-12 text-center text-sm text-tafera-text-muted">No published group trips are available right now.</div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {discoverTrips.map((trip) => {
              const ownTrip = trip.creator?.id === user?.id
              const participation = participations[trip.id]
              const activeParticipation = participation && ['pending', 'approved'].includes(participation.status)
              return (
                <li key={trip.id} className="rounded-lg border border-tafera-border bg-tafera-surface p-5 shadow-soft">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-heading text-lg font-bold text-tafera-text"><Link to={`/trips/${trip.id}`} className="hover:text-tafera-primary hover:underline">{trip.title}</Link></h3>
                    <span className="rounded-full bg-tafera-bg px-3 py-1 text-xs capitalize text-tafera-text">{trip.status}</span>
                  </div>
                  <p className="mt-2 text-sm text-tafera-text-muted">{trip.startDate} – {trip.endDate}</p>
                  {trip.description && <p className="mt-3 line-clamp-3 text-sm text-tafera-text-muted">{trip.description}</p>}
                  <p className="mt-3 text-sm text-tafera-text-muted">Organised by {trip.creator?.fullName || 'a Tafera traveller'}</p>
                  <p className="mt-1 text-sm font-medium text-tafera-text">
                    {trip.maxParticipants === null ? 'Unlimited places' : `${trip.spotsRemaining} ${trip.spotsRemaining === 1 ? 'place' : 'places'} remaining`}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <Link to={`/trips/${trip.id}`} className="text-sm font-semibold text-tafera-primary hover:underline">Trip details</Link>
                    {ownTrip ? <span className="text-sm text-tafera-text-muted">Your trip</span> : isAuthenticated && isEmailVerified ? (
                      activeParticipation ? (
                        <>
                          <span className="text-sm text-tafera-text-muted">{statusLabel(participation.status)}</span>
                          <Button size="sm" variant="outline" disabled={actionLoading === trip.id} onClick={() => handleJoinOrLeave(trip)}>{actionLoading === trip.id ? 'Updating...' : 'Leave trip'}</Button>
                        </>
                      ) : (
                        <Button size="sm" disabled={actionLoading === trip.id || trip.spotsRemaining === 0} onClick={() => handleJoinOrLeave(trip)}>{actionLoading === trip.id ? 'Requesting...' : participation ? 'Request again' : 'Request to join'}</Button>
                      )
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <p className="mt-4 text-xs text-tafera-text-muted">Participant names and approval controls are available to trip organisers only.</p>
      </section>
    </main>
  )
}
