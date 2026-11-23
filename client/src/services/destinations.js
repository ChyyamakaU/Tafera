import { request } from './api'
import { fetchCsrfToken } from './auth'

export async function fetchFeaturedDestinations(limit = 6) {
  const { data } = await request(
    `/api/destinations?featured=true&limit=${limit}`
  )
  return data.destinations || []
}

export async function fetchDestination(slug) {
  const { data } = await request(`/api/destinations/${encodeURIComponent(slug)}`)
  return data.destination
}

export async function fetchDestinations(params = {}) {
  const qs = new URLSearchParams()
  if (params.q) qs.set('q', params.q)
  if (params.country) qs.set('country', params.country)
  if (params.state) qs.set('state', params.state)
  if (params.featured !== undefined) qs.set('featured', params.featured)
  if (params.sort) qs.set('sort', params.sort)
  if (params.order) qs.set('order', params.order)
  if (params.page) qs.set('page', params.page)
  if (params.limit) qs.set('limit', params.limit)

  const { data } = await request(`/api/destinations?${qs}`)
  return data
}

export async function fetchCommunityDestinationPhotos(params = {}) {
  const qs = new URLSearchParams()
  if (params.q) qs.set('q', params.q)
  if (params.country) qs.set('country', params.country)
  if (params.state) qs.set('state', params.state)
  if (params.page) qs.set('page', params.page)
  if (params.limit) qs.set('limit', params.limit)

  const { data } = await request(`/api/destinations/community?${qs}`)
  return data
}

export async function fetchMyDestinations() {
  const { data } = await request('/api/destinations/mine')
  return data.destinations || []
}

export async function fetchMyDestination(slug) {
  const { data } = await request(
    `/api/destinations/mine/${encodeURIComponent(slug)}`
  )
  return data.destination
}

export async function uploadDestinationImage(destinationId, { file, caption }) {
  const body = new FormData()
  body.append('image', file)
  if (caption?.trim()) body.append('caption', caption.trim())
  const csrfToken = await fetchCsrfToken()
  const { data } = await request(`/api/destinations/${destinationId}/images`, {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
    body,
  })
  return data.image
}

export async function deleteDestinationImage(destinationId, imageId) {
  const csrfToken = await fetchCsrfToken()
  await request(`/api/destinations/${destinationId}/images/${imageId}`, {
    method: 'DELETE',
    headers: { 'X-CSRF-Token': csrfToken },
  })
}
