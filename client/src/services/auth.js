import { request, API_BASE } from './api'

export async function checkAuth() {
  try {
    const { data } = await request('/api/auth/me')
    return { isAuthenticated: true, user: data.user }
  } catch {
    return { isAuthenticated: false, user: null }
  }
}

export async function fetchCsrfToken() {
  const res = await fetch(`${API_BASE}/api/auth/csrf`, {
    credentials: 'include',
  })
  if (!res.ok) {
    throw new Error('Failed to fetch CSRF token')
  }
  const data = await res.json()
  return data.data.csrfToken
}

export async function register({ fullName, email, password }) {
  const csrfToken = await fetchCsrfToken()
  const { data } = await request('/api/auth/register', {
    method: 'POST',
    headers: {
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify({ fullName, email, password }),
  })
  return data
}

export async function login({ email, password }) {
  const csrfToken = await fetchCsrfToken()
  const { data } = await request('/api/auth/login', {
    method: 'POST',
    headers: {
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify({ email, password }),
  })
  return data
}

export async function logout() {
  const csrfToken = await fetchCsrfToken()
  await request('/api/auth/logout', {
    method: 'POST',
    headers: {
      'X-CSRF-Token': csrfToken,
    },
  })
}

export function getPendingAction() {
  try {
    const stored = sessionStorage.getItem('tafera:pending-action')
    return stored ? JSON.parse(stored) : null
  } catch {
    return null
  }
}

export function clearPendingAction() {
  try {
    sessionStorage.removeItem('tafera:pending-action')
  } catch {}
}

export function setPendingAction(action) {
  try {
    sessionStorage.setItem(
      'tafera:pending-action',
      JSON.stringify({
        ...action,
        returnTo: window.location.pathname,
      }),
    )
  } catch {}
}
