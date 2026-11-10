'use strict'

const crypto = require('crypto')

const CSRF_TOKEN_CONTEXT = 'tafera:csrf:v1'
const SAFE_METHODS = Object.freeze(new Set(['GET', 'HEAD', 'OPTIONS']))
const CSRF_HEADER = 'x-csrf-token'

// The session stores a random csrfSecret. The token sent to the client is
// derived from that secret with HMAC so the raw secret never leaves the server.
const deriveCsrfToken = (csrfSecret) => {
  if (typeof csrfSecret !== 'string' || csrfSecret.length === 0) {
    return null
  }

  return crypto
    .createHmac('sha256', csrfSecret)
    .update(CSRF_TOKEN_CONTEXT)
    .digest('base64url')
}

const getCsrfToken = (session) =>
  session ? deriveCsrfToken(session.csrfSecret) : null

const tokensMatch = (expected, actual) => {
  if (typeof expected !== 'string' || typeof actual !== 'string') {
    return false
  }

  const expectedBuffer = Buffer.from(expected, 'utf8')
  const actualBuffer = Buffer.from(actual, 'utf8')

  if (expectedBuffer.length !== actualBuffer.length) {
    return false
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer)
}

const isValidCsrfToken = (session, token) => {
  if (!session || typeof session.csrfSecret !== 'string') return false

  return tokensMatch(deriveCsrfToken(session.csrfSecret), token)
}

const getSubmittedCsrfToken = (req) => {
  const headerToken = req.get ? req.get(CSRF_HEADER) : undefined

  if (typeof headerToken === 'string' && headerToken.length > 0) {
    return headerToken
  }

  const bodyToken = req.body && req.body._csrf

  return typeof bodyToken === 'string' ? bodyToken : undefined
}

module.exports = {
  CSRF_TOKEN_CONTEXT,
  CSRF_HEADER,
  SAFE_METHODS,
  deriveCsrfToken,
  getCsrfToken,
  isValidCsrfToken,
  getSubmittedCsrfToken,
}
