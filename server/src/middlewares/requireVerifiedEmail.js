'use strict'

const {
  AccountInactiveError,
  AuthenticationRequiredError,
  EmailVerificationRequiredError,
  SessionInvalidError,
} = require('../utils/authErrors')
const { logSecurityEvent } = require('../utils/securityLog')

// Guards state-changing community actions. It must run after the standard
// authenticate middleware, which is the only component allowed to establish
// req.auth. Running this middleware without authentication can never grant
// access: it rejects requests that do not already carry an authenticated
// session.
//
// Verification state is always re-read from PostgreSQL on the current request.
// The session and the request body are never trusted for emailVerifiedAt, so a
// successful verification takes effect immediately and a revoked verification
// is honoured without waiting for the session to expire.
const createRequireVerifiedEmail = ({ User } = {}) => {
  const userModel = User || require('../models').User

  return async (req, res, next) => {
    const userId = req.auth && req.auth.userId

    if (typeof userId !== 'string' || userId.length === 0) {
      next(new AuthenticationRequiredError())
      return
    }

    let user

    try {
      // A primary-key lookup is cheap and ensures the decision is based on the
      // current database row rather than auth-time state cached in the session.
      user = await userModel.findByPk(userId)
    } catch (err) {
      next(err)
      return
    }

    if (!user) {
      logSecurityEvent('verified_action_rejected', {
        reason: 'missing_user',
        outcome: 'failure',
      })
      next(new SessionInvalidError())
      return
    }

    if (user.status !== 'active') {
      logSecurityEvent('verified_action_rejected', {
        reason: 'inactive_account',
        outcome: 'failure',
      })
      next(new AccountInactiveError())
      return
    }

    if (!user.emailVerifiedAt) {
      logSecurityEvent('verified_action_rejected', {
        reason: 'email_unverified',
        outcome: 'failure',
      })
      next(new EmailVerificationRequiredError())
      return
    }

    // Refresh the request user so downstream controllers observe the same
    // current verification state that this guard just evaluated.
    req.user = user

    next()
  }
}

const requireVerifiedEmail = createRequireVerifiedEmail()

module.exports = requireVerifiedEmail
module.exports.createRequireVerifiedEmail = createRequireVerifiedEmail
