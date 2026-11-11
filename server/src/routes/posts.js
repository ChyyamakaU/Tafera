'use strict'

const express = require('express')
const env = require('../config/env')
const sessionService = require('../services/sessionService')
const { createPostService } = require('../services/postService')
const { createPostController } = require('../controllers/postController')
const {
  createAuthenticate,
} = require('../middlewares/authenticate')
const {
  createCsrfProtection,
} = require('../middlewares/csrfProtection')
const {
  createRequireVerifiedEmail,
} = require('../middlewares/requireVerifiedEmail')

const createPostsRouter = ({
  postService,
  sessions = sessionService,
  nodeEnv = env.NODE_ENV,
  User,
} = {}) => {
  const service = postService || createPostService()
  const controller = createPostController({ postService: service })
  const authenticate = createAuthenticate({ User, sessions, nodeEnv })
  const csrfProtection = createCsrfProtection()
  const requireVerifiedEmail = createRequireVerifiedEmail({ User })

  const protectWrite = [
    authenticate,
    csrfProtection,
    requireVerifiedEmail,
  ]

  const router = express.Router()

  router.post('/', ...protectWrite, controller.create)
  router.get('/', controller.list)
  // A future GET /following route must be registered before this
  // parameterized detail route.
  router.get('/:postId', controller.detail)
  router.patch('/:postId', ...protectWrite, controller.update)
  router.delete('/:postId', ...protectWrite, controller.remove)

  return router
}

const postsRouter = createPostsRouter()

module.exports = postsRouter
module.exports.createPostsRouter = createPostsRouter
