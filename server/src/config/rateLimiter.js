const rateLimit = require('express-rate-limit')
const { RedisStore } = require('rate-limit-redis')
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

module.exports = createApiLimiter
