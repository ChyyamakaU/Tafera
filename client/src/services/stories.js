import { request } from './api'
import { fetchCsrfToken } from './auth'

export async function fetchFeaturedStories(limit = 3) {
  const { data } = await request(`/api/stories?limit=${encodeURIComponent(limit)}`)
  return data.stories || []
}

export async function fetchAdminStories() {
  const { data } = await request('/api/stories/admin')
  return data.stories || []
}

export async function createStory(input) {
  const csrfToken = await fetchCsrfToken()
  const { data } = await request('/api/stories', {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(input),
  })
  return data.story
}

export async function updateStory(storyId, input) {
  const csrfToken = await fetchCsrfToken()
  const { data } = await request(`/api/stories/${encodeURIComponent(storyId)}`, {
    method: 'PATCH',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(input),
  })
  return data.story
}

export async function uploadStoryCover(storyId, file, coverImageAlt = '') {
  const csrfToken = await fetchCsrfToken()
  const body = new FormData()
  body.append('image', file)
  if (coverImageAlt) body.append('coverImageAlt', coverImageAlt)
  const { data } = await request(`/api/stories/${encodeURIComponent(storyId)}/cover`, {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
    body,
  })
  return data.story
}

export async function deleteStory(storyId) {
  const csrfToken = await fetchCsrfToken()
  await request(`/api/stories/${encodeURIComponent(storyId)}`, {
    method: 'DELETE',
    headers: { 'X-CSRF-Token': csrfToken },
  })
}

export async function reorderStories(storyIds) {
  const csrfToken = await fetchCsrfToken()
  const { data } = await request('/api/stories/reorder', {
    method: 'PUT',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ storyIds }),
  })
  return data.stories || []
}
