import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  checkAuth,
  register,
  login,
  logout,
  fetchCsrfToken,
  getPendingAction,
  clearPendingAction,
  setPendingAction,
} from './auth'
import { API_BASE } from './api'

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

describe('fetchCsrfToken', () => {
  it('fetches CSRF token from /api/auth/csrf', async () => {
    fetch.mockResolvedValue(mockResponse(true, 200, { data: { csrfToken: 'test-token' } }))
    const token = await fetchCsrfToken()
    expect(token).toBe('test-token')
    expect(fetch).toHaveBeenCalledWith(`${API_BASE}/api/auth/csrf`, {
      credentials: 'include',
    })
  })

  it('throws when CSRF token fetch fails', async () => {
    fetch.mockResolvedValue(mockResponse(false, 500, { message: 'Server error' }))
    await expect(fetchCsrfToken()).rejects.toThrow('Failed to fetch CSRF token')
  })
})

describe('register', () => {
  it('registers a user successfully', async () => {
    fetch
      .mockResolvedValueOnce(mockResponse(true, 200, { data: { csrfToken: 'csrf-token' } }))
      .mockResolvedValueOnce(
        mockResponse(true, 200, {
          data: { user: { id: '123', email: 'test@example.com' }, csrfToken: 'new-csrf' },
        }),
      )

    const result = await register({
      fullName: 'Test User',
      email: 'test@example.com',
      password: 'password12345',
    })

    expect(result.user).toEqual({ id: '123', email: 'test@example.com' })
    expect(fetch).toHaveBeenNthCalledWith(1, `${API_BASE}/api/auth/csrf`, {
      credentials: 'include',
    })
    const registerCall = fetch.mock.calls[1]
    expect(registerCall[0]).toBe(`${API_BASE}/api/auth/register`)
    expect(registerCall[1].method).toBe('POST')
    expect(registerCall[1].headers['X-CSRF-Token']).toBe('csrf-token')
    expect(JSON.parse(registerCall[1].body)).toEqual({
      fullName: 'Test User',
      email: 'test@example.com',
      password: 'password12345',
    })
  })

  it('handles backend validation errors', async () => {
    fetch
      .mockResolvedValueOnce(mockResponse(true, 200, { data: { csrfToken: 'csrf-token' } }))
      .mockResolvedValueOnce(
        mockResponse(false, 400, {
          message: 'The request could not be validated.',
          details: [{ field: 'email', message: 'Enter a valid email address.' }],
        }),
      )

    await expect(
      register({ fullName: 'Test', email: 'bad-email', password: 'password12345' }),
    ).rejects.toThrow('The request could not be validated.')
  })

  it('handles email already in use', async () => {
    fetch
      .mockResolvedValueOnce(mockResponse(true, 200, { data: { csrfToken: 'csrf-token' } }))
      .mockResolvedValueOnce(
        mockResponse(false, 409, {
          message: 'An account with this email already exists.',
          code: 'EMAIL_IN_USE',
          status: 409,
        }),
      )

    await expect(
      register({
        fullName: 'Test',
        email: 'existing@example.com',
        password: 'password12345',
      }),
    ).rejects.toThrow('An account with this email already exists.')
  })
})

describe('login', () => {
  it('logs in successfully', async () => {
    fetch
      .mockResolvedValueOnce(mockResponse(true, 200, { data: { csrfToken: 'csrf-token' } }))
      .mockResolvedValueOnce(
        mockResponse(true, 200, {
          data: { user: { id: '123', email: 'test@example.com' }, csrfToken: 'new-csrf' },
        }),
      )

    const result = await login({ email: 'test@example.com', password: 'password12345' })

    expect(result.user).toEqual({ id: '123', email: 'test@example.com' })
    expect(fetch).toHaveBeenNthCalledWith(1, `${API_BASE}/api/auth/csrf`, {
      credentials: 'include',
    })
    const loginCall = fetch.mock.calls[1]
    expect(loginCall[0]).toBe(`${API_BASE}/api/auth/login`)
    expect(loginCall[1].method).toBe('POST')
    expect(loginCall[1].headers['X-CSRF-Token']).toBe('csrf-token')
    expect(JSON.parse(loginCall[1].body)).toEqual({
      email: 'test@example.com',
      password: 'password12345',
    })
  })

  it('handles invalid credentials', async () => {
    fetch
      .mockResolvedValueOnce(mockResponse(true, 200, { data: { csrfToken: 'csrf-token' } }))
      .mockResolvedValueOnce(
        mockResponse(false, 401, {
          message: 'Invalid email or password.',
          code: 'INVALID_CREDENTIALS',
          status: 401,
        }),
      )

    await expect(
      login({ email: 'test@example.com', password: 'wrong' }),
    ).rejects.toThrow('Invalid email or password.')
  })
})

