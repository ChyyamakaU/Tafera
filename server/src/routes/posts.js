'use strict'

const express = require('express')
const env = require('../config/env')
const sessionService = require('../services/sessionService')
const { createPostService } = require('../services/postService')
const {
  createCommentService,
} = require('../services/commentService')
const { createPostController } = require('../controllers/postController')
const {
  createCommentController,
} = require('../controllers/commentController')
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
  commentService,
  sessions = sessionService,
  nodeEnv = env.NODE_ENV,
  User,
} = {}) => {
  const service = postService || createPostService()
  const controller = createPostController({ postService: service })
  const comments = commentService || createCommentService()
  const commentController = createCommentController({
    commentService: comments,
  })
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
  // /following is a read-only feed scoped to the authenticated user. It must
  // be registered before /:postId so it is never treated as a post ID.
  router.get('/following', authenticate, controller.following)
  // Comment routes are nested under their post. They are registered before
  // the parameterized post routes so the intent of the path hierarchy is
  // explicit.
  router.get('/:postId/comments', commentController.list)
  router.post(
    '/:postId/comments',
    ...protectWrite,
    commentController.create,
  )
  router.patch(
    '/:postId/comments/:commentId',
    ...protectWrite,
    commentController.update,
  )
  router.delete(
    '/:postId/comments/:commentId',
    ...protectWrite,
    commentController.remove,
  )
  router.get('/:postId', controller.detail)
  router.patch('/:postId', ...protectWrite, controller.update)
  router.delete('/:postId', ...protectWrite, controller.remove)

  return router
}

const postsRouter = createPostsRouter()

module.exports = postsRouter
module.exports.createPostsRouter = createPostsRouter
