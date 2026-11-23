import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../components/common/Button'
import TripForm from '../components/trips/TripForm'
import { useAuth } from '../contexts/AuthContext'
import { setPendingAction } from '../services/auth'
import { fetchDestinations } from '../services/destinations'
import { NIGERIAN_STATES } from '../constants/nigeriaStates'
import { getErrorMessage } from '../services/errors'
import {
  addTripActivity,
  addTripStop,
  deleteTrip,
  deleteTripActivity,
  deleteTripStop,
  fetchMyParticipation,
  fetchTrip,
  fetchTripParticipants,
  leaveTrip,
  moderateTripParticipant,
  reorderTripStops,
  requestToJoinTrip,
  updateTrip,
  updateTripActivity,
  updateTripStop,
} from '../services/trips'

const fieldClass =
  'w-full rounded-lg border border-tafera-border bg-tafera-bg px-3 py-2 text-tafera-text focus:border-tafera-primary focus:outline-none focus:ring-2 focus:ring-tafera-primary'

const formatActivityDay = (dateStr, tripStartDate) => {
  if (!dateStr) return 'Unscheduled'
  const parsed = new Date(`${dateStr}T00:00:00Z`)
  const formatted = Number.isNaN(parsed.getTime())
    ? dateStr
    : new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(parsed)

  if (tripStartDate) {
    const start = new Date(`${tripStartDate}T00:00:00Z`)
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(parsed.getTime())) {
      const dayNumber = Math.round((parsed.getTime() - start.getTime()) / 86_400_000) + 1
      if (dayNumber >= 1) {
        return `Day ${dayNumber} · ${formatted}`
      }
    }
  }

  return formatted
}

const formatTimeRange = (startTime, endTime) => {
  if (startTime && endTime) return `${startTime} – ${endTime}`
  if (startTime) return startTime
  if (endTime) return `Until ${endTime}`
  return 'Anytime'
}

const validateActivityForm = (values, trip) => {
  if (!values.title.trim()) return 'Activity title is required.'
  if (!values.activityDate) return 'Activity date is required.'
  if (
    trip?.startDate &&
    trip?.endDate &&
    (values.activityDate < trip.startDate || values.activityDate > trip.endDate)
  ) {
    return `Activity date must be between ${trip.startDate} and ${trip.endDate}.`
  }
  if (values.startTime && values.endTime && values.endTime <= values.startTime) {
    return 'End time must be later than the start time.'
  }
  return null
}

