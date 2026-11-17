import { request } from './api'

export async function fetchPublicTrips(params = {}) {
  const qs = new URLSearchParams()
  if (params.page) qs.set('page', params.page)
  if (params.limit) qs.set('limit', params.limit)

  const { data } = await request(`/api/trips/public?${qs}`)
  return data
}
