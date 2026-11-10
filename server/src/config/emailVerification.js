'use strict'

const env = require('./env')

const MINUTE = 60 * 1000

const EMAIL_VERIFICATION = Object.freeze({
  tokenTtlMs: env.EMAIL_VERIFICATION.tokenTtlMs,
  // A resend cannot happen more often than this for a single account. This is
  // independent of the HTTP rate limiter and still applies when several API
  // instances share one Redis rate-limit store.
  resendCooldownMs: MINUTE,
  resendWindowMs: 15 * MINUTE,
  resendMaxRequests: 3,
  frontendPath: '/verify-email',
})

module.exports = EMAIL_VERIFICATION
