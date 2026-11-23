import { request } from './api'
import { fetchCsrfToken } from './auth'

export async function fetchPublicTrips(params = {}) {
  const qs = new URLSearchParams()
  if (params.page) qs.set('page', params.page)
  if (params.limit) qs.set('limit', params.limit)

  const { data } = await request(`/api/trips/public?${qs}`)
  return data
}

export async function fetchMyTrips(params = {}) {
  const qs = new URLSearchParams()
  if (params.status) qs.set('status', params.status)
  if (params.page) qs.set('page', params.page)
  if (params.limit) qs.set('limit', params.limit)
  const { data } = await request(`/api/trips?${qs}`)
  return data
}

export async function fetchTrip(tripId) {
  const { data } = await request(`/api/trips/${tripId}`)
  return data.trip
}

export async function createTrip(input) {
  const csrfToken = await fetchCsrfToken()
  const { data } = await request('/api/trips', {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(input),
  })
  return data.trip
}

export async function updateTrip(tripId, input) {
  const csrfToken = await fetchCsrfToken()
  const { data } = await request(`/api/trips/${tripId}`, {
    method: 'PATCH',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(input),
  })
  return data.trip
}

export async function deleteTrip(tripId) {
  const csrfToken = await fetchCsrfToken()
  await request(`/api/trips/${tripId}`, {
    method: 'DELETE',
    headers: { 'X-CSRF-Token': csrfToken },
  })
}

export async function addTripStop(tripId, input) {
  const csrfToken = await fetchCsrfToken()
  const { data } = await request(`/api/trips/${tripId}/stops`, {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(input),
  })
  return data.trip
}

export async function updateTripStop(tripId, stopId, input) {
  const csrfToken = await fetchCsrfToken()
  const { data } = await request(`/api/trips/${tripId}/stops/${stopId}`, {
    method: 'PATCH',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(input),
  })
  return data.trip
}

export async function deleteTripStop(tripId, stopId) {
  const csrfToken = await fetchCsrfToken()
  const { data } = await request(`/api/trips/${tripId}/stops/${stopId}`, {
    method: 'DELETE',
    headers: { 'X-CSRF-Token': csrfToken },
  })
  return data.trip
}

export async function reorderTripStops(tripId, stopIds) {
  const csrfToken = await fetchCsrfToken()
  const { data } = await request(`/api/trips/${tripId}/stops/reorder`, {
    method: 'PUT',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ stopIds }),
  })
  return data.trip
}

export async function addTripActivity(tripId, input) {
  const csrfToken = await fetchCsrfToken()
  const { data } = await request(`/api/trips/${encodeURIComponent(tripId)}/activities`, {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(input),
  })
  return data.trip
}

export async function updateTripActivity(tripId, activityId, input) {
  const csrfToken = await fetchCsrfToken()
  const { data } = await request(
    `/api/trips/${encodeURIComponent(tripId)}/activities/${encodeURIComponent(activityId)}`,
    {
      method: 'PATCH',
      headers: { 'X-CSRF-Token': csrfToken },
      body: JSON.stringify(input),
    },
  )
  return data.trip
}

export async function deleteTripActivity(tripId, activityId) {
  const csrfToken = await fetchCsrfToken()
  const { data } = await request(
    `/api/trips/${encodeURIComponent(tripId)}/activities/${encodeURIComponent(activityId)}`,
    {
      method: 'DELETE',
      headers: { 'X-CSRF-Token': csrfToken },
    },
  )
  return data.trip
}

export async function requestToJoinTrip(tripId) {
  const csrfToken = await fetchCsrfToken()
  const { data } = await request(`/api/trips/${tripId}/join`, {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({}),
  })
  return data.participation
}

export async function leaveTrip(tripId) {
  const csrfToken = await fetchCsrfToken()
  const { data } = await request(`/api/trips/${tripId}/join`, {
    method: 'DELETE',
    headers: { 'X-CSRF-Token': csrfToken },
  })
  return data.participation
}

export async function fetchMyParticipation(tripId) {
  const { data } = await request(`/api/trips/${tripId}/participation`)
  return data.participation
}

export async function fetchTripParticipants(tripId, params = {}) {
  const qs = new URLSearchParams()
  if (params.status) qs.set('status', params.status)
  if (params.page) qs.set('page', params.page)
  if (params.limit) qs.set('limit', params.limit)
  const { data } = await request(`/api/trips/${tripId}/participants?${qs}`)
  return data
}

export async function moderateTripParticipant(tripId, participantId, status) {
  const csrfToken = await fetchCsrfToken()
  const { data } = await request(
    `/api/trips/${tripId}/participants/${participantId}`,
    {
      method: 'PATCH',
      headers: { 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ status }),
    },
  )
  return data.participation
}
