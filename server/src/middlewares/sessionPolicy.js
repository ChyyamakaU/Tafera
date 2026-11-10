'use strict'

const env = require('../config/env')
const {
  evaluateSessionExpiry,
  isManagedSession,
} = require('../config/sessionPolicy')
const {
  touchSession,
  destroySession,
} = require('../services/sessionService')
const { sessionIndex } = require('../services/sessionIndex')
const { logSecurityEvent } = require('../utils/securityLog')

// Applies idle/absolute expiry to every managed session on every request.
// Sessions created by express-session itself (for example by legacy code) are
// left untouched so this middleware never breaks unrelated behaviour.
const createSessionPolicy = ({
  nodeEnv = env.NODE_ENV,
  index = sessionIndex,
} = {}) => (req, res, next) => {
  const { session } = req

  if (!session || !isManagedSession(session)) {
    next()
    return
  }

  const { expired, reason } = evaluateSessionExpiry(session)

  if (!expired) {
    touchSession(session, { nodeEnv })
    next()
    return
  }

  logSecurityEvent('session_expired', {
    reason,
    role: session.roleAtLogin || 'anonymous',
    outcome: 'success',
  })

  // Expiry is already enforced by the stored metadata, so a failed destroy must
  // not turn a dead session into a 503. Clear the cookie and continue as an
  // unauthenticated request.
  destroySession(req, { res, nodeEnv, index })
    .catch(() => {})
    .finally(() => next())
}

const sessionPolicy = createSessionPolicy()

module.exports = sessionPolicy
module.exports.createSessionPolicy = createSessionPolicy
