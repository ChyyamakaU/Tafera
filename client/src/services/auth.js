import { request } from './api'

export async function checkAuth() {
  try {
    const { data } = await request('/api/auth/me')
    return { isAuthenticated: true, user: data.user }
  } catch {
    return { isAuthenticated: false, user: null }
  }
}

export async function fetchCsrfToken() {
  const { data } = await request('/api/auth/csrf')
  return data.csrfToken
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

export async function getProfile() {
  const { data } = await request('/api/users/me', {
    method: 'GET',
  })
  return data.user
}

export async function updateProfile(input) {
  const csrfToken = await fetchCsrfToken()
  const { data } = await request('/api/users/me', {
    method: 'PATCH',
    headers: {
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify(input),
  })
  return data.user
}

export async function uploadProfileImage(file) {
  const csrfToken = await fetchCsrfToken()
  const body = new FormData()
  body.append('image', file)
  const { data } = await request('/api/users/me/profile-image', {
    method: 'POST', headers: { 'X-CSRF-Token': csrfToken }, body,
  })
  return data.user
}

export async function verifyEmail({ token }) {
  const csrfToken = await fetchCsrfToken()
  const { data } = await request('/api/auth/verify-email', {
    method: 'POST',
    headers: {
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify({ token }),
  })
  return data
}

export async function resendVerification() {
  const csrfToken = await fetchCsrfToken()
  const { data } = await request('/api/auth/verify-email/resend', {
    method: 'POST',
    headers: {
      'X-CSRF-Token': csrfToken,
    },
  })
  return data
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

export function setPendingAction(action, returnTo) {
  try {
    sessionStorage.setItem(
      'tafera:pending-action',
      JSON.stringify({
        ...action,
        returnTo: returnTo ?? window.location.pathname,
      }),
    )
  } catch {}
}
