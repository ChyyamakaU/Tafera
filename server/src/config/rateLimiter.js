const { ipKeyGenerator, rateLimit } = require('express-rate-limit')
const { RedisStore } = require('rate-limit-redis')
const env = require('./env')
const EMAIL_VERIFICATION = require('./emailVerification')
const { client } = require('./redis')

const WINDOW_MS = 15 * 60 * 1000
const MAX_REQUESTS = 300

// Login rate limiting targets brute-force attempts. The key combines the
// client IP with the login email so a single IP cannot rapidly guess many
// accounts and a single account cannot be hammered from one IP. When no email
// is present the request falls back to an IP-only key.
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_MAX_REQUESTS = 10

// Registration rate limiting curbs automated account creation. It is keyed by
// IP alone because there is no existing account to tie the attempt to.
const REGISTRATION_WINDOW_MS = 15 * 60 * 1000
const REGISTRATION_MAX_REQUESTS = 5

const rateLimitedResponse = (res, retryAfter, code, message) => {
  res.set('Retry-After', String(retryAfter))
  res.set('Cache-Control', 'no-store')
  res.status(429).json({
    error: {
      code,
      message,
      status: 429,
    },
  })
}

const retryAfterFrom = (resetTime, windowMs) => {
  if (resetTime instanceof Date) {
    return Math.max(0, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
  }
  return Math.ceil(windowMs / 1000)
}

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

// Login rate limiting targets brute-force attempts. The key combines the
// client IP with the login email so a single IP cannot rapidly guess many
// accounts and a single account cannot be hammered from one IP. When no email
// is present the request falls back to an IP-only key.
const createLoginLimiter = ({
  client: redisClient = client,
  prefix = `${env.SESSION_NAMESPACE}:login:`,
  windowMs = LOGIN_WINDOW_MS,
  limit = LOGIN_MAX_REQUESTS,
} = {}) => {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    passOnStoreError: false,
    validate: { trustProxy: false },
    keyGenerator: (req) => {
      const email = req.body && req.body.email
      return typeof email === 'string' && email.length > 0
        ? `${prefix}ip:${ipKeyGenerator(req.ip)}:email:${email.toLowerCase()}`
        : `${prefix}ip:${ipKeyGenerator(req.ip)}`
    },
    store: new RedisStore({
      prefix,
      sendCommand: (...args) => redisClient.sendCommand(args),
    }),
    handler: (req, res, next, options) => {
      const resetTime = req.rateLimit && req.rateLimit.resetTime
      const retryAfter = retryAfterFrom(resetTime, options.windowMs)
      rateLimitedResponse(
        res,
        retryAfter,
        'LOGIN_RATE_LIMITED',
        'Too many login attempts. Please try again later.',
      )
    },
  })
}

// Registration rate limiting curbs automated account creation. It is keyed by
// IP alone because there is no existing account to tie the attempt to.
const createRegistrationLimiter = ({
  client: redisClient = client,
  prefix = `${env.SESSION_NAMESPACE}:registration:`,
  windowMs = REGISTRATION_WINDOW_MS,
  limit = REGISTRATION_MAX_REQUESTS,
} = {}) => {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    passOnStoreError: false,
    validate: { trustProxy: false },
    keyGenerator: (req) =>
      `${prefix}ip:${ipKeyGenerator(req.ip)}`,
    store: new RedisStore({
      prefix,
      sendCommand: (...args) => redisClient.sendCommand(args),
    }),
    handler: (req, res, next, options) => {
      const resetTime = req.rateLimit && req.rateLimit.resetTime
      const retryAfter = retryAfterFrom(resetTime, options.windowMs)
      rateLimitedResponse(
        res,
        retryAfter,
        'REGISTRATION_RATE_LIMITED',
        'Too many registration attempts. Please try again later.',
      )
    },
  })
}

module.exports.createLoginLimiter = createLoginLimiter
module.exports.createRegistrationLimiter = createRegistrationLimiter
