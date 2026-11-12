'use strict'

process.env.NODE_ENV = 'test'
process.env.SESSION_SECRET =
  'test-only-session-secret-0123456789abcdef'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  createRequireAdmin,
} = require('../src/middlewares/requireAdmin')

const runMiddleware = async (middleware, req) => {
  let nextCalls = 0
  let nextError

  await middleware(req, {}, (err) => {
    nextCalls += 1
    nextError = err
  })

  return { nextCalls, nextError }
}

test('allows an admin user to proceed', async () => {
  const middleware = createRequireAdmin()
  const req = { auth: { userId: 'admin-id', role: 'admin' } }

  const { nextCalls, nextError } = await runMiddleware(middleware, req)

  assert.equal(nextCalls, 1)
  assert.equal(nextError, undefined)
})

test('rejects a regular user with a 403 admin-required error', async () => {
  const middleware = createRequireAdmin()
  const req = { auth: { userId: 'user-id', role: 'user' } }

  const { nextCalls, nextError } = await runMiddleware(middleware, req)

  assert.equal(nextCalls, 1)
  assert.equal(nextError.name, 'ReportAdminRequiredError')
  assert.equal(nextError.code, 'REPORT_ADMIN_REQUIRED')
  assert.equal(nextError.status, 403)
  assert.equal(nextError.expose, true)
  assert.equal(nextError.message, 'Admin access required.')
})

test('handles missing authentication context safely', async () => {
  const middleware = createRequireAdmin()

  for (const req of [{}, { auth: {} }, { auth: { userId: 'user-id' } }]) {
    const { nextCalls, nextError } = await runMiddleware(middleware, req)

    assert.equal(nextCalls, 1)
    assert.equal(nextError.code, 'REPORT_ADMIN_REQUIRED')
    assert.equal(nextError.status, 403)
  }
})

test('rejects unexpected role values', async () => {
  const middleware = createRequireAdmin()

  for (const role of [null, undefined, 'moderator', 'editor', 'ADMIN', 'user']) {
    const req = { auth: { userId: 'user-id', role } }

    const { nextCalls, nextError } = await runMiddleware(middleware, req)

    assert.equal(nextCalls, 1)
    assert.equal(nextError.code, 'REPORT_ADMIN_REQUIRED')
    assert.equal(nextError.status, 403)
  }
})
