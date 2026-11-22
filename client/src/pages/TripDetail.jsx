import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../components/common/Button'
import TripForm from '../components/trips/TripForm'
import { useAuth } from '../contexts/AuthContext'
import { setPendingAction } from '../services/auth'
import { fetchDestinations } from '../services/destinations'
import { NIGERIAN_STATES } from '../constants/nigeriaStates'
import { getErrorMessage } from '../services/errors'
import {
  addTripStop,
  deleteTrip,
  deleteTripStop,
  fetchMyParticipation,
  fetchTrip,
  fetchTripParticipants,
  leaveTrip,
  moderateTripParticipant,
  reorderTripStops,
  requestToJoinTrip,
  updateTrip,
  updateTripStop,
} from '../services/trips'

const fieldClass = 'w-full rounded-lg border border-tafera-border px-3 py-2 focus:border-tafera-primary focus:outline-none focus:ring-2 focus:ring-tafera-primary'

function StopEditor({ tripId, stop, canManage, onUpdated, onError }) {
  const [editing, setEditing] = useState(false)
  const [arrivalDate, setArrivalDate] = useState(stop.arrivalDate || '')
  const [departureDate, setDepartureDate] = useState(stop.departureDate || '')
  const [busy, setBusy] = useState(false)

  const save = async (event) => {
    event.preventDefault()
    setBusy(true)
    try {
      onUpdated(await updateTripStop(tripId, stop.id, { arrivalDate, departureDate }))
      setEditing(false)
    } catch (err) {
      onError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="rounded-md border border-tafera-border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className="font-semibold text-tafera-primary">{stop.stopOrder}.</span>
          <div>
            <p className="font-semibold text-tafera-text">{stop.destination?.name || 'Destination'}</p>
            <p className="text-sm text-tafera-text-muted">{stop.destination?.location || stop.destination?.country || ''}</p>
            <p className="mt-1 text-xs text-tafera-text-muted">{stop.arrivalDate || 'Arrival not set'} – {stop.departureDate || 'Departure not set'}</p>
          </div>
        </div>
        {canManage && <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" disabled={busy || stop.stopOrder === 1} aria-label={`Move ${stop.destination?.name} earlier`} onClick={() => onUpdated({ reorder: stop.id, direction: -1 })}>↑</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing((value) => !value)}>{editing ? 'Cancel' : 'Edit dates'}</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onUpdated({ remove: stop.id })}>Remove</Button>
        </div>}
      </div>
      {editing && <form className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={save}>
        <label className="text-xs text-tafera-text-muted">Arrival<input aria-label={`Arrival date in ${stop.destination?.name}`} className={fieldClass} type="date" min={tripId ? undefined : undefined} value={arrivalDate} onChange={(event) => setArrivalDate(event.target.value)} /></label>
        <label className="text-xs text-tafera-text-muted">Departure<input aria-label={`Departure date in ${stop.destination?.name}`} className={fieldClass} type="date" value={departureDate} onChange={(event) => setDepartureDate(event.target.value)} /></label>
        <Button className="self-end" size="sm" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save dates'}</Button>
      </form>}
    </li>
  )
}

export default function TripDetail() {
  const { tripId } = useParams()
  const navigate = useNavigate()
  const { user, isAuthenticated, isEmailVerified, isLoading: authLoading } = useAuth()
  const [trip, setTrip] = useState(null)
  const [participation, setParticipation] = useState(null)
  const [participants, setParticipants] = useState([])
  const [destinations, setDestinations] = useState([])
  const [selectedDestination, setSelectedDestination] = useState('')
  const [selectedState, setSelectedState] = useState('')
  const [arrivalDate, setArrivalDate] = useState('')
  const [departureDate, setDepartureDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(false)
  const [showAddStop, setShowAddStop] = useState(false)

  const loadTrip = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const currentTrip = await fetchTrip(tripId)
      setTrip(currentTrip)
      if (isAuthenticated && currentTrip.tripType === 'group') {
        if (currentTrip.isCreator) {
          const result = await fetchTripParticipants(tripId, { limit: 50 })
          setParticipants(result.participants || [])
        } else {
          setParticipation(await fetchMyParticipation(tripId))
        }
      } else {
        setParticipation(null)
        setParticipants([])
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [tripId, isAuthenticated])

  useEffect(() => {
    if (!authLoading && tripId) loadTrip()
  }, [authLoading, tripId, loadTrip])

  const applyTrip = (updated) => {
    if (updated?.stops) setTrip(updated)
    else if (updated?.id) setTrip(updated)
  }

  const saveTrip = async (input) => {
    setBusy(true)
    setError(null)
    try {
      setTrip(await updateTrip(trip.id, input))
      setEditing(false)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const removeTrip = async () => {
    if (!window.confirm('Delete this trip and its itinerary?')) return
    setBusy(true)
    try {
      await deleteTrip(trip.id)
      navigate(trip.tripType === 'group' ? '/group-travel' : '/trips')
    } catch (err) {
      setError(getErrorMessage(err))
      setBusy(false)
    }
  }

  const loadDestinations = async (state) => {
    if (!state) {
      setSelectedState('')
      setDestinations([])
      setSelectedDestination('')
      setShowAddStop(true)
      return
    }
    if (state === selectedState && destinations.length) {
      setShowAddStop(true)
      return
    }
    setBusy(true)
    setError(null)
    setSelectedState(state)
    setDestinations([])
    setSelectedDestination('')
    try {
      const result = await fetchDestinations({ country: 'Nigeria', state, page: 1, limit: 50 })
      setDestinations(result.destinations || [])
      setShowAddStop(true)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const saveStop = async (event) => {
    event.preventDefault()
    if (!selectedDestination) return
    setBusy(true)
    setError(null)
    try {
      setTrip(await addTripStop(trip.id, {
        destinationId: selectedDestination,
        arrivalDate: arrivalDate || null,
        departureDate: departureDate || null,
      }))
      setSelectedDestination('')
      setArrivalDate('')
      setDepartureDate('')
      setShowAddStop(false)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const changeStop = async (operation) => {
    setBusy(true)
    setError(null)
    try {
      if (operation.remove) {
        setTrip(await deleteTripStop(trip.id, operation.remove))
      } else {
        const ordered = [...(trip.stops || [])].sort((a, b) => a.stopOrder - b.stopOrder)
        const index = ordered.findIndex((stop) => stop.id === operation.reorder)
        const target = index + operation.direction
        if (target < 0 || target >= ordered.length) return
        ;[ordered[index], ordered[target]] = [ordered[target], ordered[index]]
        setTrip(await reorderTripStops(trip.id, ordered.map((stop) => stop.id)))
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const joinOrLeave = async () => {
    if (!isAuthenticated) {
      setPendingAction({ action: 'join_trip', entityType: 'trip', entityName: trip.title }, `/trips/${trip.id}`)
      navigate('/login')
      return
    }
    if (!isEmailVerified) {
      setPendingAction({ action: 'join_trip', entityType: 'trip', entityName: trip.title }, `/trips/${trip.id}`)
      navigate('/verify-email')
      return
    }
    setBusy(true)
    try {
      const result = participation && ['pending', 'approved'].includes(participation.status)
        ? await leaveTrip(trip.id)
        : await requestToJoinTrip(trip.id)
      setParticipation(result)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const moderate = async (participantId, status) => {
    setBusy(true)
    try {
      const result = await moderateTripParticipant(trip.id, participantId, status)
      setParticipants((current) => current.map((participant) => participant.id === result.id ? result : participant))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (authLoading || loading) return <main className="app-container py-12"><div className="h-40 animate-pulse rounded-lg border border-tafera-border bg-tafera-surface" aria-label="Loading trip" /></main>
  if (!trip) return <main className="app-container py-16 text-center"><h1 className="font-heading text-2xl font-bold text-tafera-text">Trip unavailable</h1><p role="alert" className="mt-3 text-sm text-tafera-text-muted">{error || 'This trip does not exist or is not visible to you.'}</p><Link to="/trips" className="mt-5 inline-block text-tafera-primary hover:underline">Back to trips</Link></main>

  const canManage = trip.isCreator && isAuthenticated && isEmailVerified
  const stops = [...(trip.stops || [])].sort((a, b) => a.stopOrder - b.stopOrder)
  const activeParticipation = participation && ['pending', 'approved'].includes(participation.status)

  return (
    <main className="app-container py-10">
      <Link to={trip.tripType === 'group' ? '/group-travel' : '/trips'} className="mb-5 inline-block text-sm font-medium text-tafera-primary hover:underline">← Back to {trip.tripType === 'group' ? 'group travel' : 'my trips'}</Link>
      {error && <div role="alert" className="mb-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <header className="mb-7 rounded-lg border border-tafera-border bg-tafera-surface p-5 shadow-soft sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-tafera-primary">{trip.tripType} trip · {trip.status}</span>
            <h1 className="mt-2 font-heading text-2xl font-bold text-tafera-text sm:text-3xl">{trip.title}</h1>
            <p className="mt-2 text-sm text-tafera-text-muted">{trip.startDate} – {trip.endDate}</p>
          </div>
          {canManage && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setEditing((value) => !value)}>{editing ? 'Cancel edit' : 'Edit trip'}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={removeTrip}>Delete</Button></div>}
        </div>
        {!editing && trip.description && <p className="mt-4 whitespace-pre-wrap text-tafera-text-muted">{trip.description}</p>}
        {editing && <div className="mt-5 border-t border-tafera-border pt-5"><TripForm key={`${trip.id}-${trip.updatedAt}`} initialValues={trip} tripType={trip.tripType} submitLabel="Save trip" busy={busy} onSubmit={saveTrip} onCancel={() => setEditing(false)} /></div>}
      </header>

      {trip.tripType === 'group' && (
        <section className="mb-6 rounded-lg border border-tafera-border bg-tafera-surface p-5">
          <h2 className="font-heading text-lg font-bold text-tafera-text">Group participation</h2>
          <p className="mt-2 text-sm text-tafera-text-muted">Capacity: {trip.maxParticipants === null ? 'Unlimited' : `${trip.maxParticipants} participants maximum`}</p>
          {!trip.isCreator && <div className="mt-4 flex flex-wrap items-center gap-3">
            {participation && <span className="text-sm text-tafera-text-muted">{participation.status === 'pending' ? 'Your request is pending.' : participation.status === 'approved' ? 'Your place is confirmed.' : participation.status === 'rejected' ? 'Your previous request was declined.' : 'You previously left this trip.'}</span>}
            <Button size="sm" disabled={busy || (trip.status !== 'published' && !activeParticipation)} onClick={joinOrLeave}>
              {busy ? 'Updating...' : activeParticipation ? 'Leave trip' : participation ? 'Request again' : 'Request to join'}
            </Button>
            {!isAuthenticated && <Link to="/login" className="text-sm text-tafera-primary hover:underline">Sign in to join</Link>}
            {isAuthenticated && !isEmailVerified && <Link to="/verify-email" className="text-sm text-tafera-primary hover:underline">Verify your email to join</Link>}
          </div>}
        </section>
      )}

      <section className="rounded-lg border border-tafera-border bg-tafera-surface p-5 shadow-soft sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-heading text-xl font-bold text-tafera-text">Itinerary</h2><p className="mt-1 text-sm text-tafera-text-muted">{stops.length} {stops.length === 1 ? 'stop' : 'stops'}</p></div>
          {canManage && <Button size="sm" onClick={() => loadDestinations('')} disabled={busy}>{showAddStop ? 'Close stop form' : 'Add a stop'}</Button>}
        </div>
        {showAddStop && <form onSubmit={saveStop} className="mb-5 grid grid-cols-1 gap-3 rounded-md border border-tafera-border bg-white p-4 sm:grid-cols-2">
          <label className="text-sm text-tafera-text-muted sm:col-span-2">Nigerian state or territory<select aria-label="Nigerian state or territory" className={fieldClass} value={selectedState} onChange={(event) => loadDestinations(event.target.value)} required><option value="">Select a state or territory</option>{NIGERIAN_STATES.map((state) => <option key={state} value={state}>{state}</option>)}</select></label>
          {selectedState && <label className="text-sm text-tafera-text-muted sm:col-span-2">Published destination in {selectedState}<select aria-label={`Published destination in ${selectedState}`} className={fieldClass} value={selectedDestination} onChange={(event) => setSelectedDestination(event.target.value)} required disabled={busy || destinations.length === 0}><option value="">{busy ? 'Loading destinations...' : destinations.length === 0 ? 'No published destinations in this state yet' : 'Select a destination'}</option>{destinations.map((destination) => <option key={destination.id} value={destination.id}>{destination.name}</option>)}</select>{!busy && destinations.length === 0 && <span className="mt-1 block text-xs text-tafera-text-muted">Only destinations already published in Tafera can be added as itinerary stops.</span>}</label>}
          <label className="text-sm text-tafera-text-muted">Arrival date<input className={fieldClass} type="date" min={trip.startDate} max={trip.endDate} value={arrivalDate} onChange={(event) => setArrivalDate(event.target.value)} /></label>
          <label className="text-sm text-tafera-text-muted">Departure date<input className={fieldClass} type="date" min={arrivalDate || trip.startDate} max={trip.endDate} value={departureDate} onChange={(event) => setDepartureDate(event.target.value)} /></label>
          <div className="sm:col-span-2"><Button type="submit" disabled={busy || !selectedDestination}>{busy ? 'Adding...' : 'Add to itinerary'}</Button></div>
        </form>}
        {stops.length === 0 ? <p className="rounded-md bg-white p-4 text-sm text-tafera-text-muted">No stops have been added yet.</p> : <ol className="space-y-3">{stops.map((stop) => <StopEditor key={stop.id} tripId={trip.id} stop={stop} canManage={canManage && !busy} onUpdated={(result) => result?.reorder || result?.remove ? changeStop(result) : applyTrip(result)} onError={setError} />)}</ol>}
      </section>

      {trip.tripType === 'group' && trip.isCreator && (
        <section className="mt-6 rounded-lg border border-tafera-border bg-tafera-surface p-5 shadow-soft sm:p-6">
          <h2 className="mb-4 font-heading text-xl font-bold text-tafera-text">Participants</h2>
          {participants.length === 0 ? <p className="text-sm text-tafera-text-muted">No one has requested to join yet.</p> : <ul className="space-y-3">{participants.map((participant) => <li key={participant.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-white p-3"><div><p className="font-medium text-tafera-text">{participant.user?.fullName || 'Traveller'}</p><p className="text-xs capitalize text-tafera-text-muted">{participant.status}</p></div>{canManage && participant.status === 'pending' && <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => moderate(participant.id, 'approved')}>Approve</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => moderate(participant.id, 'rejected')}>Decline</Button></div>}</li>)}</ul>}
        </section>
      )}
    </main>
  )
}
