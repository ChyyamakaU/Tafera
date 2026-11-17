import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AuthModal from '../components/home/AuthModal'

export default function TripDetail() {
  const { tripId } = useParams()
  const [trip, setTrip] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [participation, setParticipation] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!tripId) return
    checkAuthAndTrip()
  }, [tripId])

  const checkAuthAndTrip = async () => {
    try {
      const authRes = await fetch('/api/auth/me', {
        credentials: 'include',
      })
      if (authRes.ok) {
        const authData = await authRes.json()
        setIsAuthenticated(!!authData?.data?.user)
      }
    } catch {
      // Auth check failure is non-fatal
    }

    try {
      const res = await fetch(`/api/trips/${tripId}`, {
        credentials: 'include',
      })
      if (!res.ok) {
        if (res.status === 404) {
          setError('not_found')
        } else {
          throw new Error(`Request failed: ${res.status}`)
        }
        return
      }
      const data = await res.json()
      if (data && data.trip) {
        setTrip(data.trip)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchParticipation = async () => {
    if (!tripId || !isAuthenticated) return

    try {
      const res = await fetch(`/api/trips/${tripId}/participation`, {
        credentials: 'include',
      })
      if (!res.ok) return
      const data = await res.json()
      setParticipation(data.participation)
    } catch {
      // Participation fetch failure is non-fatal
    }
  }

  useEffect(() => {
    if (tripId && isAuthenticated) {
      fetchParticipation()
    }
  }, [tripId, isAuthenticated])

  const handleJoinTrip = async () => {
    if (!tripId || !isAuthenticated) return

    try {
      const res = await fetch(`/api/trips/${tripId}/join`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.message || 'Join request failed')
      }

      await res.json()
      // Reload trip and participation state
      checkAuthAndTrip()
      fetchParticipation()
    } catch (err) {
      setError(err.message || 'Failed to join trip')
      throw err
    }
  }

  const openModal = () => {
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
  }

  const hasParticipation =
    participation &&
    (participation.status === 'pending' ||
      participation.status === 'approved')

  const participationMessage =
    participation?.status === 'pending'
      ? 'Join request pending. The organiser will review your request.'
      : participation?.status === 'approved'
      ? "You're going on this trip."
      : participation?.status === 'rejected'
      ? 'Your join request was rejected.'
      : participation?.status === 'cancelled'
      ? 'Your join request was cancelled.'
      : null

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4">
        <div className="h-32 rounded-md border border-tafera-border bg-tafera-surface animate-pulse" />
      </div>
    )
  }

  if (error === 'not_found' || !trip) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center">
        <h1 className="text-3xl font-heading font-bold text-tafera-text">
          Trip not found
        </h1>
        <p className="mt-4 text-tafera-text-muted">
          This trip does not exist or is not publicly available.
        </p>
        <Link to="/" className="mt-8 inline-block text-tafera-primary hover:underline font-medium">
          Return to home
        </Link>
      </div>
    )
  }

  const stops = (trip.stops || []).sort(
    (a, b) => (a.stopOrder || 0) - (b.stopOrder || 0)
  )

  return (
    <div className="max-w-2xl mx-auto py-16 px-4 sm:px-6 lg:px-8">
      <Link to="/" className="mb-6 inline-block text-sm text-tafera-accent hover:underline font-medium">
        ← Back to home
      </Link>
      <h1 className="text-3xl font-heading font-bold text-tafera-text sm:text-4xl mb-2">
        {trip.title}
      </h1>
      <p className="mb-2 text-sm text-tafera-text-muted">
        {trip.tripType === 'group' ? 'Group trip' : 'Personal trip'} •
        {trip.startDate} to {trip.endDate}
      </p>
      {trip.description && (
        <p className="mb-6 text-tafera-text-muted leading-relaxed">
          {trip.description}
        </p>
      )}
      <div className="rounded-lg border border-tafera-border bg-tafera-surface p-6 mb-6">
        <h3 className="font-heading font-bold text-lg text-tafera-text mb-4">
          Itinerary
        </h3>
        {stops.length > 0 ? (
          <ul className="space-y-3">
            {stops.map((stop) => (
              <li key={stop.id} className="flex items-start gap-3">
                <span className="text-tafera-primary font-semibold text-sm">
                  {stop.stopOrder}
                </span>
                <div>
                  <p className="text-sm font-semibold text-tafera-text">
                    {stop.destination?.name || 'Unknown destination'}
                  </p>
                  <p className="text-xs text-tafera-text-muted">
                    {stop.arrivalDate} to {stop.departureDate}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-tafera-text-muted">
            No itinerary stops have been added yet.
          </p>
        )}
      </div>
      <div className="flex items-start gap-4 text-sm text-tafera-text-muted">
        <div>
          <p className="font-semibold text-tafera-text">Organiser</p>
          <p>{trip.creator?.fullName || 'Unknown'}</p>
        </div>
        <div>
          <p className="font-semibold text-tafera-text">Spots</p>
          <p>
            {trip.maxParticipants === null
              ? 'Unlimited'
              : `${trip.spotsRemaining ?? trip.maxParticipants} remaining`}
          </p>
        </div>
      </div>
      {!trip.isCreator && trip.tripType === 'group' && (
        <div className="mt-8">
          {hasParticipation ? (
            <p className="text-sm text-tafera-primary font-medium">
              {participationMessage}
            </p>
          ) : isAuthenticated ? (
            <button
              onClick={handleJoinTrip}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-md bg-tafera-accent text-white font-semibold transition-colors hover:bg-tafera-accent/90"
            >
              Request to Join
            </button>
          ) : (
            <button
              onClick={openModal}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-md border border-tafera-border bg-tafera-bg text-tafera-text font-semibold transition-colors hover:bg-tafera-surface"
            >
              Request to Join
            </button>
          )}
          {error && (
            <p className="mt-4 text-sm text-red-700">{error}</p>
          )}
        </div>
      )}
      <AuthModal
        isOpen={modalOpen}
        onClose={closeModal}
        action="join"
        actionLabel="join this trip"
        entityType="trip"
        entityName={trip.title}
      />
    </div>
  )
}
