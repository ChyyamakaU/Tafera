'use strict'

const express = require('express')
const env = require('../config/env')
const sessionService = require('../services/sessionService')
const {
  createReportService,
} = require('../services/reportService')
const {
  createReportController,
} = require('../controllers/reportController')
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
  createRequireAdmin,
} = require('../middlewares/requireAdmin')

const createReportsRouter = ({
  reportService,
  sessions = sessionService,
  nodeEnv = env.NODE_ENV,
  User,
} = {}) => {
  const service =
    reportService || createReportService()
  const controller = createReportController({
    reportService: service,
  })
  const authenticate = createAuthenticate({ User, sessions, nodeEnv })
  const csrfProtection = createCsrfProtection()
  const requireVerifiedEmail = createRequireVerifiedEmail({ User })
  const requireAdmin = createRequireAdmin()

  const protectWrite = [
    authenticate,
    csrfProtection,
    requireVerifiedEmail,
  ]

  const protectAdminWrite = [
    authenticate,
    csrfProtection,
    requireVerifiedEmail,
    requireAdmin,
  ]

  const router = express.Router()

  // Reporter submits a new report.
  router.post('/', ...protectWrite, controller.create)

  // Reporter views their own reports.
  router.get('/mine', authenticate, requireVerifiedEmail, controller.listMine)

  // Admin views the moderation queue.
  router.get('/', authenticate, requireVerifiedEmail, requireAdmin, controller.listAdmin)

  // Reporter or admin views a single report.
  router.get('/:reportId', authenticate, requireVerifiedEmail, controller.getById)

  // Admin updates a report's status.
  router.patch(
    '/:reportId',
    ...protectAdminWrite,
    controller.updateStatus,
  )

  return router
}

const reportsRouter = createReportsRouter()

module.exports = reportsRouter
module.exports.createReportsRouter = createReportsRouter
