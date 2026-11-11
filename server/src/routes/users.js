'use strict'

const express = require('express')
const env = require('../config/env')
const sessionService = require('../services/sessionService')
const { createProfileService } = require('../services/profileService')
const { createPostService } = require('../services/postService')
const {
  createProfileController,
} = require('../controllers/profileController')
const { createPostController } = require('../controllers/postController')
const { createAuthenticate } = require('../middlewares/authenticate')
const { createCsrfProtection } = require('../middlewares/csrfProtection')

const createUsersRouter = ({
  profileService,
  postService,
  sessions = sessionService,
  nodeEnv = env.NODE_ENV,
  User,
} = {}) => {
  const service = profileService || createProfileService({ User })
  const controller = createProfileController({ profileService: service })
  const posts = postService || createPostService({ User })
  const postController = createPostController({ postService: posts })
  const authenticate = createAuthenticate({ User, sessions, nodeEnv })
  const csrfProtection = createCsrfProtection()

  const router = express.Router()

  // /me must be registered before /:userId so it is never treated as an ID.
  router.get('/me', authenticate, controller.me)
  // Updating a profile is account management, not a protected community
  // action, so it deliberately does not require a verified email. CSRF and
  // session authentication still apply.
  router.patch('/me', authenticate, csrfProtection, controller.updateMe)
  // Public user-post listings are scoped by the user ID in the path. They do
  // not require a session or a verified email.
  router.get('/:userId/posts', postController.listByUser)
  router.get('/:userId', controller.publicProfile)

  return router
}

const usersRouter = createUsersRouter()

module.exports = usersRouter
module.exports.createUsersRouter = createUsersRouter
