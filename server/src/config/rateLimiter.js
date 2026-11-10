const { ipKeyGenerator, rateLimit } = require('express-rate-limit')
const { RedisStore } = require('rate-limit-redis')
const env = require('./env')
const EMAIL_VERIFICATION = require('./emailVerification')
const { client } = require('./redis')

const WINDOW_MS = 15 * 60 * 1000
const MAX_REQUESTS = 300

const isMonitoringPath = (path) => {
  const normalized = path.replace(/\/+$/, '') || '/'
  return normalized === '/api/health' || normalized === '/api/ready'
}

const createApiLimiter = () => {
  // The limiter is created after Redis connects during startup. Falling back to
  // in-memory storage would silently weaken limits in multi-instance
  // deployments, so fail loudly instead.
  if (!client.isOpen) {
    throw new Error(
      'Redis must be connected before the API rate limiter is created; refusing to fall back to in-memory storage.',
    )
  }

  return rateLimit({
    windowMs: WINDOW_MS,
    limit: MAX_REQUESTS,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Fail closed: if Redis cannot be reached, requests are rejected by the
    // central error handler instead of silently bypassing rate limiting.
    passOnStoreError: false,
    // TRUST_PROXY is validated and parsed by config/env.js. Allow the explicit
    // `true` value there without express-rate-limit rejecting at request time.
    validate: { trustProxy: false },
    skip: (req) => isMonitoringPath(req.path),
    store: new RedisStore({
      sendCommand: (...args) => client.sendCommand(args),
    }),
    handler: (req, res, next, options) => {
      const resetTime = req.rateLimit && req.rateLimit.resetTime
      const retryAfter =
        resetTime instanceof Date
          ? Math.max(0, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
          : Math.ceil(options.windowMs / 1000)

      res.set('Retry-After', String(retryAfter))
      res.set('Cache-Control', 'no-store')
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please try again later.',
          status: 429,
        },
      })
    },
  })
}

// Verification-email requests are limited per authenticated account (not just
// per IP) so shared networks cannot exhaust another user's allowance and a
// single account cannot trigger unlimited mail. The database cooldown in the
// verification service remains the authoritative per-account throttle.
const createEmailVerificationLimiter = ({
  client: redisClient = client,
  prefix = `${env.SESSION_NAMESPACE}:email-verification:`,
  windowMs = EMAIL_VERIFICATION.resendWindowMs,
  limit = EMAIL_VERIFICATION.resendMaxRequests,
} = {}) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    passOnStoreError: false,
    validate: { trustProxy: false },
    keyGenerator: (req) =>
      req.auth && req.auth.userId
        ? `user:${req.auth.userId}`
        : ipKeyGenerator(req.ip),
    store: new RedisStore({
      prefix,
      sendCommand: (...args) => redisClient.sendCommand(args),
    }),
    handler: (req, res, next, options) => {
      const resetTime = req.rateLimit && req.rateLimit.resetTime
      const retryAfter =
        resetTime instanceof Date
          ? Math.max(0, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
          : Math.ceil(options.windowMs / 1000)

      res.set('Retry-After', String(retryAfter))
      res.set('Cache-Control', 'no-store')
      res.status(429).json({
        error: {
          code: 'EMAIL_VERIFICATION_RATE_LIMITED',
          message:
            'Too many verification email requests. Please try again later.',
          status: 429,
        },
      })
    },
  })

module.exports = createApiLimiter
module.exports.createApiLimiter = createApiLimiter
module.exports.createEmailVerificationLimiter =
  createEmailVerificationLimiter
