import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { request, API_BASE } from './api'

const mockResponse = (ok, status, body) => ({
  ok,
  status,
  json: async () => body,
})

global.fetch = vi.fn()

beforeEach(() => {
  fetch.mockReset()
  sessionStorage.clear()
  vi.restoreAllMocks()
})

afterEach(() => {
  sessionStorage.clear()
})

describe('request() fetch options', () => {
  it('sends JSON requests with Content-Type header', async () => {
    fetch.mockResolvedValue(mockResponse(true, 200, { data: {} }))

    await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@example.com' }),
    })

    const [, init] = fetch.mock.calls[0]
    expect(init.headers['Content-Type']).toBe('application/json')
  })

  it('preserves custom CSRF headers alongside Content-Type', async () => {
    fetch.mockResolvedValue(mockResponse(true, 200, { data: {} }))

    await request('/api/auth/register', {
      method: 'POST',
      headers: { 'X-CSRF-Token': 'csrf-token-123' },
      body: JSON.stringify({ email: 'test@example.com' }),
    })

    const [, init] = fetch.mock.calls[0]
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.headers['X-CSRF-Token']).toBe('csrf-token-123')
  })

  it('retains credentials: include', async () => {
    fetch.mockResolvedValue(mockResponse(true, 200, { data: {} }))

    await request('/api/auth/me')

    const [, init] = fetch.mock.calls[0]
    expect(init.credentials).toBe('include')
  })

  it('preserves custom request options such as method and body', async () => {
    fetch.mockResolvedValue(mockResponse(true, 200, { data: {} }))
    const body = JSON.stringify({ fullName: 'Ada', email: 'ada@example.com' })

    await request('/api/auth/register', {
      method: 'POST',
      body,
    })

    const [, init] = fetch.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(init.body).toBe(body)
  })

  it('posts to the correct API URL', async () => {
    fetch.mockResolvedValue(mockResponse(true, 200, { data: {} }))

    await request('/api/auth/register', { method: 'POST', body: '{}' })

    const [url] = fetch.mock.calls[0]
    expect(url).toBe(`${API_BASE}/api/auth/register`)
  })

  it('throws when the response is not ok', async () => {
    fetch.mockResolvedValue(mockResponse(false, 400, { message: 'Bad request' }))

    await expect(request('/api/auth/register', { method: 'POST', body: '{}' })).rejects.toThrow(
      'Bad request',
    )
  })

  it('returns null for successful 204 responses without parsing an empty body', async () => {
    const json = vi.fn()
    fetch.mockResolvedValue({ ok: true, status: 204, json })

    await expect(request('/api/posts/post-id', { method: 'DELETE' })).resolves.toBeNull()
    expect(json).not.toHaveBeenCalled()
  })
})
