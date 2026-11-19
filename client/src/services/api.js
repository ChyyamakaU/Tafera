const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001'

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({}))
    const err = new Error(error.message || `Request failed: ${res.status}`)
    err.code = error.code
    err.status = res.status
    throw err
  }

  return res.json()
}

export { request, API_BASE }
