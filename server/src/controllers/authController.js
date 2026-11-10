'use strict'

const env = require('../config/env')
const sessionService = require('../services/sessionService')
const { createAuthService } = require('../services/authService')
const { parseRegistration, parseLogin } = require('../validators/auth')
const { toSafeUser } = require('../utils/safeUser')
const { getCsrfToken } = require('../utils/csrf')

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next)
}

const noStore = (res) => res.set('Cache-Control', 'no-store')

const createAuthController = ({
  authService,
  sessions = sessionService,
  nodeEnv = env.NODE_ENV,
} = {}) => {
  const service =
    authService || createAuthService({ sessions, nodeEnv })

  return {
    register: asyncHandler(async (req, res) => {
      const input = parseRegistration(req.body)
      const result = await service.register(input, { req, res })

      noStore(res).status(201).json({ data: result })
    }),

    login: asyncHandler(async (req, res) => {
      const input = parseLogin(req.body)
      const result = await service.login(input, { req, res })

      noStore(res).status(200).json({ data: result })
    }),

    logout: asyncHandler(async (req, res) => {
      await service.logout({ req, res })

      noStore(res).status(204).end()
    }),

    me: (req, res) => {
      noStore(res).status(200).json({
        data: { user: toSafeUser(req.user) },
      })
    },

    csrf: asyncHandler(async (req, res) => {
      if (!req.session || typeof req.session.csrfSecret !== 'string') {
        await sessions.createAnonymousSession(req, { res, nodeEnv })
      }

      noStore(res).status(200).json({
        data: { csrfToken: getCsrfToken(req.session) },
      })
    }),
  }
}

module.exports = { createAuthController }
