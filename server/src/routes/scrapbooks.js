'use strict'

const express = require('express')
const env = require('../config/env')
const sessionService = require('../services/sessionService')
const {
  createScrapbookService,
} = require('../services/scrapbookService')
const {
  createScrapbookImageController,
} = require('../controllers/scrapbookImageController')
const {
  createScrapbookJournalController,
} = require('../controllers/scrapbookJournalController')
const {
  createAuthenticate,
} = require('../middlewares/authenticate')
const {
  createCsrfProtection,
} = require('../middlewares/csrfProtection')
const {
  scrapbookImageUpload,
} = require('../middlewares/scrapbookImageUpload')

const createScrapbooksRouter = ({
  scrapbookService,
  sessions = sessionService,
  nodeEnv = env.NODE_ENV,
  User,
} = {}) => {
  const service = scrapbookService || createScrapbookService()
  const imageController = createScrapbookImageController({
    scrapbookImageService: service,
  })
  const journalController = createScrapbookJournalController({
    scrapbookJournalService: service,
  })
  const authenticate = createAuthenticate({ User, sessions, nodeEnv })
  const csrfProtection = createCsrfProtection()

  // Scrapbook operations do not require email verification. Authentication
  // and CSRF protection remain in place for state-changing requests.
  const protectScrapbookWrite = [
    authenticate,
    csrfProtection,
  ]

  const router = express.Router()

  // Journal-level routes
  router.get('/', authenticate, journalController.list)

  router.post('/', ...protectScrapbookWrite, journalController.create)

  router.get('/:journalId', authenticate, journalController.get)

  router.patch(
    '/:journalId',
    ...protectScrapbookWrite,
    journalController.update,
  )

  router.delete(
    '/:journalId',
    ...protectScrapbookWrite,
    journalController.delete,
  )

  router.patch(
    '/:journalId/visibility',
    ...protectScrapbookWrite,
    journalController.setVisibility,
  )

  router.post(
    '/:journalId/trip',
    ...protectScrapbookWrite,
    journalController.linkTrip,
  )

  router.delete(
    '/:journalId/trip',
    ...protectScrapbookWrite,
    journalController.unlinkTrip,
  )

  // Listing a journal's images requires ownership of the journal, or the
  // journal being public. It is authenticated but not publicly readable.
  router.get(
    '/:journalId/images',
    authenticate,
    imageController.list,
  )

  router.post(
    '/:journalId/images',
    ...protectScrapbookWrite,
    scrapbookImageUpload,
    imageController.upload,
  )

  // The static /reorder route is registered before the parameterized
  // /:imageId route so it is never mistaken for an image ID.
  router.patch(
    '/:journalId/images/reorder',
    ...protectScrapbookWrite,
    imageController.reorder,
  )

  router.patch(
    '/:journalId/images/:imageId',
    ...protectScrapbookWrite,
    imageController.update,
  )

  router.delete(
    '/:journalId/images/:imageId',
    ...protectScrapbookWrite,
    imageController.delete,
  )

  return router
}

const scrapbooksRouter = createScrapbooksRouter()

module.exports = scrapbooksRouter
module.exports.createScrapbooksRouter = createScrapbooksRouter
