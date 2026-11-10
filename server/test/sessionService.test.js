'use strict'

process.env.NODE_ENV = 'test'
process.env.SESSION_SECRET =
  'test-only-session-secret-0123456789abcdef'
process.env.DB_NAME = process.env.DB_NAME || 'tafera_test'
process.env.DB_USER = process.env.DB_USER || 'tafera_test_user'
process.env.ARGON2_MAX_QUEUE = '50'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  SESSION_DATA_FIELDS,
  isAuthVersionCurrent,
  clearSessionCookie,
  revokeAllUserSessions,
  touchSession,
} = require('../src/services/sessionService')

const buildSession = (overrides = {}) => {
  const now = Date.now()

  return {
    userId: '00000000-0000-0000-0000-000000000001',
    authVersion: 3,
    roleAtLogin: 'user',
    createdAt: now,
    absoluteExpiresAt: now + 7 * 24 * 60 * 60 * 1000,
    lastSeenAt: now,
    csrfSecret: 'test-csrf-secret',
    cookie: {},
    ...overrides,
  }
}

const createResponse = () => ({
  cleared: [],
  clearCookie(name, options) {
    this.cleared.push({ name, options })
    return this
  },
})

test('session data is restricted to the seven documented fields', () => {
  assert.deepEqual(SESSION_DATA_FIELDS, [
    'userId',
    'authVersion',
    'roleAtLogin',
    'createdAt',
    'absoluteExpiresAt',
    'lastSeenAt',
    'csrfSecret',
  ])
})

test('authVersion matches only when the stored version is current', () => {
  const session = buildSession()

  assert.equal(isAuthVersionCurrent(session, 3), true)
  assert.equal(isAuthVersionCurrent(session, 4), false)
  assert.equal(isAuthVersionCurrent(session, '3'), true)
})

test('authVersion is never considered current for anonymous or unmanaged sessions', () => {
  assert.equal(isAuthVersionCurrent(buildSession({ userId: undefined }), 3), false)
  assert.equal(isAuthVersionCurrent({ authVersion: 3 }, 3), false)
  assert.equal(isAuthVersionCurrent(null, 3), false)
})

test('clearSessionCookie uses the environment-specific cookie name', () => {
  const production = createResponse()
  const development = createResponse()

  clearSessionCookie(production, { nodeEnv: 'production' })
  clearSessionCookie(development, { nodeEnv: 'test' })

  assert.equal(production.cleared[0].name, '__Host-tafera.sid')
  assert.equal(production.cleared[0].options.secure, true)
  assert.equal(production.cleared[0].options.priority, 'high')
  assert.equal(production.cleared[0].options.domain, undefined)

  assert.equal(development.cleared[0].name, 'tafera.sid')
  assert.equal(development.cleared[0].options.secure, false)
  assert.equal('priority' in development.cleared[0].options, false)
})

test('touchSession records activity but keeps the absolute cap', () => {
  const now = Date.now()
  const absoluteExpiresAt = now + 2 * 60 * 1000
  const session = buildSession({ absoluteExpiresAt, lastSeenAt: now - 1000 })

  touchSession(session, { nodeEnv: 'development', now })

  assert.equal(session.lastSeenAt, now)
  assert.equal(session.cookie.maxAge, 2 * 60 * 1000)
  assert.equal(session.cookie.secure, false)
  assert.equal(session.cookie.path, '/')
})

test('revokeAllUserSessions delegates to the index', async () => {
  const calls = []
  const index = {
    async revokeAllSessions(userId) {
      calls.push(userId)
      return 4
    },
  }

  const revoked = await revokeAllUserSessions('user-1', { index })

  assert.equal(revoked, 4)
  assert.deepEqual(calls, ['user-1'])
})
