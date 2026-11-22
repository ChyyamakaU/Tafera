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
  verifyEmail,
  resendVerification,
  uploadProfileImage,
  getProfile,
  updateProfile,
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
    expect(fetch).toHaveBeenCalledWith(`${API_BASE}/api/auth/csrf`, expect.objectContaining({ credentials: 'include' }))
  })

  it('throws when CSRF token fetch fails', async () => {
    fetch.mockResolvedValue(mockResponse(false, 500, { message: 'Server error' }))
    await expect(fetchCsrfToken()).rejects.toThrow('Server error')
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
    expect(fetch).toHaveBeenNthCalledWith(1, `${API_BASE}/api/auth/csrf`, expect.objectContaining({ credentials: 'include' }))
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
    expect(fetch).toHaveBeenNthCalledWith(1, `${API_BASE}/api/auth/csrf`, expect.objectContaining({ credentials: 'include' }))
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

    expect(fetch).toHaveBeenNthCalledWith(1, `${API_BASE}/api/auth/csrf`, expect.objectContaining({ credentials: 'include' }))
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

describe('uploadProfileImage', () => {
  it('posts the device image with CSRF and cookies and returns the response user', async () => {
    const user = { id: 'user-1', profileImage: 'https://images.example/profile.jpg' }
    fetch
      .mockResolvedValueOnce(mockResponse(true, 200, { data: { csrfToken: 'csrf-token' } }))
      .mockResolvedValueOnce(mockResponse(true, 200, { data: { user } }))
    const file = new File(['image-data'], 'profile.jpg', { type: 'image/jpeg' })

    await expect(uploadProfileImage(file)).resolves.toEqual(user)
    expect(fetch).toHaveBeenNthCalledWith(1, `${API_BASE}/api/auth/csrf`, expect.objectContaining({ credentials: 'include' }))
    const [url, options] = fetch.mock.calls[1]
    expect(url).toBe(`${API_BASE}/api/users/me/profile-image`)
    expect(options).toMatchObject({ method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': 'csrf-token' } })
    expect(options.body).toBeInstanceOf(FormData)
    expect(options.body.get('image')).toBe(file)
  })
})

describe('profile API responses', () => {
  it('unwraps the authenticated profile user from the API envelope', async () => {
    const user = { id: 'user-1', fullName: 'Ada Lovelace' }
    fetch.mockResolvedValueOnce(mockResponse(true, 200, { data: { user } }))

    await expect(getProfile()).resolves.toEqual(user)
    expect(fetch).toHaveBeenCalledWith(`${API_BASE}/api/users/me`, expect.objectContaining({
      method: 'GET',
      credentials: 'include',
    }))
  })

  it('unwraps an updated profile user from the API envelope', async () => {
    const user = { id: 'user-1', fullName: 'Ada Lovelace' }
    fetch
      .mockResolvedValueOnce(mockResponse(true, 200, { data: { csrfToken: 'csrf-token' } }))
      .mockResolvedValueOnce(mockResponse(true, 200, { data: { user } }))

    await expect(updateProfile({ fullName: user.fullName })).resolves.toEqual(user)
    expect(fetch.mock.calls[1][0]).toBe(`${API_BASE}/api/users/me`)
    expect(fetch.mock.calls[1][1].headers['X-CSRF-Token']).toBe('csrf-token')
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

describe('verifyEmail', () => {
  it('verifies email with token', async () => {
    fetch
      .mockResolvedValueOnce(mockResponse(true, 200, { data: { csrfToken: 'csrf-token' } }))
      .mockResolvedValueOnce(
        mockResponse(true, 200, { data: { user: { id: '123', email: 'test@example.com', emailVerified: true } } }),
      )

    const result = await verifyEmail({ token: 'abc123' })

    expect(result).toEqual({ user: { id: '123', email: 'test@example.com', emailVerified: true } })
    expect(fetch).toHaveBeenNthCalledWith(1, `${API_BASE}/api/auth/csrf`, expect.objectContaining({ credentials: 'include' }))
    const verifyCall = fetch.mock.calls[1]
    expect(verifyCall[0]).toBe(`${API_BASE}/api/auth/verify-email`)
    expect(verifyCall[1].method).toBe('POST')
    expect(verifyCall[1].headers['X-CSRF-Token']).toBe('csrf-token')
    expect(JSON.parse(verifyCall[1].body)).toEqual({ token: 'abc123' })
  })

  it('handles invalid verification token', async () => {
    fetch
      .mockResolvedValueOnce(mockResponse(true, 200, { data: { csrfToken: 'csrf-token' } }))
      .mockResolvedValueOnce(
        mockResponse(false, 400, {
          message: 'This verification link is invalid or has expired.',
          code: 'VERIFICATION_TOKEN_INVALID',
          status: 400,
        }),
      )

    await expect(verifyEmail({ token: 'invalid' })).rejects.toThrow(
      'This verification link is invalid or has expired.',
    )
  })
})

describe('resendVerification', () => {
  it('resends verification email successfully', async () => {
    fetch
      .mockResolvedValueOnce(mockResponse(true, 200, { data: { csrfToken: 'csrf-token' } }))
      .mockResolvedValueOnce(
        mockResponse(true, 202, { data: { alreadyVerified: false, sent: true } }),
      )

    const result = await resendVerification()

    expect(result).toEqual({ alreadyVerified: false, sent: true })
    expect(fetch).toHaveBeenNthCalledWith(1, `${API_BASE}/api/auth/csrf`, expect.objectContaining({ credentials: 'include' }))
    const resendCall = fetch.mock.calls[1]
    expect(resendCall[0]).toBe(`${API_BASE}/api/auth/verify-email/resend`)
    expect(resendCall[1].method).toBe('POST')
    expect(resendCall[1].headers['X-CSRF-Token']).toBe('csrf-token')
  })

  it('handles already verified', async () => {
    fetch
      .mockResolvedValueOnce(mockResponse(true, 200, { data: { csrfToken: 'csrf-token' } }))
      .mockResolvedValueOnce(
        mockResponse(true, 200, { data: { alreadyVerified: true, sent: false } }),
      )

    const result = await resendVerification()

    expect(result).toEqual({ alreadyVerified: true, sent: false })
  })

  it('handles resend rate limited', async () => {
    fetch
      .mockResolvedValueOnce(mockResponse(true, 200, { data: { csrfToken: 'csrf-token' } }))
      .mockResolvedValueOnce(
        mockResponse(false, 429, {
          message: 'Please wait before requesting another verification email.',
          code: 'EMAIL_VERIFICATION_RATE_LIMITED',
          status: 429,
        }),
      )

    await expect(resendVerification()).rejects.toThrow(
      'Please wait before requesting another verification email.',
    )
  })
})
