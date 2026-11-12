'use strict'

const express = require('express')
const env = require('../config/env')
const sessionService = require('../services/sessionService')
const {
  createDestinationService,
} = require('../services/destinationService')
const {
  createDestinationController,
} = require('../controllers/destinationController')
const {
  createDestinationImageController,
} = require('../controllers/destinationImageController')
const {
  createAuthenticate,
} = require('../middlewares/authenticate')
const {
  createCsrfProtection,
} = require('../middlewares/csrfProtection')
const {
  createRequireAdmin,
} = require('../middlewares/requireAdmin')
const {
  destinationImageUpload,
} = require('../middlewares/destinationImageUpload')

const createDestinationsRouter = ({
  destinationService,
  sessions = sessionService,
  nodeEnv = env.NODE_ENV,
  User,
} = {}) => {
  const service = destinationService || createDestinationService()
  const controller = createDestinationController({
    destinationService: service,
  })
  const imageController = createDestinationImageController({
    destinationImageService: service,
  })
  const authenticate = createAuthenticate({ User, sessions, nodeEnv })
  const csrfProtection = createCsrfProtection()
  const requireAdmin = createRequireAdmin()

  const protectAdminWrite = [
    authenticate,
    csrfProtection,
    requireAdmin,
  ]

  const router = express.Router()

  // Destination pages are public reads. No session, CSRF or verified-email
  // middleware applies.
  router.get('/', controller.list)
  router.get('/:idOrSlug', controller.detail)

  // Image listing is public and consistent with the published destination
  // gallery policy: only images for published destinations are returned.
  router.get('/:destinationId/images', imageController.list)

  // Image-management write routes require authentication, CSRF and admin.
  // The static /reorder route is registered before the parameterized
  // /:imageId route so it is never mistaken for an image ID.
  router.post(
    '/:destinationId/images',
    ...protectAdminWrite,
    destinationImageUpload,
    imageController.upload,
  )
  router.patch(
    '/:destinationId/images/reorder',
    ...protectAdminWrite,
    imageController.reorder,
  )
  router.patch(
    '/:destinationId/images/:imageId',
    ...protectAdminWrite,
    imageController.update,
  )
  router.delete(
    '/:destinationId/images/:imageId',
    ...protectAdminWrite,
    imageController.delete,
  )

  return router
}

const destinationsRouter = createDestinationsRouter()

module.exports = destinationsRouter
module.exports.createDestinationsRouter = createDestinationsRouter
