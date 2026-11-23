'use strict'

const express = require('express')
const env = require('../config/env')
const sessionService = require('../services/sessionService')
const { createProfileService } = require('../services/profileService')
const { createPostService } = require('../services/postService')
const { createFollowService } = require('../services/followService')
const { createCommentService } = require('../services/commentService')
const {
  createProfileController,
} = require('../controllers/profileController')
const { createPostController } = require('../controllers/postController')
const {
  createFollowController,
} = require('../controllers/followController')
const { createAuthenticate } = require('../middlewares/authenticate')
const {
  createOptionalAuthenticate,
} = require('../middlewares/optionalAuthenticate')
const { createCsrfProtection } = require('../middlewares/csrfProtection')
const {
  createRequireVerifiedEmail,
} = require('../middlewares/requireVerifiedEmail')
const { destinationImageUpload } = require('../middlewares/destinationImageUpload')

const createUsersRouter = ({
  profileService,
  postService,
  followService,
  commentService,
  sessions = sessionService,
  nodeEnv = env.NODE_ENV,
  User,
} = {}) => {
  const service = profileService || createProfileService({ User })
  const comments = commentService || createCommentService({ User })
  const controller = createProfileController({ profileService: service, commentService: comments })
  const posts = postService || createPostService({ User })
  const postController = createPostController({ postService: posts })
  const follows = followService || createFollowService({ User })
  const followController = createFollowController({
    followService: follows,
  })
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

  // /me must be registered before /:userId so it is never treated as an ID.
  router.get('/me', authenticate, requireVerifiedEmail, controller.me)
  router.post('/me/profile-image', authenticate, csrfProtection, requireVerifiedEmail, destinationImageUpload, controller.uploadProfileImage)
  // Updating a profile is account management, not a protected community
  // action, so it deliberately does not require a verified email. CSRF and
  // session authentication still apply.
  router.patch('/me', authenticate, csrfProtection, requireVerifiedEmail, controller.updateMe)
  // Public user-post listings are scoped by the user ID in the path. They do
  // not require a session or a verified email.
  router.get('/:userId/posts', optionalAuthenticate, postController.listByUser)
  router.get('/:userId/media', postController.listMediaByUser)
  router.get('/:userId/comments', controller.userComments)
  // Follows are immediate and one-way. Reads are public; writes use the
  // standard community-action guards.
  router.post('/:userId/follow', ...protectWrite, followController.create)
  router.delete(
    '/:userId/follow',
    ...protectWrite,
    followController.remove,
  )
  router.get('/:userId/followers', followController.followers)
  router.get('/:userId/following', followController.following)
  router.get('/:userId', controller.publicProfile)

  return router
}

const usersRouter = createUsersRouter()

module.exports = usersRouter
module.exports.createUsersRouter = createUsersRouter
