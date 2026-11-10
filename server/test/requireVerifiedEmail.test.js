'use strict'

process.env.NODE_ENV = 'test'
process.env.SESSION_SECRET =
  'test-only-session-secret-0123456789abcdef'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  createRequireVerifiedEmail,
} = require('../src/middlewares/requireVerifiedEmail')

const buildUser = (overrides = {}) => ({
  id: '00000000-0000-0000-0000-000000000001',
  status: 'active',
  emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
})

const createUserModel = (result) => {
  let calls = 0

  return {
    get calls() {
      return calls
    },
    async findByPk() {
      calls += 1

      if (result instanceof Error) {
        throw result
      }

      return result
    },
  }
}

const runMiddleware = async (middleware, req) => {
  let nextCalls = 0
  let nextError

  await middleware(req, {}, (err) => {
    nextCalls += 1
    nextError = err
  })

  return { nextCalls, nextError }
}

test('rejects requests that have no authenticated context without hitting the database', async () => {
  const model = createUserModel(buildUser())
  const middleware = createRequireVerifiedEmail({ User: model })

  for (const req of [{}, { auth: {} }, { auth: { userId: '' } }]) {
    const { nextCalls, nextError } = await runMiddleware(middleware, req)

    assert.equal(nextCalls, 1)
    assert.equal(nextError.code, 'AUTH_REQUIRED')
    assert.equal(nextError.status, 401)
  }

  assert.equal(model.calls, 0)
})

test('rejects a session whose database user no longer exists', async () => {
  const model = createUserModel(null)
  const middleware = createRequireVerifiedEmail({ User: model })

  const { nextError } = await runMiddleware(middleware, {
    auth: { userId: 'missing-user' },
  })

  assert.equal(nextError.code, 'SESSION_INVALID')
  assert.equal(nextError.status, 401)
})

test('rejects inactive accounts', async () => {
  const model = createUserModel(buildUser({ status: 'suspended' }))
  const middleware = createRequireVerifiedEmail({ User: model })

  const { nextError } = await runMiddleware(middleware, {
    auth: { userId: buildUser().id },
  })

  assert.equal(nextError.code, 'ACCOUNT_INACTIVE')
  assert.equal(nextError.status, 403)
})

test('rejects unverified accounts with a consistent verification error', async () => {
  for (const emailVerifiedAt of [null, undefined]) {
    const model = createUserModel(buildUser({ emailVerifiedAt }))
    const middleware = createRequireVerifiedEmail({ User: model })

    const { nextError } = await runMiddleware(middleware, {
      auth: { userId: buildUser().id },
    })

    assert.equal(nextError.code, 'EMAIL_VERIFICATION_REQUIRED')
    assert.equal(nextError.status, 403)
    assert.equal(nextError.expose, true)
    assert.equal(
      nextError.message,
      'Please verify your email address before performing this action.',
    )
  }
})

test('allows verified accounts and refreshes the request user from the database', async () => {
  const freshUser = buildUser()
  const staleUser = buildUser({ emailVerifiedAt: null })
  const model = createUserModel(freshUser)
  const middleware = createRequireVerifiedEmail({ User: model })
  const req = {
    auth: { userId: freshUser.id },
    user: staleUser,
  }

  const { nextCalls, nextError } = await runMiddleware(middleware, req)

  assert.equal(nextCalls, 1)
  assert.equal(nextError, undefined)
  assert.equal(req.user, freshUser)
  assert.equal(model.calls, 1)
})

test('never trusts a verification flag supplied on the request object', async () => {
  const model = createUserModel(buildUser({ emailVerifiedAt: null }))
  const middleware = createRequireVerifiedEmail({ User: model })

  const { nextError } = await runMiddleware(middleware, {
    auth: { userId: buildUser().id },
    user: buildUser({ emailVerifiedAt: new Date() }),
    body: { emailVerified: true },
  })

  assert.equal(nextError.code, 'EMAIL_VERIFICATION_REQUIRED')
  assert.equal(model.calls, 1)
})

test('re-reads the database on every request so changes apply immediately', async () => {
  const model = createUserModel(buildUser())
  const middleware = createRequireVerifiedEmail({ User: model })
  const req = { auth: { userId: buildUser().id } }

  await runMiddleware(middleware, req)
  await runMiddleware(middleware, req)

  assert.equal(model.calls, 2)
})

test('propagates database errors to the central error handler', async () => {
  const failure = new Error('database unavailable')
  const model = createUserModel(failure)
  const middleware = createRequireVerifiedEmail({ User: model })

  const { nextError } = await runMiddleware(middleware, {
    auth: { userId: buildUser().id },
  })

  assert.equal(nextError, failure)
})
