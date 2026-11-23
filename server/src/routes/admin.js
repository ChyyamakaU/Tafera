'use strict'

const express = require('express')
const env = require('../config/env')
const sessionService = require('../services/sessionService')
const { createAdminService } = require('../services/adminService')
const { createAdminController } = require('../controllers/adminController')
const { createAuthenticate } = require('../middlewares/authenticate')
const { createCsrfProtection } = require('../middlewares/csrfProtection')
const { createRequireVerifiedEmail } = require('../middlewares/requireVerifiedEmail')
const { createRequireAdmin } = require('../middlewares/requireAdmin')

const createAdminRouter = ({
  adminService,
  sessions = sessionService,
  nodeEnv = env.NODE_ENV,
  User,
} = {}) => {
  const service = adminService || createAdminService({ User })
  const controller = createAdminController({ adminService: service })

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

  // Overview & audit activity
  router.get('/overview', ...protectAdminRead, controller.overview)
  router.get('/audit-logs', ...protectAdminRead, controller.listAuditLogs)

  // Users
  router.get('/users', ...protectAdminRead, controller.listUsers)
  router.get('/users/:userId', ...protectAdminRead, controller.getUserDetail)
  router.patch('/users/:userId/status', ...protectAdminWrite, controller.updateUserStatus)
  router.patch('/users/:userId/role', ...protectAdminWrite, controller.updateUserRole)

  // Destinations & community photos
  router.get('/destinations', ...protectAdminRead, controller.listDestinations)
  router.post('/destinations', ...protectAdminWrite, controller.createDestination)
  router.patch(
    '/destinations/:destinationId',
    ...protectAdminWrite,
    controller.updateDestination,
  )
  router.delete(
    '/destinations/:destinationId',
    ...protectAdminWrite,
    controller.deleteDestination,
  )
  router.get(
    '/destination-images',
    ...protectAdminRead,
    controller.listDestinationPhotos,
  )
  router.delete(
    '/destinations/:destinationId/images/:imageId',
    ...protectAdminWrite,
    controller.deleteDestinationPhoto,
  )

  // Content moderation & reports
  router.get('/reports', ...protectAdminRead, controller.listReports)
  router.patch('/reports/:reportId', ...protectAdminWrite, controller.moderateReport)
  router.delete('/posts/:postId', ...protectAdminWrite, controller.deletePost)
  router.delete('/comments/:commentId', ...protectAdminWrite, controller.deleteComment)

  // Group trips
  router.get('/trips', ...protectAdminRead, controller.listGroupTrips)
  router.get('/trips/:tripId', ...protectAdminRead, controller.getGroupTripDetail)
  router.patch('/trips/:tripId/status', ...protectAdminWrite, controller.updateGroupTripStatus)
  router.delete('/trips/:tripId', ...protectAdminWrite, controller.deleteGroupTrip)

  return router
}

const adminRouter = createAdminRouter()

module.exports = adminRouter
module.exports.createAdminRouter = createAdminRouter
