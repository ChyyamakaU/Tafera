import { request } from './api'
import { fetchCsrfToken } from './auth'

const csrfHeaders = async () => ({ 'X-CSRF-Token': await fetchCsrfToken() })

export async function fetchScrapbooks(params = {}) {
  const query = new URLSearchParams()
  if (params.page) query.set('page', params.page)
  if (params.limit) query.set('limit', params.limit)
  if (params.isPublic !== undefined) query.set('isPublic', params.isPublic)
  const { data } = await request(`/api/scrapbooks?${query}`)
  return data
}

export async function fetchScrapbook(journalId) {
  const { data } = await request(`/api/scrapbooks/${journalId}`)
  return data.journal
}

export async function createScrapbook(input) {
  const { data } = await request('/api/scrapbooks', {
    method: 'POST', headers: await csrfHeaders(), body: JSON.stringify(input),
  })
  return data.journal
}

export async function updateScrapbook(journalId, input) {
  const { data } = await request(`/api/scrapbooks/${journalId}`, {
    method: 'PATCH', headers: await csrfHeaders(), body: JSON.stringify(input),
  })
  return data.journal
}

export async function setScrapbookVisibility(journalId, isPublic) {
  const { data } = await request(`/api/scrapbooks/${journalId}/visibility`, {
    method: 'PATCH', headers: await csrfHeaders(), body: JSON.stringify({ isPublic }),
  })
  return data.journal
}

export async function deleteScrapbook(journalId) {
  await request(`/api/scrapbooks/${journalId}`, {
    method: 'DELETE', headers: await csrfHeaders(),
  })
}

export async function linkScrapbookTrip(journalId, tripId) {
  const { data } = await request(`/api/scrapbooks/${journalId}/trip`, {
    method: 'POST', headers: await csrfHeaders(), body: JSON.stringify({ tripId }),
  })
  return data.journal
}

export async function unlinkScrapbookTrip(journalId) {
  const { data } = await request(`/api/scrapbooks/${journalId}/trip`, {
    method: 'DELETE', headers: await csrfHeaders(),
  })
  return data.journal
}

export async function uploadScrapbookImage(journalId, { file, altText, caption, takenAt, isCover = false }) {
  const body = new FormData()
  body.append('image', file)
  if (altText) body.append('altText', altText)
  if (caption) body.append('caption', caption)
  if (takenAt) body.append('takenAt', takenAt)
  body.append('isCover', String(isCover))
  const { data } = await request(`/api/scrapbooks/${journalId}/images`, {
    method: 'POST', headers: await csrfHeaders(), body,
  })
  return data.image
}

export async function updateScrapbookImage(journalId, imageId, input) {
  const { data } = await request(`/api/scrapbooks/${journalId}/images/${imageId}`, {
    method: 'PATCH', headers: await csrfHeaders(), body: JSON.stringify(input),
  })
  return data.image
}

export async function deleteScrapbookImage(journalId, imageId) {
  await request(`/api/scrapbooks/${journalId}/images/${imageId}`, {
    method: 'DELETE', headers: await csrfHeaders(),
  })
}

export async function reorderScrapbookImages(journalId, imageIds) {
  const { data } = await request(`/api/scrapbooks/${journalId}/images/reorder`, {
    method: 'PATCH', headers: await csrfHeaders(), body: JSON.stringify(imageIds),
  })
  return data.images
}
