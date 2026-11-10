'use strict'

const express = require('express')
const env = require('../config/env')
const { client: defaultRedisClient } = require('../config/redis')
const sessionService = require('../services/sessionService')
const { createAuthService } = require('../services/authService')
const {
  emailVerificationService,
} = require('../services/emailVerificationService')
const { createAuthController } = require('../controllers/authController')
const { createAuthenticate } = require('../middlewares/authenticate')
const {
  createCsrfProtection,
} = require('../middlewares/csrfProtection')
const {
  createEmailVerificationLimiter,
} = require('../config/rateLimiter')

const createAuthRouter = ({
  authService,
  sessions = sessionService,
  nodeEnv = env.NODE_ENV,
  User,
  verificationService = emailVerificationService,
  redisClient = defaultRedisClient,
  rateLimitPrefix,
  resendRateLimit = {},
} = {}) => {
  const service =
    authService ||
    createAuthService({
      User,
      sessions,
      verifications: verificationService,
      nodeEnv,
    })
  const controller = createAuthController({
    authService: service,
    sessions,
    verifications: verificationService,
    nodeEnv,
  })
  const authenticate = createAuthenticate({ User, sessions, nodeEnv })
  const csrfProtection = createCsrfProtection()
  const logoutCsrfProtection = createCsrfProtection({
    allowMissingSession: true,
  })
  const resendLimiter = createEmailVerificationLimiter({
    client: redisClient,
    ...(rateLimitPrefix ? { prefix: rateLimitPrefix } : {}),
    ...resendRateLimit,
  })

  const router = express.Router()

  router.get('/csrf', controller.csrf)
  router.post('/register', csrfProtection, controller.register)
  router.post('/login', csrfProtection, controller.login)
  router.post('/logout', logoutCsrfProtection, controller.logout)
  router.get('/me', authenticate, controller.me)
  // Verification uses the emailed bearer token, not the session cookie, so it
  // deliberately does not require CSRF or an authenticated session.
  router.post('/verify-email', controller.verifyEmail)
  router.post(
    '/verify-email/resend',
    authenticate,
    csrfProtection,
    resendLimiter,
    controller.resendVerification,
  )

  return router
}

const authRouter = createAuthRouter()

module.exports = authRouter
module.exports.createAuthRouter = createAuthRouter
