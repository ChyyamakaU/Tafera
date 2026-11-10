'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  SESSION_POLICIES,
  SESSION_COOKIE_NAMES,
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
} = require('../src/config/sessionPolicy')

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const USER = Object.freeze({
  id: '00000000-0000-0000-0000-000000000001',
  authVersion: 1,
  role: 'user',
})

const buildSession = (role, overrides = {}, now = Date.now()) => {
  const policy = getSessionPolicy(role)

  return {
    ...(role
      ? { userId: USER.id, authVersion: USER.authVersion, roleAtLogin: role }
      : {}),
    createdAt: now,
    absoluteExpiresAt: now + policy.absoluteMs,
    lastSeenAt: now,
    csrfSecret: 'test-csrf-secret',
    cookie: {},
    ...overrides,
  }
}

test('session policies match the documented idle and absolute windows', () => {
  assert.deepEqual(SESSION_POLICIES.user, { idleMs: DAY, absoluteMs: 7 * DAY })
  assert.deepEqual(SESSION_POLICIES.admin, {
    idleMs: 30 * MINUTE,
    absoluteMs: 12 * HOUR,
  })
  assert.deepEqual(SESSION_POLICIES.anonymous, {
    idleMs: 30 * MINUTE,
    absoluteMs: 2 * HOUR,
  })
})

test('unknown and missing roles fall back to the anonymous policy', () => {
  assert.equal(getSessionPolicy(undefined), SESSION_POLICIES.anonymous)
  assert.equal(getSessionPolicy(null), SESSION_POLICIES.anonymous)
  assert.equal(getSessionPolicy('superuser'), SESSION_POLICIES.anonymous)
  assert.equal(getSessionPolicy('admin'), SESSION_POLICIES.admin)
})

test('production uses a __Host- cookie and development/test uses a plain one', () => {
  assert.equal(
    getSessionCookieName('production'),
    '__Host-tafera.sid',
  )
  assert.equal(getSessionCookieName('development'), 'tafera.sid')
  assert.equal(getSessionCookieName('test'), 'tafera.sid')
  assert.equal(SESSION_COOKIE_NAMES.production, '__Host-tafera.sid')
})

test('production cookie options are secure, host-prefixed and have no Domain', () => {
  const options = getSessionCookieOptions('production', HOUR)

  assert.deepEqual(options, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: HOUR,
    priority: 'high',
  })
  assert.equal('domain' in options, false)
})

test('development cookie options are not secure and have no Priority', () => {
  const options = getSessionCookieOptions('development', MINUTE)

  assert.deepEqual(options, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/',
    maxAge: MINUTE,
  })
})

test('cookie clearing mirrors the issuing attributes without a maxAge', () => {
  const production = getSessionCookieClearOptions('production')
  const development = getSessionCookieClearOptions('development')

  assert.deepEqual(production, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    priority: 'high',
  })
  assert.deepEqual(development, {
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    path: '/',
  })
  assert.equal('domain' in production, false)
  assert.equal('maxAge' in production, false)
})

test('Redis keys are namespaced and validated inputs are composed safely', () => {
  assert.equal(getSessionStorePrefix(), 'tafera:sess:')
  assert.equal(getUserSessionsKey('abc'), 'tafera:user-sessions:abc')
  assert.equal(getSessionStorePrefix('staging'), 'staging:sess:')
  assert.equal(
    getUserSessionsKey('abc', 'staging'),
    'staging:user-sessions:abc',
  )
})

test('only sessions with numeric creation and absolute expiry are managed', () => {
  assert.equal(isManagedSession(null), false)
  assert.equal(isManagedSession({}), false)
  assert.equal(
    isManagedSession({ createdAt: Date.now(), absoluteExpiresAt: null }),
    false,
  )
  assert.equal(isManagedSession({ createdAt: 1, absoluteExpiresAt: 2 }), true)
})

test('a fresh user session is not expired', () => {
  const now = Date.now()
  const result = evaluateSessionExpiry(buildSession('user', {}, now), now)

  assert.equal(result.expired, false)
  assert.equal(result.reason, null)
  assert.equal(result.absoluteExpiresAt, now + 7 * DAY)
})

test('idle expiry is enforced after 24 hours of inactivity for users', () => {
  const now = Date.now()
  const session = buildSession('user', { lastSeenAt: now - DAY - 1000 }, now)

  const result = evaluateSessionExpiry(session, now)

  assert.equal(result.expired, true)
  assert.equal(result.reason, 'idle')
})