describe('logout', () => {
  it('logs out successfully', async () => {
    fetch
      .mockResolvedValueOnce(mockResponse(true, 200, { data: { csrfToken: 'csrf-token' } }))
      .mockResolvedValueOnce(mockResponse(true, 204, null))

    await logout()

    expect(fetch).toHaveBeenNthCalledWith(1, `${API_BASE}/api/auth/csrf`, {
      credentials: 'include',
    })
    const logoutCall = fetch.mock.calls[1]
    expect(logoutCall[0]).toBe(`${API_BASE}/api/auth/logout`)
    expect(logoutCall[1].method).toBe('POST')
    expect(logoutCall[1].headers['X-CSRF-Token']).toBe('csrf-token')
  })

  it('handles logout errors', async () => {
    fetch
      .mockResolvedValueOnce(mockResponse(true, 200, { data: { csrfToken: 'csrf-token' } }))
      .mockResolvedValueOnce(mockResponse(false, 500, { message: 'Server error' }))

    await expect(logout()).rejects.toThrow('Server error')
  })
})

describe('checkAuth', () => {
  it('restores authenticated session', async () => {
    fetch.mockResolvedValue(
      mockResponse(true, 200, { data: { user: { id: '123', email: 'test@example.com' } } }),
    )
    const result = await checkAuth()
    expect(result).toEqual({
      isAuthenticated: true,
      user: { id: '123', email: 'test@example.com' },
    })
    expect(fetch).toHaveBeenCalledWith(`${API_BASE}/api/auth/me`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    })
  })

  it('returns unauthenticated for 401', async () => {
    fetch.mockResolvedValue(mockResponse(false, 401, { message: 'Authentication required' }))
    const result = await checkAuth()
    expect(result).toEqual({ isAuthenticated: false, user: null })
  })

  it('handles network failure', async () => {
    fetch.mockRejectedValue(new Error('Network error'))
    const result = await checkAuth()
    expect(result).toEqual({ isAuthenticated: false, user: null })
  })
})

describe('pending actions', () => {
  it('setPendingAction stores action details with default returnTo', () => {
    setPendingAction({ action: 'join', entityType: 'trip', entityName: 'Kyoto Trip' })
    const stored = sessionStorage.getItem('tafera:pending-action')
    const parsed = JSON.parse(stored)
    expect(parsed.action).toBe('join')
    expect(parsed.entityType).toBe('trip')
    expect(parsed.entityName).toBe('Kyoto Trip')
    expect(parsed.returnTo).toBe(window.location.pathname)
  })

  it('setPendingAction preserves explicit returnTo', () => {
    setPendingAction({ action: 'sign_in' }, '/trips/abc-123')
    const stored = sessionStorage.getItem('tafera:pending-action')
    const parsed = JSON.parse(stored)
    expect(parsed.returnTo).toBe('/trips/abc-123')
  })

  it('getPendingAction retrieves stored data', () => {
    sessionStorage.setItem(
      'tafera:pending-action',
      JSON.stringify({ action: 'sign_in', returnTo: '/destinations' }),
    )
    const result = getPendingAction()
    expect(result).toEqual({ action: 'sign_in', returnTo: '/destinations' })
  })

  it('getPendingAction returns null when nothing stored', () => {
    expect(getPendingAction()).toBeNull()
  })

  it('clearPendingAction removes stored data', () => {
    sessionStorage.setItem(
      'tafera:pending-action',
      JSON.stringify({ action: 'sign_in', returnTo: '/destinations' }),
    )
    clearPendingAction()
    expect(getPendingAction()).toBeNull()
  })

  it('setPendingAction handles errors safely', () => {
    expect(() => setPendingAction({ action: 'sign_in' })).not.toThrow()
  })

  it('getPendingAction handles malformed data safely', () => {
    sessionStorage.setItem('tafera:pending-action', 'not-json')
    expect(() => getPendingAction()).not.toThrow()
    expect(getPendingAction()).toBeNull()
  })

  it('setPendingAction preserves actionLabel', () => {
    setPendingAction({
      action: 'create_story',
      actionLabel: 'share your story',
      entityType: 'story',
      entityName: 'Kyoto Trip',
    })
    const stored = sessionStorage.getItem('tafera:pending-action')
    const parsed = JSON.parse(stored)
    expect(parsed.actionLabel).toBe('share your story')
  })

  it('pending action round-trip: store, retrieve, then clear', () => {
    setPendingAction({
      action: 'create_trip',
      actionLabel: 'create a trip',
      entityType: 'trip',
      entityName: 'Spring Trip',
    }, '/trips/new')

    const retrieved = getPendingAction()
    expect(retrieved.action).toBe('create_trip')
    expect(retrieved.actionLabel).toBe('create a trip')
    expect(retrieved.entityType).toBe('trip')
    expect(retrieved.entityName).toBe('Spring Trip')
    expect(retrieved.returnTo).toBe('/trips/new')

    clearPendingAction()
    expect(getPendingAction()).toBeNull()
  })

  it('getPendingAction clears after retrieval simulating login flow', () => {
    sessionStorage.setItem(
      'tafera:pending-action',
      JSON.stringify({ action: 'sign_in', returnTo: '/destinations' }),
    )

    // Simulate login page reading pending action
    const pending = getPendingAction()
    expect(pending.action).toBe('sign_in')
    expect(pending.returnTo).toBe('/destinations')

    // Then clear it
    clearPendingAction()
    expect(getPendingAction()).toBeNull()
  })
})
