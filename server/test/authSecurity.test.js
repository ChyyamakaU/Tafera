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
  parseRegistration,
  parseLogin,
} = require('../src/validators/auth')
const {
  deriveCsrfToken,
  isValidCsrfToken,
} = require('../src/utils/csrf')
const {
  createCsrfProtection,
} = require('../src/middlewares/csrfProtection')
const { CsrfError, ValidationError } = require('../src/utils/authErrors')

const CSRF_SECRET = 'a'.repeat(43)

const runMiddleware = (middleware, req) =>
  new Promise((resolve) => {
    middleware(req, {}, (error) => resolve(error))
  })

test('registration validation trims fields and strips protected properties', () => {
  const input = parseRegistration({
    fullName: '  Ada Lovelace  ',
    email: '  ADA@Example.COM ',
    password: 'a sufficiently long passphrase',
    role: 'admin',
    status: 'suspended',
    authVersion: 999,
    passwordHash: 'attacker-controlled',
  })

  assert.deepEqual(input, {
    fullName: 'Ada Lovelace',
    email: 'ada@example.com',
    password: 'a sufficiently long passphrase',
  })
  assert.equal('role' in input, false)
  assert.equal('status' in input, false)
  assert.equal('authVersion' in input, false)
})

test('registration rejects missing, malformed and weak input', () => {
  for (const input of [
    {},
    { fullName: 'A', email: 'ada@example.com', password: 'a long passphrase' },
    { fullName: 'Ada', email: 'not-an-email', password: 'a long passphrase' },
    { fullName: 'Ada', email: 'ada@example.com', password: 'short' },
  ]) {
    assert.throws(
      () => parseRegistration(input),
      (error) => {
        assert.ok(error instanceof ValidationError)
        assert.equal(error.status, 400)
        assert.equal(error.code, 'VALIDATION_ERROR')
        assert.ok(Array.isArray(error.details))
        return true
      },
    )
  }
})

test('validation details never contain the submitted password', () => {
  const password = 'short'

  assert.throws(
    () =>
      parseRegistration({
        fullName: 'Ada',
        email: 'ada@example.com',
        password,
      }),
    (error) => {
      assert.ok(error instanceof ValidationError)
      assert.equal(JSON.stringify(error.details).includes(password), false)
      return true
    },
  )
})

test('login validation accepts any non-empty bounded password', () => {
  const input = parseLogin({
    email: ' ADA@Example.COM ',
    password: 'x',
    role: 'admin',
  })

  assert.deepEqual(input, {
    email: 'ada@example.com',
    password: 'x',
  })
})

test('login rejects missing fields and oversized passwords', () => {
  assert.throws(() => parseLogin({}), ValidationError)
  assert.throws(
    () => parseLogin({ email: 'ada@example.com', password: 'x'.repeat(129) }),
    ValidationError,
  )
})

test('CSRF tokens are deterministic per session and do not expose the secret', () => {
  const first = deriveCsrfToken(CSRF_SECRET)
  const second = deriveCsrfToken(CSRF_SECRET)
  const other = deriveCsrfToken('b'.repeat(43))

  assert.equal(first, second)
  assert.notEqual(first, other)
  assert.notEqual(first, CSRF_SECRET)
  assert.equal(first.length, 43)
})

test('CSRF validation accepts only the matching token', () => {
  const session = { csrfSecret: CSRF_SECRET }
  const token = deriveCsrfToken(CSRF_SECRET)

  assert.equal(isValidCsrfToken(session, token), true)
  assert.equal(isValidCsrfToken(session, 'wrong'), false)
  assert.equal(isValidCsrfToken(session, ''), false)
  assert.equal(isValidCsrfToken(session, undefined), false)
  assert.equal(isValidCsrfToken({}, token), false)
  assert.equal(isValidCsrfToken(null, token), false)
})

test('CSRF middleware ignores safe HTTP methods', async () => {
  const middleware = createCsrfProtection()

  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    const error = await runMiddleware(middleware, {
      method,
      session: { csrfSecret: CSRF_SECRET },
      get: () => undefined,
      body: {},
    })

    assert.equal(error, undefined)
  }
})

test('CSRF middleware rejects unsafe requests without a managed session', async () => {
  const middleware = createCsrfProtection()

  const error = await runMiddleware(middleware, {
    method: 'POST',
    session: {},
    get: () => undefined,
    body: {},
  })

  assert.ok(error instanceof CsrfError)
  assert.equal(error.status, 403)
  assert.equal(error.code, 'CSRF_TOKEN_INVALID')
})

test('CSRF middleware allows a missing session when explicitly configured', async () => {
  const middleware = createCsrfProtection({ allowMissingSession: true })

  const error = await runMiddleware(middleware, {
    method: 'POST',
    session: {},
    get: () => undefined,
    body: {},
  })

  assert.equal(error, undefined)
})

test('CSRF middleware rejects missing and invalid tokens for session requests', async () => {
  const middleware = createCsrfProtection()
  const session = { csrfSecret: CSRF_SECRET }

  const missing = await runMiddleware(middleware, {
    method: 'POST',
    session,
    get: () => undefined,
    body: {},
  })
  const invalid = await runMiddleware(middleware, {
    method: 'POST',
    session,
    get: () => 'not-the-token',
    body: {},
  })

  assert.ok(missing instanceof CsrfError)
  assert.ok(invalid instanceof CsrfError)
})

test('CSRF middleware accepts a valid header or body token', async () => {
  const middleware = createCsrfProtection()
  const session = { csrfSecret: CSRF_SECRET }
  const token = deriveCsrfToken(CSRF_SECRET)

  const headerError = await runMiddleware(middleware, {
    method: 'POST',
    session,
    get: (name) => (name === 'x-csrf-token' ? token : undefined),
    body: {},
  })
  const bodyError = await runMiddleware(middleware, {
    method: 'DELETE',
    session,
    get: () => undefined,
    body: { _csrf: token },
  })

  assert.equal(headerError, undefined)
  assert.equal(bodyError, undefined)
})
