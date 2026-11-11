'use strict'

const express = require('express')
const env = require('../config/env')
const sessionService = require('../services/sessionService')
const {
  createNotificationService,
} = require('../services/notificationService')
const {
  createNotificationController,
} = require('../controllers/notificationController')
const {
  createAuthenticate,
} = require('../middlewares/authenticate')
const {
  createCsrfProtection,
} = require('../middlewares/csrfProtection')

const createNotificationsRouter = ({
  notificationService,
  sessions = sessionService,
  nodeEnv = env.NODE_ENV,
  User,
} = {}) => {
  const service =
    notificationService || createNotificationService()
  const controller = createNotificationController({
    notificationService: service,
  })
  const authenticate = createAuthenticate({ User, sessions, nodeEnv })
  const csrfProtection = createCsrfProtection()

  const router = express.Router()

  router.get('/', authenticate, controller.list)
  // Static routes are registered before the parameterized read route.
  router.get('/unread-count', authenticate, controller.unreadCount)
  router.patch(
    '/read-all',
    authenticate,
    csrfProtection,
    controller.markAllAsRead,
  )
  router.patch(
    '/:notificationId/read',
    authenticate,
    csrfProtection,
    controller.markAsRead,
  )

  return router
}

const notificationsRouter = createNotificationsRouter()

module.exports = notificationsRouter
module.exports.createNotificationsRouter = createNotificationsRouter
