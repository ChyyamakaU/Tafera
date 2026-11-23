import { request } from './api'
import { fetchCsrfToken } from './auth'

export async function fetchNotifications(params = {}) {
  const query = new URLSearchParams()
  if (params.page) query.set('page', params.page)
  if (params.limit) query.set('limit', params.limit)
  if (params.unreadOnly) query.set('unreadOnly', 'true')
  const { data } = await request(`/api/notifications?${query}`)
  return data
}

export async function fetchUnreadCount() {
  const { data } = await request('/api/notifications/unread-count')
  return data.unreadCount || 0
}

export async function markNotificationRead(id) {
  const csrfToken = await fetchCsrfToken()
  const { data } = await request(`/api/notifications/${encodeURIComponent(id)}/read`, {
    method: 'PATCH',
    headers: { 'X-CSRF-Token': csrfToken },
  })
  return data.notification
}

export async function markAllNotificationsRead() {
  const csrfToken = await fetchCsrfToken()
  const { data } = await request('/api/notifications/read-all', {
    method: 'PATCH',
    headers: { 'X-CSRF-Token': csrfToken },
  })
  return data.updatedCount
}
