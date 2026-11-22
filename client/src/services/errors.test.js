import { describe, it, expect, vi } from 'vitest'
import {
  getErrorMessage,
  getFieldErrors,
  formatRetryAfter,
  CODE_MESSAGES,
  STATUS_MESSAGES,
} from './errors'

describe('getErrorMessage', () => {
  it('maps invalid credentials to a user-friendly message', () => {
    const err = new Error('Invalid email or password.')
    err.code = 'INVALID_CREDENTIALS'
    err.status = 401

    expect(getErrorMessage(err)).toBe(
      'The email or password you entered is incorrect. Please check your details and try again.'
    )
  })

  it('maps email-in-use to a sign-in suggestion', () => {
    const err = new Error('An account with this email already exists.')
    err.code = 'EMAIL_IN_USE'
    err.status = 409

    expect(getErrorMessage(err)).toBe(
      'An account with this email address already exists. Try signing in instead.'
    )
  })

  it('maps session-invalid to an expired-session message', () => {
    const err = new Error('Your session is no longer valid. Please sign in again.')
    err.code = 'SESSION_INVALID'
    err.status = 401

    expect(getErrorMessage(err)).toBe('Your session has expired. Please sign in again.')
  })

  it('maps auth-required to a sign-in prompt', () => {
    const err = new Error('Authentication is required.')
    err.code = 'AUTH_REQUIRED'
    err.status = 401

    expect(getErrorMessage(err)).toBe('Please sign in to continue.')
  })

  it('maps email-verification-required to a verification prompt', () => {
    const err = new Error('Please verify your email address before performing this action.')
    err.code = 'EMAIL_VERIFICATION_REQUIRED'
    err.status = 403

    expect(getErrorMessage(err)).toBe('Please verify your email address before continuing.')
  })

  it('maps invalid verification token with an offer to request another', () => {
    const err = new Error('This verification link is invalid or has expired.')
    err.code = 'VERIFICATION_TOKEN_INVALID'
    err.status = 400

    expect(getErrorMessage(err)).toBe(
      'This verification link is invalid or has expired. You can request another verification email.'
    )
  })

  it('maps rate-limited with retry-after to a waiting period', () => {
    const err = new Error('Too many requests.')
    err.code = 'RATE_LIMITED'
    err.status = 429
    err.retryAfterSeconds = 90

    expect(getErrorMessage(err)).toBe("You've made too many attempts. Please wait about 2 minutes before trying again.")
  })

  it('maps rate-limited without retry-after to the generic message', () => {
    const err = new Error('Too many requests.')
    err.code = 'RATE_LIMITED'
    err.status = 429

    expect(getErrorMessage(err)).toBe(
      "You've made too many attempts. Please wait a little while before trying again."
    )
  })

  it('maps email-verification-rate-limited with retry-after', () => {
    const err = new Error('Please wait before requesting another verification email.')
    err.code = 'EMAIL_VERIFICATION_RATE_LIMITED'
    err.status = 429
    err.retryAfterSeconds = 120

    expect(getErrorMessage(err)).toBe("You've made too many attempts. Please wait about 2 minutes before trying again.")
  })

  it('maps validation errors to a field-correction prompt', () => {
    const err = new Error('The request could not be validated.')
    err.code = 'VALIDATION_ERROR'
    err.status = 400

    expect(getErrorMessage(err)).toBe('Please check the form and correct the errors below.')
  })

  it('maps forbidden to an authorization message', () => {
    const err = new Error('You are not allowed to perform this action.')
    err.code = 'FORBIDDEN'
    err.status = 403

    expect(getErrorMessage(err)).toBe('You are not allowed to perform this action.')
  })

  it('maps not-found to a resource message', () => {
    const err = new Error('Post not found.')
    err.code = 'POST_NOT_FOUND'
    err.status = 404

    expect(getErrorMessage(err)).toBe('This post could not be found.')
  })

  it('maps service-unavailable to a retry-later message', () => {
    const err = new Error('The service is temporarily unavailable.')
    err.code = 'SERVICE_UNAVAILABLE'
    err.status = 503

    expect(getErrorMessage(err)).toBe('The server is temporarily unavailable. Please try again later.')
  })

  it('maps internal errors to an unexpected-error message', () => {
    const err = new Error('Something broke internally')
    err.code = 'INTERNAL_ERROR'
    err.status = 500

    expect(getErrorMessage(err)).toBe('An unexpected error occurred. Please try again later.')
  })

  it('maps network errors to a connection message', () => {
    const err = new Error('fetch failed')
    err.code = 'NETWORK_ERROR'
    err.status = 0
    err.isNetworkError = true

    expect(getErrorMessage(err)).toBe(
      'Unable to connect to the server. Please check your internet connection and try again.'
    )
  })

  it('maps an unknown code by HTTP status', () => {
    const err = new Error('Something went wrong')
    err.status = 403

    expect(getErrorMessage(err)).toBe('You are not allowed to perform this action.')
  })

  it('uses the backend message when no specific mapping exists', () => {
    const err = new Error('A custom operational message.')
    err.code = 'CUSTOM_CODE'
    err.status = 400

    expect(getErrorMessage(err)).toBe('A custom operational message.')
  })

  it('falls back to a generic message for unexpected errors', () => {
    const err = new Error()
    delete err.message

    expect(getErrorMessage(err)).toBe('An unexpected error occurred. Please try again later.')
  })

  it('returns the fallback message for null or undefined input', () => {
    expect(getErrorMessage(null)).toBe('An unexpected error occurred. Please try again later.')
    expect(getErrorMessage(undefined)).toBe('An unexpected error occurred. Please try again later.')
  })

  it('surfaces a frontend error message even without a code', () => {
    const err = new Error('Something went wrong on the client.')

    expect(getErrorMessage(err)).toBe('Something went wrong on the client.')
  })
})

