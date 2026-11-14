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
  createAuthenticate,
} = require('../middlewares/authenticate')
const {
  createCsrfProtection,
} = require('../middlewares/csrfProtection')
const {
  createRequireVerifiedEmail,
} = require('../middlewares/requireVerifiedEmail')
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
  const authenticate = createAuthenticate({ User, sessions, nodeEnv })
  const csrfProtection = createCsrfProtection()
  const requireVerifiedEmail = createRequireVerifiedEmail({ User })

  const protectScrapbookWrite = [
    authenticate,
    csrfProtection,
    requireVerifiedEmail,
  ]

  const router = express.Router()

  // Listing a journal's images requires ownership of the journal, so it is
  // authenticated but not publicly readable.
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