test('activity extends idle expiry for users', () => {
  const now = Date.now()
  const session = buildSession(
    'user',
    { lastSeenAt: now - DAY + MINUTE },
    now,
  )

  assert.equal(evaluateSessionExpiry(session, now).expired, false)
})

test('absolute expiry wins even when the session was just active', () => {
  const now = Date.now()
  const session = buildSession(
    'user',
    { lastSeenAt: now, absoluteExpiresAt: now - 1 },
    now,
  )

  const result = evaluateSessionExpiry(session, now)

  assert.equal(result.expired, true)
  assert.equal(result.reason, 'absolute')
})

test('admin and anonymous sessions use their shorter windows', () => {
  const now = Date.now()

  const adminIdle = buildSession(
    'admin',
    { lastSeenAt: now - 30 * MINUTE - 1 },
    now,
  )
  const anonymousIdle = buildSession(
    undefined,
    { lastSeenAt: now - 30 * MINUTE - 1 },
    now,
  )
  const adminAbsolute = buildSession(
    'admin',
    { absoluteExpiresAt: now - 1 },
    now,
  )

  assert.equal(evaluateSessionExpiry(adminIdle, now).reason, 'idle')
  assert.equal(evaluateSessionExpiry(anonymousIdle, now).reason, 'idle')
  assert.equal(evaluateSessionExpiry(adminAbsolute, now).reason, 'absolute')
})

test('Redis TTL uses the idle window when it is shorter than absolute remaining', () => {
  const now = Date.now()
  const session = buildSession('user', {}, now)

  assert.equal(getSessionTtlSeconds(session, now), DAY / 1000)
})

test('Redis TTL is capped by the remaining absolute lifetime', () => {
  const now = Date.now()
  const session = buildSession(
    'user',
    { absoluteExpiresAt: now + 90 * 1000 },
    now,
  )

  assert.equal(getSessionTtlSeconds(session, now), 90)
})

test('Redis TTL is zero once absolute expiry has passed', () => {
  const now = Date.now()
  const session = buildSession(
    'user',
    { absoluteExpiresAt: now - 1 },
    now,
  )

  assert.equal(getSessionTtlSeconds(session, now), 0)
})

test('cookie maxAge is capped by the remaining absolute lifetime', () => {
  const now = Date.now()
  const session = buildSession(
    'user',
    { absoluteExpiresAt: now + 5 * MINUTE },
    now,
  )

  applySessionCookie(session, now, 'development')

  assert.equal(session.cookie.maxAge, 5 * MINUTE)
})

test('repeated activity cannot push the cookie past absolute expiry', () => {
  const now = Date.now()
  const absoluteExpiresAt = now + 10 * MINUTE
  const session = buildSession('user', { absoluteExpiresAt }, now)

  applySessionCookie(session, now, 'development')
  assert.equal(session.cookie.maxAge, 10 * MINUTE)

  applySessionCookie(session, now + 4 * MINUTE, 'development')
  assert.equal(session.cookie.maxAge, 6 * MINUTE)

  applySessionCookie(session, now + 11 * MINUTE, 'development')
  assert.equal(session.cookie.maxAge, 0)
})

test('cookie application forces HttpOnly/SameSite/Path and clears Domain', () => {
  const now = Date.now()
  const session = buildSession('user', { domain: 'example.com' }, now)
  session.cookie = {
    httpOnly: false,
    secure: false,
    sameSite: 'none',
    path: '/bad',
    domain: 'example.com',
    priority: 'low',
  }

  applySessionCookie(session, now, 'production')

  assert.equal(session.cookie.httpOnly, true)
  assert.equal(session.cookie.secure, true)
  assert.equal(session.cookie.sameSite, 'lax')
  assert.equal(session.cookie.path, '/')
  assert.equal(session.cookie.domain, undefined)
  assert.equal(session.cookie.priority, 'high')
})

test('development cookie application removes Priority', () => {
  const now = Date.now()
  const session = buildSession('user', {}, now)
  session.cookie = { priority: 'high' }

  applySessionCookie(session, now, 'development')

  assert.equal(session.cookie.priority, undefined)
  assert.equal(session.cookie.secure, false)
})
