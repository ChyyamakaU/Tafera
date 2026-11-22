const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001'

async function request(path, options = {}) {
  let res
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
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
    const error = await res.json().catch(() => ({}))
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
