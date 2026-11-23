import { request } from './api'
import { fetchCsrfToken } from './auth'
import { uploadDestinationImage } from './destinations'

const buildQuery = (params = {}) => {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      qs.set(key, String(value))
    }
  }
  const str = qs.toString()
  return str ? `?${str}` : ''
}

const csrfJsonRequest = async (path, method, body) => {
  const csrfToken = await fetchCsrfToken()
  return request(path, {
    method,
    headers: { 'X-CSRF-Token': csrfToken },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

// Overview & Audit
export async function fetchAdminOverview() {
  const { data } = await request('/api/admin/overview')
  return data
}

export async function fetchAdminAuditLogs(params = {}) {
  const { data } = await request(`/api/admin/audit-logs${buildQuery(params)}`)
  return data
}

// Users
export async function fetchAdminUsers(params = {}) {
  const { data } = await request(`/api/admin/users${buildQuery(params)}`)
  return data
}

export async function fetchAdminUserDetail(userId) {
  const { data } = await request(`/api/admin/users/${encodeURIComponent(userId)}`)
  return data.user
}

export async function updateAdminUserStatus(userId, { status, reason = null }) {
  const { data } = await csrfJsonRequest(
    `/api/admin/users/${encodeURIComponent(userId)}/status`,
    'PATCH',
    { status, reason },
  )
  return data.user
}

export async function updateAdminUserRole(userId, { role, reason = null }) {
  const { data } = await csrfJsonRequest(
    `/api/admin/users/${encodeURIComponent(userId)}/role`,
    'PATCH',
    { role, reason },
  )
  return data.user
}

// Destinations & Photos
export async function fetchAdminDestinations(params = {}) {
  const { data } = await request(`/api/admin/destinations${buildQuery(params)}`)
  return data
}

export async function createAdminDestination(payload) {
  const { data } = await csrfJsonRequest('/api/admin/destinations', 'POST', payload)
  return data.destination
}

export async function updateAdminDestination(destinationId, payload) {
  const { data } = await csrfJsonRequest(
    `/api/admin/destinations/${encodeURIComponent(destinationId)}`,
    'PATCH',
    payload,
  )
  return data.destination
}

export async function deleteAdminDestination(destinationId, reason = null) {
  await csrfJsonRequest(
    `/api/admin/destinations/${encodeURIComponent(destinationId)}`,
    'DELETE',
    reason ? { reason } : {},
  )
}

export async function fetchAdminDestinationPhotos(params = {}) {
  const { data } = await request(`/api/admin/destination-images${buildQuery(params)}`)
  return data
}

export async function uploadAdminDestinationPhoto(destinationId, { file, caption, altText }) {
  return uploadDestinationImage(destinationId, { file, caption, altText })
}

export async function setDestinationCoverImage(destinationId, imageId) {
  const { data } = await csrfJsonRequest(
    `/api/destinations/${encodeURIComponent(destinationId)}/images/${encodeURIComponent(imageId)}`,
    'PATCH',
    { isCover: true },
  )
  return data.image
}

export async function deleteAdminDestinationPhoto(destinationId, imageId, reason = null) {
  await csrfJsonRequest(
    `/api/admin/destinations/${encodeURIComponent(destinationId)}/images/${encodeURIComponent(imageId)}`,
    'DELETE',
    reason ? { reason } : {},
  )
}

// Moderation & Reports
export async function fetchAdminReports(params = {}) {
  const { data } = await request(`/api/admin/reports${buildQuery(params)}`)
  return data
}

export async function moderateAdminReport(reportId, payload) {
  const { data } = await csrfJsonRequest(
    `/api/admin/reports/${encodeURIComponent(reportId)}`,
    'PATCH',
    payload,
  )
  return data.report
}

export async function deleteAdminPost(postId, reason = null) {
  await csrfJsonRequest(
    `/api/admin/posts/${encodeURIComponent(postId)}`,
    'DELETE',
    reason ? { reason } : {},
  )
}

export async function deleteAdminComment(commentId, reason = null) {
  await csrfJsonRequest(
    `/api/admin/comments/${encodeURIComponent(commentId)}`,
    'DELETE',
    reason ? { reason } : {},
  )
}

// Group Trips
export async function fetchAdminGroupTrips(params = {}) {
  const { data } = await request(`/api/admin/trips${buildQuery(params)}`)
  return data
}

export async function fetchAdminGroupTripDetail(tripId) {
  const { data } = await request(`/api/admin/trips/${encodeURIComponent(tripId)}`)
  return data.trip
}

export async function updateAdminGroupTripStatus(tripId, { status, reason = null }) {
  const { data } = await csrfJsonRequest(
    `/api/admin/trips/${encodeURIComponent(tripId)}/status`,
    'PATCH',
    { status, reason },
  )
  return data.trip
}

export async function deleteAdminGroupTrip(tripId, reason = null) {
  await csrfJsonRequest(
    `/api/admin/trips/${encodeURIComponent(tripId)}`,
    'DELETE',
    reason ? { reason } : {},
  )
}
