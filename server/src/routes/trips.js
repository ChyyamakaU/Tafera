'use strict'

const express = require('express')
const env = require('../config/env')
const sessionService = require('../services/sessionService')
const { createTripService } = require('../services/tripService')
const {
  createTripController,
} = require('../controllers/tripController')
const {
  createAuthenticate,
} = require('../middlewares/authenticate')
const {
  createOptionalAuthenticate,
} = require('../middlewares/optionalAuthenticate')
const {
  createCsrfProtection,
} = require('../middlewares/csrfProtection')
const {
  createRequireVerifiedEmail,
} = require('../middlewares/requireVerifiedEmail')

const createTripsRouter = ({
  tripService,
  sessions = sessionService,
  nodeEnv = env.NODE_ENV,
  User,
} = {}) => {
  const service = tripService || createTripService()
  const controller = createTripController({ tripService: service })
  const authenticate = createAuthenticate({ User, sessions, nodeEnv })
  const optionalAuthenticate = createOptionalAuthenticate({
    User,
    sessions,
    nodeEnv,
  })
  const csrfProtection = createCsrfProtection()
  const requireVerifiedEmail = createRequireVerifiedEmail({ User })

  const protectWrite = [
    authenticate,
    csrfProtection,
    requireVerifiedEmail,
  ]

  const router = express.Router()

  router.post('/', ...protectWrite, controller.create)
  router.get('/', authenticate, controller.list)
  // Public detail: non-draft trips are readable by anyone, while an
  // authenticated owner may also read a draft.
  router.get('/:tripId', optionalAuthenticate, controller.detail)
  router.patch('/:tripId', ...protectWrite, controller.update)
  router.delete('/:tripId', ...protectWrite, controller.remove)

  router.post('/:tripId/stops', ...protectWrite, controller.addStop)
  // Static route is registered before the parameterized stop route.
  router.put(
    '/:tripId/stops/reorder',
    ...protectWrite,
    controller.reorderStops,
  )
  router.patch(
    '/:tripId/stops/:stopId',
    ...protectWrite,
    controller.updateStop,
  )
  router.delete(
    '/:tripId/stops/:stopId',
    ...protectWrite,
    controller.removeStop,
  )

  return router
}

const tripsRouter = createTripsRouter()

module.exports = tripsRouter
module.exports.createTripsRouter = createTripsRouter
