'use strict'

const env = require('../config/env')
const {
  evaluateSessionExpiry,
  isManagedSession,
} = require('../config/sessionPolicy')
const sessionService = require('../services/sessionService')
const { logSecurityEvent } = require('../utils/securityLog')
const {
  AuthenticationRequiredError,
  SessionInvalidError,
  AccountInactiveError,
} = require('../utils/authErrors')

const AUTHENTICATED_ROLES = new Set(['user', 'admin'])

const createAuthenticate = ({
  User,
  sessions = sessionService,
  nodeEnv = env.NODE_ENV,
} = {}) => {
  const userModel = User || require('../models').User

  const invalidate = async (req, res) => {
    try {
      await sessions.destroySession(req, { res, nodeEnv })
    } catch {
      // Authentication is still rejected. authVersion remains authoritative,
      // so even a failed cleanup cannot make a stale session usable.
    }
  }

  return async (req, res, next) => {
    const session = req.session

    if (
      !session ||
      typeof session.userId !== 'string' ||
      !isManagedSession(session)
    ) {
      next(new AuthenticationRequiredError())
      return
    }

    const { expired } = evaluateSessionExpiry(session)

    if (expired) {
      logSecurityEvent('auth_session_rejected', {
        reason: 'expired',
        outcome: 'failure',
      })
      await invalidate(req, res)
      next(
        new SessionInvalidError(
          'Your session has expired. Please sign in again.',
        ),
      )
      return
    }

    let user

    try {
      user = await userModel.findByPk(session.userId)
    } catch (err) {
      next(err)
      return
    }

    if (!user) {
      logSecurityEvent('auth_session_rejected', {
        reason: 'missing_user',
        outcome: 'failure',
      })
      await invalidate(req, res)
      next(new SessionInvalidError())
      return
    }

    if (!AUTHENTICATED_ROLES.has(user.role)) {
      logSecurityEvent('auth_session_rejected', {
        reason: 'invalid_role',
        outcome: 'failure',
      })
      await invalidate(req, res)
      next(new SessionInvalidError())
      return
    }

    if (!sessionService.isAuthVersionCurrent(session, user.authVersion)) {
      logSecurityEvent('auth_session_rejected', {
        reason: 'auth_version_mismatch',
        outcome: 'failure',
      })
      await invalidate(req, res)
      next(new SessionInvalidError())
      return
    }

    if (user.status !== 'active') {
      logSecurityEvent('auth_session_rejected', {
        reason: 'inactive_account',
        outcome: 'failure',
      })
      await invalidate(req, res)
      next(new AccountInactiveError())
      return
    }

    // Roles and status always come from the database, never from the session
    // or request body. The session only carries the login-time policy role.
    req.user = user
    req.auth = {
      userId: user.id,
      role: user.role,
      authVersion: user.authVersion,
    }

    next()
  }
}

const authenticate = createAuthenticate()

module.exports = authenticate
module.exports.createAuthenticate = createAuthenticate
