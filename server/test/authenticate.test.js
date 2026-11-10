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
  createAuthenticate,
} = require('../src/middlewares/authenticate')
const {
  AuthenticationRequiredError,
  SessionInvalidError,
  AccountInactiveError,
} = require('../src/utils/authErrors')

const USER_ID = '00000000-0000-0000-0000-000000000001'

const buildSession = (overrides = {}) => {
  const now = Date.now()

  return {
    userId: USER_ID,
    authVersion: 2,
    roleAtLogin: 'user',
    createdAt: now,
    absoluteExpiresAt: now + 60 * 60 * 1000,
    lastSeenAt: now,
    csrfSecret: 'test-csrf-secret',
    ...overrides,
  }
}

const buildUser = (overrides = {}) => ({
  id: USER_ID,
  fullName: 'Ada Lovelace',
  email: 'ada@example.com',
  role: 'user',
  status: 'active',
  authVersion: 2,
  ...overrides,
})

const run = async ({ session, user, findError, nodeEnv = 'test' }) => {
  const destroyed = []
  const sessions = {
    async destroySession(req, options) {
      destroyed.push({ session: req.session, options })
      return { destroyed: true }
    },
  }
  const User = {
    async findByPk(id) {
      if (findError) throw findError
      return typeof user === 'function' ? user(id) : user
    },
  }
  const middleware = createAuthenticate({ User, sessions, nodeEnv })
  const req = { session }
  let nextError
  let nextCalled = false

  await middleware(req, {}, (error) => {
    nextCalled = true
    nextError = error
  })

  return { req, nextCalled, nextError, destroyed }
}

test('missing and unmanaged sessions are rejected without a database lookup', async () => {
  let lookups = 0
  const User = {
    async findByPk() {
      lookups += 1
      return buildUser()
    },
  }
  const sessions = {
    async destroySession() {
      return { destroyed: true }
    },
  }
  const middleware = createAuthenticate({ User, sessions, nodeEnv: 'test' })

  for (const session of [null, {}, { userId: USER_ID }]) {
    const req = { session }
    let error

    await middleware(req, {}, (value) => {
      error = value
    })

    assert.ok(error instanceof AuthenticationRequiredError)
    assert.equal(error.status, 401)
    assert.equal(error.code, 'AUTH_REQUIRED')
  }

  assert.equal(lookups, 0)
})

test('expired sessions are destroyed and rejected', async () => {
  const session = buildSession({
    absoluteExpiresAt: Date.now() - 1,
  })

  const result = await run({ session, user: buildUser() })

  assert.ok(result.nextError instanceof SessionInvalidError)
  assert.equal(result.destroyed.length, 1)
})

test('missing users are destroyed and rejected', async () => {
  const result = await run({ session: buildSession(), user: null })

  assert.ok(result.nextError instanceof SessionInvalidError)
  assert.equal(result.destroyed.length, 1)
})

test('inactive accounts are destroyed and rejected', async () => {
  const result = await run({
    session: buildSession(),
    user: buildUser({ status: 'suspended' }),
  })

  assert.ok(result.nextError instanceof AccountInactiveError)
  assert.equal(result.nextError.status, 403)
  assert.equal(result.destroyed.length, 1)
})

test('outdated auth versions are destroyed and rejected', async () => {
  const result = await run({
    session: buildSession({ authVersion: 1 }),
    user: buildUser({ authVersion: 2 }),
  })

  assert.ok(result.nextError instanceof SessionInvalidError)
  assert.equal(result.nextError.code, 'SESSION_INVALID')
  assert.equal(result.destroyed.length, 1)
})

test('unexpected roles are rejected', async () => {
  const result = await run({
    session: buildSession(),
    user: buildUser({ role: 'superuser' }),
  })

  assert.ok(result.nextError instanceof SessionInvalidError)
  assert.equal(result.destroyed.length, 1)
})

test('valid sessions attach the current database user', async () => {
  const user = buildUser()
  const result = await run({ session: buildSession(), user })

  assert.equal(result.nextCalled, true)
  assert.equal(result.nextError, undefined)
  assert.equal(result.destroyed.length, 0)
  assert.equal(result.req.user, user)
  assert.deepEqual(result.req.auth, {
    userId: USER_ID,
    role: 'user',
    authVersion: 2,
  })
})

test('roles always come from the database, not the session', async () => {
  const user = buildUser({ role: 'user', authVersion: 3 })
  const session = buildSession({
    roleAtLogin: 'admin',
    authVersion: 3,
    email: 'attacker@example.com',
    role: 'admin',
  })

  const result = await run({ session, user })

  assert.equal(result.nextError, undefined)
  assert.equal(result.req.user.role, 'user')
  assert.equal(result.req.auth.role, 'user')
})

test('database failures are forwarded without destroying the session', async () => {
  const failure = new Error('database unavailable')
  const result = await run({
    session: buildSession(),
    findError: failure,
  })

  assert.equal(result.nextError, failure)
  assert.equal(result.destroyed.length, 0)
})
