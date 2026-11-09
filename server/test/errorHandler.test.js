'use strict'

process.env.NODE_ENV = 'test'
process.env.SESSION_SECRET =
  'test-only-session-secret-0123456789abcdef'
process.env.DB_NAME = process.env.DB_NAME || 'tafera_test'
process.env.DB_USER = process.env.DB_USER || 'tafera_test_user'
process.env.ARGON2_MAX_QUEUE = '50'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const errorHandler = require('../src/middlewares/errorHandler')
const {
  PasswordServiceBusyError,
} = require('../src/services/passwordService')

const createResponse = () => ({
  headersSent: false,
  headers: {},
  statusCode: 200,
  body: null,
  set(name, value) {
    this.headers[name] = value
    return this
  },
  status(code) {
    this.statusCode = code
    return this
  },
  json(body) {
    this.body = body
    return this
  },
})

const withSilencedErrorLog = (callback) => {
  const original = console.error
  console.error = () => {}

  try {
    return callback()
  } finally {
    console.error = original
  }
}

test('PASSWORD_SERVICE_BUSY returns a safe 503 without internal details', () => {
  withSilencedErrorLog(() => {
    const res = createResponse()
    const error = new PasswordServiceBusyError()
    error.details = [{ internal: 'must not be exposed' }]

    errorHandler(
      error,
      { method: 'POST', originalUrl: '/api/auth/login' },
      res,
      () => {
        throw new Error('next must not be called')
      },
    )

    assert.equal(res.statusCode, 503)
    assert.equal(res.headers['Cache-Control'], 'no-store')
    assert.deepEqual(res.body, {
      error: {
        code: 'PASSWORD_SERVICE_BUSY',
        message:
          'The password service is temporarily busy. Please try again later.',
        status: 503,
      },
    })
    assert.equal('stack' in res.body.error, false)
    assert.equal(JSON.stringify(res.body).includes('$argon2'), false)
  })
})

test('unrelated 503 responses remain generic', () => {
  withSilencedErrorLog(() => {
    const res = createResponse()
    const error = new Error('internal connection details')
    error.status = 503

    errorHandler(
      error,
      { method: 'GET', originalUrl: '/api/ready' },
      res,
      () => {
        throw new Error('next must not be called')
      },
    )

    assert.equal(res.statusCode, 503)
    assert.equal(res.body.error.code, 'SERVICE_UNAVAILABLE')
    assert.equal(
      res.body.error.message,
      'The service is temporarily unavailable.',
    )
    assert.equal(
      res.body.error.message.includes('internal connection details'),
      false,
    )
  })
})
