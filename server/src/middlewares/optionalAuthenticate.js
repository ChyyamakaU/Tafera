'use strict'

const env = require('../config/env')
const {
  isManagedSession,
} = require('../config/sessionPolicy')
const sessionService = require('../services/sessionService')
const { AuthError } = require('../utils/authErrors')
const {
  createAuthenticate,
} = require('./authenticate')

// Public trip detail is readable without a session, but an authenticated owner
// must still be identified so private drafts can be returned. This wrapper
// reuses the real authenticate middleware only when a managed session exists.
// Invalid or expired sessions are treated as anonymous for the public read;
// unexpected failures still propagate.
const createOptionalAuthenticate = ({
  User,
  sessions = sessionService,
  nodeEnv = env.NODE_ENV,
} = {}) => {
  const authenticate = createAuthenticate({ User, sessions, nodeEnv })

  return (req, res, next) => {
    const { session } = req

    if (
      !session ||
      typeof session.userId !== 'string' ||
      !isManagedSession(session)
    ) {
      next()
      return
    }

    authenticate(req, res, (error) => {
      if (!error) {
        next()
        return
      }

      if (
        error instanceof AuthError &&
        (error.status === 401 || error.status === 403)
      ) {
        next()
        return
      }

      next(error)
    })
  }
}

const optionalAuthenticate = createOptionalAuthenticate()

module.exports = optionalAuthenticate
module.exports.createOptionalAuthenticate =
  createOptionalAuthenticate
