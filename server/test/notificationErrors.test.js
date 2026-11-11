'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { AuthError } = require('../src/utils/authErrors')
const {
  NotificationNotFoundError,
} = require('../src/utils/notificationErrors')

test('NotificationNotFoundError exposes the notification error contract', () => {
  const error = new NotificationNotFoundError()

  assert.ok(error instanceof AuthError)
  assert.ok(error instanceof Error)
  assert.equal(error.name, 'NotificationNotFoundError')
  assert.equal(error.code, 'NOTIFICATION_NOT_FOUND')
  assert.equal(error.status, 404)
  assert.equal(error.expose, true)
  assert.equal(error.message, 'Notification not found.')
  assert.doesNotMatch(error.message, /password|token|session/i)
})
