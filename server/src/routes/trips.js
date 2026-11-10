'use strict'

const express = require('express')
const env = require('../config/env')
const sessionService = require('../services/sessionService')
const { createTripService } = require('../services/tripService')
const {
  createTripController,
} = require('../controllers/tripController')
const {
  createTripParticipationController,
} = require('../controllers/tripParticipationController')
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
  tripParticipationService,
  sessions = sessionService,
  nodeEnv = env.NODE_ENV,
  User,
} = {}) => {
  const service = tripService || createTripService()
  const controller = createTripController({ tripService: service })
  // The participation controller defaults to the shared service singleton;
  // an explicitly injected service is only needed by tests.
  const participationController = createTripParticipationController(
    tripParticipationService ? { tripParticipationService } : {},
  )
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

  // Participation routes are all multi-segment, so they cannot shadow the
  // single-segment `GET /:tripId` trip detail route.
  router.post(
    '/:tripId/join',
    ...protectWrite,
    participationController.requestJoin,
  )
  // Leaving or cancelling one's own participation is a write.
  router.delete(
    '/:tripId/join',
    ...protectWrite,
    participationController.leaveTrip,
  )
  router.get(
    '/:tripId/participation',
    authenticate,
    participationController.getOwnParticipation,
  )
  router.get(
    '/:tripId/participants',
    authenticate,
    participationController.listParticipants,
  )
  router.patch(
    '/:tripId/participants/:participantId',
    ...protectWrite,
    participationController.moderateParticipant,
  )

  return router
}

const tripsRouter = createTripsRouter()

module.exports = tripsRouter
module.exports.createTripsRouter = createTripsRouter
