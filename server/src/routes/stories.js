'use strict'

const express = require('express')
const env = require('../config/env')
const sessionService = require('../services/sessionService')
const { createStoryService } = require('../services/storyService')
const { createStoryController } = require('../controllers/storyController')
const { createAuthenticate } = require('../middlewares/authenticate')
const { createCsrfProtection } = require('../middlewares/csrfProtection')
const {
  createRequireVerifiedEmail,
} = require('../middlewares/requireVerifiedEmail')
const { createRequireAdmin } = require('../middlewares/requireAdmin')
const {
  destinationImageUpload,
} = require('../middlewares/destinationImageUpload')

const createStoriesRouter = ({
  storyService,
  sessions = sessionService,
  nodeEnv = env.NODE_ENV,
  User,
} = {}) => {
  const service = storyService || createStoryService()
  const controller = createStoryController({ storyService: service })
  const authenticate = createAuthenticate({ User, sessions, nodeEnv })
  const csrfProtection = createCsrfProtection()
  const requireVerifiedEmail = createRequireVerifiedEmail({ User })
  const requireAdmin = createRequireAdmin()

  const protectAdminRead = [authenticate, requireVerifiedEmail, requireAdmin]
  const protectAdminWrite = [
    authenticate,
    csrfProtection,
    requireVerifiedEmail,
    requireAdmin,
  ]

  const router = express.Router()

  // Public homepage editorial stories feed.
  router.get('/', controller.listFeatured)

  // Static admin routes registered before /:storyId so they are never
  // interpreted as story UUIDs.
  router.get('/admin', ...protectAdminRead, controller.listAdmin)
  router.put('/reorder', ...protectAdminWrite, controller.reorder)

  router.post('/', ...protectAdminWrite, controller.create)
  router.post(
    '/:storyId/cover',
    ...protectAdminWrite,
    destinationImageUpload,
    controller.uploadCover,
  )
  router.patch('/:storyId', ...protectAdminWrite, controller.update)
  router.delete('/:storyId', ...protectAdminWrite, controller.remove)

  return router
}

const storiesRouter = createStoriesRouter()

module.exports = storiesRouter
module.exports.createStoriesRouter = createStoriesRouter
