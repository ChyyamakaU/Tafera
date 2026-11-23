'use strict'

const { toDestinationSummary } = require('./safeDestination')

// Explicit allowlist for trip responses. Ownership, internal timestamps that
// are not part of the contract and every future sensitive column stay out of
// the payload by construction.
const PUBLIC_TRIP_FIELDS = Object.freeze([
  'id',
  'title',
  'description',
  'tripType',
  'startDate',
  'endDate',
  'maxParticipants',
  'status',
  'createdAt',
  'updatedAt',
])

const PUBLIC_TRIP_STOP_FIELDS = Object.freeze([
  'id',
  'destinationId',
  'stopOrder',
  'arrivalDate',
  'departureDate',
  'createdAt',
  'updatedAt',
])

const PUBLIC_TRIP_ACTIVITY_FIELDS = Object.freeze([
  'id',
  'tripDestinationId',
  'title',
  'description',
  'activityDate',
  'startTime',
  'endTime',
  'location',
  'createdAt',
  'updatedAt',
])

const toPlain = (value) => {
  if (!value || typeof value !== 'object') return null

  return typeof value.get === 'function'
    ? value.get({ plain: true })
    : value
}

const toDateOnly = (value) => {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'string') return value.slice(0, 10)
  if (value instanceof Date) return value.toISOString().slice(0, 10)

  return String(value).slice(0, 10)
}

const toTimeOnly = (value) => {
  if (value === null || value === undefined || value === '') return null
  const text = String(value).trim()
  const match = /^([01]\d|2[0-3]):([0-5]\d)/.exec(text)
  return match ? `${match[1]}:${match[2]}` : null
}

const toTripSummary = (trip) => {
  const source = toPlain(trip)

  if (!source) return null

  return {
    id: source.id,
    title: source.title,
    description: source.description ?? null,
    tripType: source.tripType,
    startDate: toDateOnly(source.startDate),
    endDate: toDateOnly(source.endDate),
    maxParticipants: source.maxParticipants ?? null,
    status: source.status,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  }
}

const toTripStop = (stop) => {
  const source = toPlain(stop)

  if (!source) return null

  return {
    id: source.id,
    destinationId: source.destinationId,
    stopOrder: Number(source.stopOrder),
    arrivalDate: toDateOnly(source.arrivalDate),
    departureDate: toDateOnly(source.departureDate),
    destination: source.destination
      ? toDestinationSummary(source.destination)
      : null,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  }
}

const byStopOrder = (left, right) => {
  const orderDifference =
    (left.stopOrder ?? 0) - (right.stopOrder ?? 0)

  if (orderDifference !== 0) return orderDifference

  return String(left.id).localeCompare(String(right.id))
}

const toTripActivity = (activity) => {
  const source = toPlain(activity)

  if (!source) return null

  return {
    id: source.id,
    tripDestinationId: source.tripDestinationId ?? null,
    title: source.title,
    description: source.description ?? null,
    activityDate: toDateOnly(source.activityDate),
    startTime: toTimeOnly(source.startTime),
    endTime: toTimeOnly(source.endTime),
    location: source.location ?? null,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  }
}

const byActivitySchedule = (left, right) => {
  const dateDiff = String(left.activityDate || '').localeCompare(
    String(right.activityDate || ''),
  )
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
}

const toTripDetail = (trip, viewerUserId = null) => {
  const source = toPlain(trip)

  if (!source) return null

  const stops = source.stops || source.destinations || []
  const activities = source.activities || source.itineraries || []

  return {
    ...toTripSummary(source),
    isCreator: viewerUserId !== null ? source.userId === viewerUserId : false,
    stops: (Array.isArray(stops) ? stops : [])
      .map(toTripStop)
      .filter(Boolean)
      .sort(byStopOrder),
    activities: (Array.isArray(activities) ? activities : [])
      .map(toTripActivity)
      .filter(Boolean)
      .sort(byActivitySchedule),
  }
}

module.exports = {
  PUBLIC_TRIP_ACTIVITY_FIELDS,
  PUBLIC_TRIP_FIELDS,
  PUBLIC_TRIP_STOP_FIELDS,
  toDateOnly,
  toTimeOnly,
  toTripActivity,
  toTripDetail,
  toTripStop,
  toTripSummary,
}
