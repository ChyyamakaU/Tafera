'use strict'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const SESSION_POLICIES = Object.freeze({
  user: Object.freeze({
    idleMs: 24 * HOUR,
    absoluteMs: 7 * DAY,
  }),
  admin: Object.freeze({
    idleMs: 30 * MINUTE,
    absoluteMs: 12 * HOUR,
  }),
  anonymous: Object.freeze({
    idleMs: 30 * MINUTE,
    absoluteMs: 2 * HOUR,
  }),
})

const SESSION_COOKIE_NAMES = Object.freeze({
  production: '__Host-tafera.sid',
  development: 'tafera.sid',
  test: 'tafera.sid',
})

const DEFAULT_SESSION_NAMESPACE = 'tafera'

const getSessionPolicy = (roleAtLogin) => {
  if (
    roleAtLogin &&
    Object.prototype.hasOwnProperty.call(SESSION_POLICIES, roleAtLogin)
  ) {
    return SESSION_POLICIES[roleAtLogin]
  }

  return SESSION_POLICIES.anonymous
}

const getSessionCookieName = (nodeEnv) =>
  nodeEnv === 'production'
    ? SESSION_COOKIE_NAMES.production
    : SESSION_COOKIE_NAMES.development

const getSessionCookieOptions = (nodeEnv, maxAgeMs) => {
  const options = {
    httpOnly: true,
    secure: nodeEnv === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeMs,
  }

  // __Host- cookies must be Secure, use Path=/ and must not set Domain.
  if (nodeEnv === 'production') {
    options.priority = 'high'
  }

  return options
}

const getSessionCookieClearOptions = (nodeEnv) => {
  const options = {
    httpOnly: true,
    secure: nodeEnv === 'production',
    sameSite: 'lax',
    path: '/',
  }

  if (nodeEnv === 'production') {
    options.priority = 'high'
  }

  return options
}

const getSessionStorePrefix = (
  namespace = DEFAULT_SESSION_NAMESPACE,
) => `${namespace}:sess:`

const getUserSessionsKey = (
  userId,
  namespace = DEFAULT_SESSION_NAMESPACE,
) => `${namespace}:user-sessions:${userId}`

const isTimestamp = (value) =>
  typeof value === 'number' && Number.isFinite(value)

const isManagedSession = (session) => {
  if (!session) return false

  return (
    isTimestamp(session.createdAt) &&
    isTimestamp(session.absoluteExpiresAt)
  )
}

const evaluateSessionExpiry = (session, now = Date.now()) => {
  if (!isManagedSession(session)) {
    return {
      expired: false,
      reason: null,
      idleExpiresAt: null,
      absoluteExpiresAt: null,
    }
  }

  const policy = getSessionPolicy(session.roleAtLogin)
  const absoluteExpiresAt = session.absoluteExpiresAt
  const lastSeenAt = isTimestamp(session.lastSeenAt)
    ? session.lastSeenAt
    : session.createdAt
  const idleExpiresAt = Math.min(now + policy.idleMs, absoluteExpiresAt)

  if (now >= absoluteExpiresAt) {
    return {
      expired: true,
      reason: 'absolute',
      idleExpiresAt,
      absoluteExpiresAt,
    }
  }

  if (now - lastSeenAt >= policy.idleMs) {
    return {
      expired: true,
      reason: 'idle',
      idleExpiresAt,
      absoluteExpiresAt,
    }
  }

  return {
    expired: false,
    reason: null,
    idleExpiresAt,
    absoluteExpiresAt,
  }
}

// Redis TTL is always the smaller of the idle window and the remaining
// absolute lifetime. It can never extend absolute expiry.
const getSessionTtlSeconds = (session, now = Date.now()) => {
  if (!session) return 0

  const policy = getSessionPolicy(session.roleAtLogin)
  const absoluteExpiresAt = session.absoluteExpiresAt
  const absoluteRemainingMs = isTimestamp(absoluteExpiresAt)
    ? absoluteExpiresAt - now
    : policy.absoluteMs
  const ttlMs = Math.min(policy.idleMs, absoluteRemainingMs)

  return ttlMs > 0 ? Math.ceil(ttlMs / 1000) : 0
}

const applySessionCookie = (
  session,
  now = Date.now(),
  nodeEnv = 'development',
) => {
  if (!session || !session.cookie) return session

  const policy = getSessionPolicy(session.roleAtLogin)
  const absoluteExpiresAt = session.absoluteExpiresAt
  const absoluteRemainingMs = isTimestamp(absoluteExpiresAt)
    ? absoluteExpiresAt - now
    : policy.absoluteMs
  const maxAgeMs = Math.max(
    0,
    Math.min(policy.idleMs, absoluteRemainingMs),
  )

  session.cookie.httpOnly = true
  session.cookie.secure = nodeEnv === 'production'
  session.cookie.sameSite = 'lax'
  session.cookie.path = '/'
  session.cookie.priority = nodeEnv === 'production' ? 'high' : undefined
  // Explicitly omit Domain. The __Host- prefix requires it in production.
  session.cookie.domain = undefined
  // maxAge also updates expires and originalMaxAge, so express-session's
  // rolling touch cannot reset the cookie beyond absolute expiry.
  session.cookie.maxAge = maxAgeMs

  return session
}

module.exports = {
  SESSION_POLICIES,
  SESSION_COOKIE_NAMES,
  DEFAULT_SESSION_NAMESPACE,
  getSessionPolicy,
  getSessionCookieName,
  getSessionCookieOptions,
  getSessionCookieClearOptions,
  getSessionStorePrefix,
  getUserSessionsKey,
  isManagedSession,
  evaluateSessionExpiry,
  getSessionTtlSeconds,
  applySessionCookie,
}