function ActivityForm({
  trip,
  stops,
  initialValues,
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}) {
  const [title, setTitle] = useState(initialValues?.title || '')
  const [activityDate, setActivityDate] = useState(
    initialValues?.activityDate || trip.startDate || '',
  )
  const [startTime, setStartTime] = useState(initialValues?.startTime || '')
  const [endTime, setEndTime] = useState(initialValues?.endTime || '')
  const [location, setLocation] = useState(initialValues?.location || '')
  const [tripDestinationId, setTripDestinationId] = useState(
    initialValues?.tripDestinationId || '',
  )
  const [description, setDescription] = useState(initialValues?.description || '')
  const [validationError, setValidationError] = useState(null)

  const handleSubmit = async (event) => {
    event.preventDefault()
    const payload = {
      title: title.trim(),
      activityDate,
      startTime: startTime || null,
      endTime: endTime || null,
      location: location.trim() || null,
      tripDestinationId: tripDestinationId || null,
      description: description.trim() || null,
    }
    const issue = validateActivityForm(payload, trip)
    if (issue) {
      setValidationError(issue)
      return
    }
    setValidationError(null)
    await onSubmit(payload)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid grid-cols-1 gap-3 rounded-md border border-tafera-border bg-tafera-bg p-4 sm:grid-cols-2"
    >
      {validationError && (
        <div
          role="alert"
          className="rounded-md border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-tafera-text sm:col-span-2"
        >
          {validationError}
        </div>
      )}

      <label className="text-sm text-tafera-text-muted sm:col-span-2">
        Activity title
        <input
          className={`${fieldClass} mt-1`}
          type="text"
          maxLength="150"
          placeholder="Sunrise boat ride, museum visit…"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
      </label>

      <label className="text-sm text-tafera-text-muted">
        Activity date
        <input
          className={`${fieldClass} mt-1`}
          type="date"
          min={trip.startDate}
          max={trip.endDate}
          value={activityDate}
          onChange={(event) => setActivityDate(event.target.value)}
          required
        />
      </label>

      <label className="text-sm text-tafera-text-muted">
        Linked stop (optional)
        <select
          aria-label="Linked stop"
          className={`${fieldClass} mt-1`}
          value={tripDestinationId}
          onChange={(event) => setTripDestinationId(event.target.value)}
        >
          <option value="">None</option>
          {stops.map((stop) => (
            <option key={stop.id} value={stop.id}>
              {stop.stopOrder}. {stop.destination?.name || 'Stop'}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm text-tafera-text-muted">
        Start time (optional)
        <input
          className={`${fieldClass} mt-1`}
          type="time"
          value={startTime}
          onChange={(event) => setStartTime(event.target.value)}
        />
      </label>

      <label className="text-sm text-tafera-text-muted">
        End time (optional)
        <input
          className={`${fieldClass} mt-1`}
          type="time"
          value={endTime}
          onChange={(event) => setEndTime(event.target.value)}
        />
      </label>

      <label className="text-sm text-tafera-text-muted sm:col-span-2">
        Location (optional)
        <input
          className={`${fieldClass} mt-1`}
          type="text"
          maxLength="200"
          placeholder="Meeting point, neighbourhood, or venue"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
        />
      </label>

      <label className="text-sm text-tafera-text-muted sm:col-span-2">
        Notes (optional)
        <textarea
          className={`${fieldClass} mt-1`}
          rows="2"
          maxLength="2000"
          placeholder="Booking details, packing reminders, or tips"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>

      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Saving...' : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}

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
    <li className="rounded-md border border-tafera-border bg-tafera-bg p-4">
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
        <label className="text-xs text-tafera-text-muted">Arrival<input aria-label={`Arrival date in ${stop.destination?.name}`} className={fieldClass} type="date" value={arrivalDate} onChange={(event) => setArrivalDate(event.target.value)} /></label>
        <label className="text-xs text-tafera-text-muted">Departure<input aria-label={`Departure date in ${stop.destination?.name}`} className={fieldClass} type="date" value={departureDate} onChange={(event) => setDepartureDate(event.target.value)} /></label>
        <Button className="self-end" size="sm" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save dates'}</Button>
      </form>}
    </li>
  )
}

function TripDetailSkeleton() {
  return (
    <main className="app-container space-y-6 py-10" aria-label="Loading trip" aria-busy="true">
      <div className="rounded-lg border border-tafera-border bg-tafera-surface p-6">
        <div className="h-3.5 w-28 animate-pulse rounded bg-tafera-border/60" />
        <div className="mt-3 h-7 w-1/2 animate-pulse rounded bg-tafera-border/70" />
        <div className="mt-3 h-4 w-40 animate-pulse rounded bg-tafera-border/50" />
      </div>
      <div className="rounded-lg border border-tafera-border bg-tafera-surface p-6 space-y-3">
        <div className="h-5 w-32 animate-pulse rounded bg-tafera-border/70" />
        <div className="h-20 animate-pulse rounded-md bg-tafera-border/50" />
        <div className="h-20 animate-pulse rounded-md bg-tafera-border/50" />
      </div>
    </main>
  )
}

export default function TripDetail() {
  const { tripId } = useParams()
  const navigate = useNavigate()
  const { isAuthenticated, isEmailVerified, isLoading: authLoading } = useAuth()
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
  const [showAddActivity, setShowAddActivity] = useState(false)
  const [editingActivityId, setEditingActivityId] = useState(null)
  const [activityBusy, setActivityBusy] = useState(false)

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
    if (updated?.stops || updated?.id) setTrip(updated)
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

  const handleAddActivity = async (input) => {
    setActivityBusy(true)
    setError(null)
    try {
      const updated = await addTripActivity(trip.id, input)
      setTrip(updated)
      setShowAddActivity(false)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setActivityBusy(false)
    }
  }

  const handleUpdateActivity = async (activityId, input) => {
    setActivityBusy(true)
    setError(null)
    try {
      const updated = await updateTripActivity(trip.id, activityId, input)
      setTrip(updated)
      setEditingActivityId(null)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setActivityBusy(false)
    }
  }

  const handleDeleteActivity = async (activity) => {
    const previousActivities = trip.activities || []
    setError(null)
    setTrip((current) => ({
      ...current,
      activities: (current.activities || []).filter((item) => item.id !== activity.id),
    }))
    try {
      const updated = await deleteTripActivity(trip.id, activity.id)
      if (updated?.id) setTrip(updated)
    } catch (err) {
      setTrip((current) => ({
        ...current,
        activities: previousActivities,
      }))
      setError(getErrorMessage(err))
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

  const stops = useMemo(
    () => [...(trip?.stops || [])].sort((a, b) => a.stopOrder - b.stopOrder),
    [trip?.stops],
  )

  const stopById = useMemo(
    () => new Map(stops.map((stop) => [stop.id, stop])),
    [stops],
  )

  const groupedActivities = useMemo(() => {
    const sorted = [...(trip?.activities || [])].sort((left, right) => {
      const dateDiff = String(left.activityDate || '').localeCompare(String(right.activityDate || ''))
      if (dateDiff !== 0) return dateDiff
      if (left.startTime && right.startTime) {
        const timeDiff = left.startTime.localeCompare(right.startTime)
        if (timeDiff !== 0) return timeDiff
      } else if (left.startTime && !right.startTime) {
        return -1
      } else if (!left.startTime && right.startTime) {
        return 1
      }
      return String(left.id).localeCompare(String(right.id))
    })

    const groups = []
    for (const activity of sorted) {
      const key = activity.activityDate || 'unscheduled'
      const last = groups[groups.length - 1]
      if (last && last.date === key) {
        last.items.push(activity)
      } else {
        groups.push({ date: key, items: [activity] })
      }
    }
    return groups
  }, [trip?.activities])

  if (authLoading || loading) return <TripDetailSkeleton />
  if (!trip) return <main className="app-container py-16 text-center"><h1 className="font-heading text-2xl font-bold text-tafera-text">Trip unavailable</h1><p role="alert" className="mt-3 text-sm text-tafera-text-muted">{error || 'This trip does not exist or is not visible to you.'}</p><Link to="/trips" className="mt-5 inline-block text-tafera-primary hover:underline">Back to trips</Link></main>

  const canManage = trip.isCreator && isAuthenticated && isEmailVerified
  const totalActivities = (trip.activities || []).length
  const activeParticipation = participation && ['pending', 'approved'].includes(participation.status)

  return (
    <main className="app-container py-10">
      <Link to={trip.tripType === 'group' ? '/group-travel' : '/trips'} className="mb-5 inline-block text-sm font-medium text-tafera-primary hover:underline">← Back to {trip.tripType === 'group' ? 'group travel' : 'my trips'}</Link>
      {error && <div role="alert" className="mb-5 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-tafera-text">{error}</div>}
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
          {canManage && <Button size="sm" onClick={() => showAddStop ? setShowAddStop(false) : loadDestinations('')} disabled={busy}>{showAddStop ? 'Close stop form' : 'Add a stop'}</Button>}
        </div>
        {showAddStop && <form onSubmit={saveStop} className="mb-5 grid grid-cols-1 gap-3 rounded-md border border-tafera-border bg-tafera-bg p-4 sm:grid-cols-2">
          <label className="text-sm text-tafera-text-muted sm:col-span-2">Nigerian state or territory<select aria-label="Nigerian state or territory" className={fieldClass} value={selectedState} onChange={(event) => loadDestinations(event.target.value)} required><option value="">Select a state or territory</option>{NIGERIAN_STATES.map((state) => <option key={state} value={state}>{state}</option>)}</select></label>
          {selectedState && <label className="text-sm text-tafera-text-muted sm:col-span-2">Published destination in {selectedState}<select aria-label={`Published destination in ${selectedState}`} className={fieldClass} value={selectedDestination} onChange={(event) => setSelectedDestination(event.target.value)} required disabled={busy || destinations.length === 0}><option value="">{busy ? 'Loading destinations...' : destinations.length === 0 ? 'No published destinations in this state yet' : 'Select a destination'}</option>{destinations.map((destination) => <option key={destination.id} value={destination.id}>{destination.name}</option>)}</select>{!busy && destinations.length === 0 && <span className="mt-1 block text-xs text-tafera-text-muted">Only destinations already published in Tafera can be added as itinerary stops.</span>}</label>}
          <label className="text-sm text-tafera-text-muted">Arrival date<input className={fieldClass} type="date" min={trip.startDate} max={trip.endDate} value={arrivalDate} onChange={(event) => setArrivalDate(event.target.value)} /></label>
          <label className="text-sm text-tafera-text-muted">Departure date<input className={fieldClass} type="date" min={arrivalDate || trip.startDate} max={trip.endDate} value={departureDate} onChange={(event) => setDepartureDate(event.target.value)} /></label>
          <div className="sm:col-span-2"><Button type="submit" disabled={busy || !selectedDestination}>{busy ? 'Adding...' : 'Add to itinerary'}</Button></div>
        </form>}
        {stops.length === 0 ? <p className="rounded-md border border-dashed border-tafera-border bg-tafera-bg p-4 text-sm text-tafera-text-muted">No stops have been added yet.</p> : <ol className="space-y-3">{stops.map((stop) => <StopEditor key={stop.id} tripId={trip.id} stop={stop} canManage={canManage && !busy} onUpdated={(result) => result?.reorder || result?.remove ? changeStop(result) : applyTrip(result)} onError={setError} />)}</ol>}
      </section>

      <section className="mt-6 rounded-lg border border-tafera-border bg-tafera-surface p-5 shadow-soft sm:p-6" aria-label="Day-by-day activities">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl font-bold text-tafera-text">Day-by-day activities</h2>
            <p className="mt-1 text-sm text-tafera-text-muted">
              {totalActivities} {totalActivities === 1 ? 'activity' : 'activities'} planned
            </p>
          </div>
          {canManage && (
            <Button
              size="sm"
              disabled={activityBusy}
              onClick={() => {
                setEditingActivityId(null)
                setShowAddActivity((value) => !value)
              }}
            >
              {showAddActivity ? 'Close activity form' : 'Add activity'}
            </Button>
          )}
        </div>

        {showAddActivity && canManage && (
          <div className="mb-5">
            <ActivityForm
              trip={trip}
              stops={stops}
              submitLabel="Save activity"
              busy={activityBusy}
              onSubmit={handleAddActivity}
              onCancel={() => setShowAddActivity(false)}
            />
          </div>
        )}

        {groupedActivities.length === 0 ? (
          <p className="rounded-md border border-dashed border-tafera-border bg-tafera-bg p-4 text-sm text-tafera-text-muted">
            No activities planned yet.{canManage ? ' Add day-by-day plans to organize your schedule.' : ''}
          </p>
        ) : (
          <div className="space-y-5">
            {groupedActivities.map((group) => (
              <div key={group.date} className="space-y-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-tafera-primary">
                  {formatActivityDay(group.date, trip.startDate)}
                </h3>
                <ul className="space-y-2.5">
                  {group.items.map((activity) => {
                    const linkedStop = activity.tripDestinationId
                      ? stopById.get(activity.tripDestinationId)
                      : null
                    const isEditingThis = editingActivityId === activity.id

                    return (
                      <li
                        key={activity.id}
                        className="rounded-md border border-tafera-border bg-tafera-bg p-4"
                      >
                        {isEditingThis ? (
                          <ActivityForm
                            trip={trip}
                            stops={stops}
                            initialValues={activity}
                            submitLabel="Update activity"
                            busy={activityBusy}
                            onSubmit={(input) => handleUpdateActivity(activity.id, input)}
                            onCancel={() => setEditingActivityId(null)}
                          />
                        ) : (
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full border border-tafera-border bg-tafera-surface px-2.5 py-0.5 text-xs font-medium text-tafera-text-muted">
                                  {formatTimeRange(activity.startTime, activity.endTime)}
                                </span>
                                {linkedStop && (
                                  <span className="rounded-full border border-tafera-border bg-tafera-surface px-2.5 py-0.5 text-xs font-medium text-tafera-primary">
                                    {linkedStop.destination?.name || `Stop ${linkedStop.stopOrder}`}
                                  </span>
                                )}
                              </div>
                              <p className="mt-2 font-semibold text-tafera-text">{activity.title}</p>
                              {activity.location && (
                                <p className="mt-1 text-xs text-tafera-text-muted">{activity.location}</p>
                              )}
                              {activity.description && (
                                <p className="mt-2 whitespace-pre-wrap text-sm text-tafera-text-muted">
                                  {activity.description}
                                </p>
                              )}
                            </div>
                            {canManage && (
                              <div className="flex shrink-0 gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={activityBusy}
                                  aria-label={`Edit ${activity.title}`}
                                  onClick={() => {
                                    setShowAddActivity(false)
                                    setEditingActivityId(activity.id)
                                  }}
                                >
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={activityBusy}
                                  aria-label={`Delete ${activity.title}`}
                                  onClick={() => handleDeleteActivity(activity)}
                                >
                                  Delete
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {trip.tripType === 'group' && trip.isCreator && (
        <section className="mt-6 rounded-lg border border-tafera-border bg-tafera-surface p-5 shadow-soft sm:p-6">
          <h2 className="mb-4 font-heading text-xl font-bold text-tafera-text">Participants</h2>
          {participants.length === 0 ? <p className="text-sm text-tafera-text-muted">No one has requested to join yet.</p> : <ul className="space-y-3">{participants.map((participant) => <li key={participant.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-tafera-border bg-tafera-bg p-3"><div><p className="font-medium text-tafera-text">{participant.user?.fullName || 'Traveller'}</p><p className="text-xs capitalize text-tafera-text-muted">{participant.status}</p></div>{canManage && participant.status === 'pending' && <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={() => moderate(participant.id, 'approved')}>Approve</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => moderate(participant.id, 'rejected')}>Decline</Button></div>}</li>)}</ul>}
        </section>
      )}
    </main>
  )
}
