import { request } from './api'

export async function checkAuth() {
  try {
    const { data } = await request('/api/auth/me')
    return { isAuthenticated: true, user: data.user }
  } catch {
    return { isAuthenticated: false, user: null }
  }
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
