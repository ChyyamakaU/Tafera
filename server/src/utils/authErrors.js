'use strict'

// Authentication failures use explicit, non-sensitive messages. Error details
// are always safe to return to the client and never include database values,
// password material or internal identifiers.
class AuthError extends Error {
  constructor({
    message = 'Authentication is required.',
    code = 'AUTH_REQUIRED',
    status = 401,
    details,
  } = {}) {
    super(message)
    this.name = 'AuthError'
    this.code = code
    this.status = status
    this.expose = true

    if (details !== undefined) {
      this.details = details
    }
  }
}

class AuthenticationRequiredError extends AuthError {
  constructor(message = 'Authentication is required.') {
    super({ message, code: 'AUTH_REQUIRED', status: 401 })
    this.name = 'AuthenticationRequiredError'
  }
}

class SessionInvalidError extends AuthError {
  constructor(
    message = 'Your session is no longer valid. Please sign in again.',
  ) {
    super({ message, code: 'SESSION_INVALID', status: 401 })
    this.name = 'SessionInvalidError'
  }
}

class InvalidCredentialsError extends AuthError {
  constructor() {
    super({
      message: 'Invalid email or password.',
      code: 'INVALID_CREDENTIALS',
      status: 401,
    })
    this.name = 'InvalidCredentialsError'
  }
}

class AccountInactiveError extends AuthError {
  constructor() {
    super({
      message: 'This account is not eligible to sign in.',
      code: 'ACCOUNT_INACTIVE',
      status: 403,
    })
    this.name = 'AccountInactiveError'
  }
}

class EmailInUseError extends AuthError {
  constructor() {
    super({
      message: 'An account with this email already exists.',
      code: 'EMAIL_IN_USE',
      status: 409,
    })
    this.name = 'EmailInUseError'
  }
}

class CsrfError extends AuthError {
  constructor() {
    super({
      message: 'Invalid or missing CSRF token.',
      code: 'CSRF_TOKEN_INVALID',
      status: 403,
    })
    this.name = 'CsrfError'
  }
}

class ValidationError extends AuthError {
  constructor(details) {
    super({
      message: 'The request could not be validated.',
      code: 'VALIDATION_ERROR',
      status: 400,
      details,
    })
    this.name = 'ValidationError'
  }
}

module.exports = {
  AuthError,
  AuthenticationRequiredError,
  SessionInvalidError,
  InvalidCredentialsError,
  AccountInactiveError,
  EmailInUseError,
  CsrfError,
  ValidationError,
}
