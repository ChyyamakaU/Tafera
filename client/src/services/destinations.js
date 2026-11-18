import { request } from './api'

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
