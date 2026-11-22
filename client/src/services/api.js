// VITE_API_URL has historically been documented with and without the `/api`
// suffix. Request paths already include that prefix, so normalize it here to
// avoid sending requests to `/api/api/...` when the documented value is used.
// Prefer same-origin API routing unless an explicit backend origin is
// configured. A browser-side localhost default breaks as soon as the client is
// opened from another machine or hosted outside the API host.
const configuredApiBase = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '')
const API_BASE = configuredApiBase.replace(/\/api$/i, '')

async function request(path, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  const requestHeaders = { ...options.headers }
  if (!isFormData && !Object.keys(requestHeaders).some((key) => key.toLowerCase() === 'content-type')) {
    requestHeaders['Content-Type'] = 'application/json'
  }
  let res
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: 'include',
      headers: requestHeaders,
    })
  } catch (fetchErr) {
    // Network failure: no HTTP response was received at all.
    const networkError = new Error(
      'Unable to connect to the server. Please check your internet connection and try again.'
    )
    networkError.code = 'NETWORK_ERROR'
    networkError.status = 0
    networkError.isNetworkError = true
    throw networkError
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    // The Tafera API wraps errors as `{ error: { code, message, ... } }`.
    // Keep compatibility with any endpoints/proxies returning a flat body.
    const error = payload.error || payload
    const err = new Error(
      error.message || `Request failed: ${res.status}`
    )
    err.code = error.code
    err.status = res.status
    err.details = error.details
    const retryAfter = res.headers?.get('retry-after')
    if (retryAfter) {
      const parsed = Number(retryAfter)
      if (Number.isFinite(parsed) && parsed > 0) {
        err.retryAfterSeconds = parsed
      }
    }
    throw err
  }

  if (res.status === 204) return null
  return res.json()
}

export { request, API_BASE }
