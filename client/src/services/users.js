import { request } from './api'
import { fetchCsrfToken } from './auth'

export async function getPublicProfile(userId) {
  const { data } = await request(`/api/users/${userId}`, {
    method: 'GET',
  })
  return data.user
}

export async function followUser(userId) {
  const csrfToken = await fetchCsrfToken()
  const { data } = await request(`/api/users/${userId}/follow`, {
    method: 'POST',
    headers: {
      'X-CSRF-Token': csrfToken,
    },
  })
  return data.follow
}

export async function unfollowUser(userId) {
  const csrfToken = await fetchCsrfToken()
  await request(`/api/users/${userId}/follow`, {
    method: 'DELETE',
    headers: {
      'X-CSRF-Token': csrfToken,
    },
  })
}

export async function getFollowers(userId, { page = 1, limit = 20 } = {}) {
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) })
  const { data } = await request(
    `/api/users/${userId}/followers?${qs}`,
    {
      method: 'GET',
    },
  )
  return data
}

export async function getFollowing(userId, { page = 1, limit = 20 } = {}) {
  const qs = new URLSearchParams({ page: String(page), limit: String(limit) })
  const { data } = await request(
    `/api/users/${userId}/following?${qs}`,
    {
      method: 'GET',
    },
  )
  return data
}
