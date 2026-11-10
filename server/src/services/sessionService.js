'use strict'

const crypto = require('crypto')
const env = require('../config/env')
const {
  getSessionCookieName,
  getSessionCookieClearOptions,
  getSessionPolicy,
  applySessionCookie,
  isManagedSession,
  evaluateSessionExpiry,
} = require('../config/sessionPolicy')
const { sessionIndex } = require('./sessionIndex')
const { logSecurityEvent } = require('../utils/securityLog')
const { SessionStoreUnavailableError } = require('../utils/sessionErrors')

const AUTHENTICATED_ROLES = new Set(['user', 'admin'])

const SESSION_DATA_FIELDS = Object.freeze([
  'userId',
  'authVersion',
  'roleAtLogin',
  'createdAt',
  'absoluteExpiresAt',
  'lastSeenAt',
  'csrfSecret',
])

const normalizeSessionError = (operation, err) => {
  if (err instanceof SessionStoreUnavailableError) {
    return err
  }

  logSecurityEvent(
    'session_operation_error',
    {
      operation,
      outcome: 'failure',
      errorCode: err.code || err.name || 'SESSION_ERROR',
    },
    'error',
  )

  return new SessionStoreUnavailableError(err)
}

const generateCsrfSecret = () => crypto.randomBytes(32).toString('base64url')

const regenerateSession = (req) =>
  new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) {
        reject(normalizeSessionError('regenerate', err))
        return
      }

      resolve(req.session)
    })
  })

const saveSession = (req) =>
  new Promise((resolve, reject) => {
    req.session.save((err) => {
      if (err) {
        reject(normalizeSessionError('save', err))
        return
      }

      resolve(req.session)
    })
  })

const buildSessionData = (roleAtLogin, userId, authVersion, now) => {
  const policy = getSessionPolicy(roleAtLogin)
  const data = {
    createdAt: now,
    absoluteExpiresAt: now + policy.absoluteMs,
    lastSeenAt: now,
    csrfSecret: generateCsrfSecret(),
  }

  if (userId !== undefined) {
    data.userId = userId
    data.authVersion = authVersion
    data.roleAtLogin = roleAtLogin
  }

  return data
}

const removePreviousSessionFromIndex = async (
  index,
  previousUserId,
  previousSessionId,
  currentSessionId,
) => {
  if (
    !previousUserId ||
    !previousSessionId ||
    previousSessionId === currentSessionId
  ) {
    return
  }

  try {
    await index.removeSession({
      userId: previousUserId,
      sessionId: previousSessionId,
    })
  } catch (err) {
    logSecurityEvent(
      'session_index_cleanup_failed',
      {
        operation: 'remove_previous',
        outcome: 'failure',
        errorCode: err.code || err.name || 'SESSION_INDEX_ERROR',
      },
      'warn',
    )
  }
}

const destroyQuietly = (req) =>
  new Promise((resolve) => {
    if (!req.session) {
      resolve()
      return
    }

    req.session.destroy(() => resolve())
  })

const createAuthenticatedSession = async (req, user, options = {}) => {
  const {
    index = sessionIndex,
    nodeEnv = env.NODE_ENV,
    now = Date.now(),
  } = options

  if (!user || typeof user.id !== 'string' || user.id.length === 0) {
    throw new TypeError('A persisted user with an id is required')
  }

  if (!AUTHENTICATED_ROLES.has(user.role)) {
    throw new TypeError('User role must be user or admin')
  }

  if (!Number.isInteger(user.authVersion)) {
    throw new TypeError('User authVersion must be an integer')
  }

  const previousUserId = req.session ? req.session.userId : undefined
  const previousSessionId = req.sessionID

  await regenerateSession(req)

  Object.assign(
    req.session,
    buildSessionData(user.role, user.id, user.authVersion, now),
  )
  applySessionCookie(req.session, now, nodeEnv)
  await saveSession(req)

  const sessionId = req.sessionID

  try {
    await index.registerSession({
      userId: user.id,
      sessionId,
      createdAt: now,
    })
  } catch (err) {
    await destroyQuietly(req)
    if (options.res) {
      clearSessionCookie(options.res, { nodeEnv })
    }
    throw normalizeSessionError('register', err)
  }

  await removePreviousSessionFromIndex(
    index,
    previousUserId,
    previousSessionId,
    sessionId,
  )

  logSecurityEvent('session_created', {
    role: user.role,
    outcome: 'success',
  })

  return req.session
}

const createAnonymousSession = async (req, options = {}) => {
  const { nodeEnv = env.NODE_ENV, now = Date.now() } = options
  const previousUserId = req.session ? req.session.userId : undefined
  const previousSessionId = req.sessionID

  await regenerateSession(req)

  Object.assign(
    req.session,
    buildSessionData(undefined, undefined, undefined, now),
  )
  applySessionCookie(req.session, now, nodeEnv)
  await saveSession(req)

  await removePreviousSessionFromIndex(
    options.index || sessionIndex,
    previousUserId,
    previousSessionId,
    req.sessionID,
  )

  logSecurityEvent('session_created', {
    role: 'anonymous',
    outcome: 'success',
  })

  return req.session
}

const touchSession = (session, options = {}) => {
  const { nodeEnv = env.NODE_ENV, now = Date.now() } = options

  if (!isManagedSession(session)) {
    return session
  }

  session.lastSeenAt = now
  applySessionCookie(session, now, nodeEnv)

  return session
}

const isAuthVersionCurrent = (session, currentAuthVersion) => {
  if (!isManagedSession(session) || !session.userId) {
    return false
  }

  const expected = Number(currentAuthVersion)

  return (
    Number.isInteger(expected) && Number(session.authVersion) === expected
  )
}

const clearSessionCookie = (res, options = {}) => {
  const { nodeEnv = env.NODE_ENV } = options
  const name = getSessionCookieName(nodeEnv)

  res.clearCookie(name, getSessionCookieClearOptions(nodeEnv))
}

const destroySession = async (req, options = {}) => {
  const {
    index = sessionIndex,
    nodeEnv = env.NODE_ENV,
  } = options
  const session = req.session
  const sessionId = req.sessionID
  const userId = session ? session.userId : undefined

  if (options.res) {
    clearSessionCookie(options.res, { nodeEnv })
  }

  if (!session) {
    return { destroyed: false }
  }

  try {
    await new Promise((resolve, reject) => {
      req.session.destroy((err) => {
        if (err) {
          reject(err)
          return
        }

        resolve()
      })
    })
  } catch (err) {
    logSecurityEvent(
      'session_destroy_failed',
      {
        operation: 'destroy',
        outcome: 'failure',
        errorCode: err.code || err.name || 'SESSION_ERROR',
      },
      'error',
    )
    return { destroyed: false }
  }

  if (userId && sessionId) {
    try {
      await index.removeSession({ userId, sessionId })
    } catch (err) {
      logSecurityEvent(
        'session_index_cleanup_failed',
        {
          operation: 'remove',
          outcome: 'failure',
          errorCode: err.code || err.name || 'SESSION_INDEX_ERROR',
        },
        'warn',
      )
    }
  }

  return { destroyed: true }
}

const revokeAllUserSessions = async (userId, options = {}) => {
  const { index = sessionIndex } = options
  return index.revokeAllSessions(userId)
}

module.exports = {
  SESSION_DATA_FIELDS,
  regenerateSession,
  saveSession,
  createAuthenticatedSession,
  createAnonymousSession,
  touchSession,
  evaluateSessionExpiry,
  isManagedSession,
  isAuthVersionCurrent,
  clearSessionCookie,
  destroySession,
  revokeAllUserSessions,
}
