'use strict'

const express = require('express')
const {
  createDestinationService,
} = require('../services/destinationService')
const {
  createDestinationController,
} = require('../controllers/destinationController')

const createDestinationsRouter = ({ destinationService } = {}) => {
  const service = destinationService || createDestinationService()
  const controller = createDestinationController({
    destinationService: service,
  })

  const router = express.Router()

  // Destination pages are public reads. No session, CSRF or verified-email
  // middleware applies.
  router.get('/', controller.list)
  router.get('/:idOrSlug', controller.detail)

  return router
}

const destinationsRouter = createDestinationsRouter()

module.exports = destinationsRouter
module.exports.createDestinationsRouter = createDestinationsRouter
