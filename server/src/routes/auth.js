'use strict'

const express = require('express')
const env = require('../config/env')
const sessionService = require('../services/sessionService')
const { createAuthService } = require('../services/authService')
const { createAuthController } = require('../controllers/authController')
const { createAuthenticate } = require('../middlewares/authenticate')
const {
  createCsrfProtection,
} = require('../middlewares/csrfProtection')

const createAuthRouter = ({
  authService,
  sessions = sessionService,
  nodeEnv = env.NODE_ENV,
  User,
} = {}) => {
  const service =
    authService || createAuthService({ User, sessions, nodeEnv })
  const controller = createAuthController({
    authService: service,
    sessions,
    nodeEnv,
  })
  const authenticate = createAuthenticate({ User, sessions, nodeEnv })
  const csrfProtection = createCsrfProtection()
  const logoutCsrfProtection = createCsrfProtection({
    allowMissingSession: true,
  })

  const router = express.Router()

  router.get('/csrf', controller.csrf)
  router.post('/register', csrfProtection, controller.register)
  router.post('/login', csrfProtection, controller.login)
  router.post('/logout', logoutCsrfProtection, controller.logout)
  router.get('/me', authenticate, controller.me)

  return router
}

const authRouter = createAuthRouter()

module.exports = authRouter
module.exports.createAuthRouter = createAuthRouter