describe('getFieldErrors', () => {
  it('extracts field-level validation details', () => {
    const err = new Error('The request could not be validated.')
    err.code = 'VALIDATION_ERROR'
    err.status = 400
    err.details = [
      { field: 'email', message: 'Enter a valid email address.' },
      { field: 'password', message: 'Password must be at least 12 characters long.' },
    ]

    expect(getFieldErrors(err)).toEqual([
      { field: 'email', message: 'Enter a valid email address.' },
      { field: 'password', message: 'Password must be at least 12 characters long.' },
    ])
  })

  it('returns an empty array when there are no details', () => {
    const err = new Error('Failed')
    err.code = 'INTERNAL_ERROR'
    err.status = 500

    expect(getFieldErrors(err)).toEqual([])
  })

  it('returns an empty array for null input', () => {
    expect(getFieldErrors(null)).toEqual([])
  })
})

describe('formatRetryAfter', () => {
  it('converts seconds to minutes when over a minute', () => {
    expect(formatRetryAfter(90)).toBe('2 minutes')
    expect(formatRetryAfter(120)).toBe('2 minutes')
  })

  it('converts seconds to seconds when under a minute', () => {
    expect(formatRetryAfter(30)).toBe('30 seconds')
    expect(formatRetryAfter(1)).toBe('1 second')
  })

  it('returns null for invalid input', () => {
    expect(formatRetryAfter(0)).toBeNull()
    expect(formatRetryAfter(-5)).toBeNull()
    expect(formatRetryAfter(NaN)).toBeNull()
    expect(formatRetryAfter(undefined)).toBeNull()
  })
})

describe('message maps', () => {
  it('contains the required authentication messages', () => {
    expect(CODE_MESSAGES.INVALID_CREDENTIALS).toContain('incorrect')
    expect(CODE_MESSAGES.EMAIL_IN_USE).toContain('Try signing in instead')
    expect(CODE_MESSAGES.SESSION_INVALID).toContain('sign in again')
    expect(CODE_MESSAGES.VERIFICATION_TOKEN_INVALID).toContain('invalid or has expired')
  })

  it('contains the required rate-limiting message', () => {
    expect(CODE_MESSAGES.RATE_LIMITED).toContain('too many attempts')
  })

  it('contains validation and network messages', () => {
    expect(CODE_MESSAGES.VALIDATION_ERROR).toContain('correct the errors')
    expect(CODE_MESSAGES.NETWORK_ERROR).toContain('internet connection')
  })
})
