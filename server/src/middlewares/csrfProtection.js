/* eslint-disable no-undef */
'use strict'

const { CsrfError } = require('../utils/authErrors')
const {
  SAFE_METHODS,
  getSubmittedCsrfToken,
  isValidCsrfToken,
} = require('../utils/csrf')

const isManagedCsrfSession = (session) =>
  Boolean(session) && typeof session.csrfSecret === 'string'

// CSRF protection is opt-in per route rather than global. Routes that do not
// rely on cookie-based authentication (for example future bearer-token APIs)
// must not be forced to participate.
const createCsrfProtection = ({
  allowMissingSession = false,
} = {}) => (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) {
    next()
    return
  }

  const { session } = req

  if (!isManagedCsrfSession(session)) {
    // Logout is intentionally idempotent: a request with no session has
    // nothing to protect and still clears any stale cookie.
    if (allowMissingSession) {
      next()
      return
    }

    next(new CsrfError())
    return
  }

  if (!isValidCsrfToken(session, getSubmittedCsrfToken(req))) {
    next(new CsrfError())
    return
  }

  next()
}

module.exports = { createCsrfProtection }
