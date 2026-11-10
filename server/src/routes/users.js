'use strict'

const express = require('express')
const env = require('../config/env')
const sessionService = require('../services/sessionService')
const { createProfileService } = require('../services/profileService')
const {
  createProfileController,
} = require('../controllers/profileController')
const { createAuthenticate } = require('../middlewares/authenticate')
const { createCsrfProtection } = require('../middlewares/csrfProtection')

const createUsersRouter = ({
  profileService,
  sessions = sessionService,
  nodeEnv = env.NODE_ENV,
  User,
} = {}) => {
  const service = profileService || createProfileService({ User })
  const controller = createProfileController({ profileService: service })
  const authenticate = createAuthenticate({ User, sessions, nodeEnv })
  const csrfProtection = createCsrfProtection()

  const router = express.Router()

  // /me must be registered before /:userId so it is never treated as an ID.
  router.get('/me', authenticate, controller.me)
  // Updating a profile is account management, not a protected community
  // action, so it deliberately does not require a verified email. CSRF and
  // session authentication still apply.
  router.patch('/me', authenticate, csrfProtection, controller.updateMe)
  router.get('/:userId', controller.publicProfile)

  return router
}

const usersRouter = createUsersRouter()

module.exports = usersRouter
module.exports.createUsersRouter = createUsersRouter
