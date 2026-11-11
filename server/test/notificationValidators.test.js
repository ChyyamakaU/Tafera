'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { ValidationError } = require('../src/utils/authErrors')
const {
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  MAX_LIMIT,
  parseNotificationId,
  parseNotificationListQuery,
} = require('../src/validators/notification')

const NOTIFICATION_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_ID = '22222222-2222-4222-8222-222222222222'

const assertValidationError = (callback) => {
  let caught

  try {
    callback()
  } catch (error) {
    caught = error
  }

  assert.ok(caught instanceof ValidationError)
  assert.equal(caught.code, 'VALIDATION_ERROR')
  assert.equal(caught.status, 400)
  assert.equal(caught.expose, true)
  assert.ok(Array.isArray(caught.details))
  assert.ok(caught.details.length > 0)

  return caught
}

test('notification IDs are validated and normalized', () => {
  assert.deepEqual(
    parseNotificationId({ notificationId: NOTIFICATION_ID }),
    { notificationId: NOTIFICATION_ID },
  )
  assert.deepEqual(
    parseNotificationId({
      notificationId: NOTIFICATION_ID.toUpperCase(),
    }),
    { notificationId: NOTIFICATION_ID },
  )
  assert.deepEqual(
    parseNotificationId({ notificationId: ` ${NOTIFICATION_ID} ` }),
    { notificationId: NOTIFICATION_ID },
  )
  assert.deepEqual(
    parseNotificationId({
      notificationId: NOTIFICATION_ID,
      userId: OTHER_ID,
    }),
    { notificationId: NOTIFICATION_ID },
  )
})

test('malformed notification IDs are rejected', () => {
  const malformed = assertValidationError(() =>
    parseNotificationId({ notificationId: 'not-a-uuid' }),
  )

  assert.deepEqual(malformed.details, [
    {
      field: 'notificationId',
      message: 'Enter a valid notification ID.',
    },
  ])

  assertValidationError(() => parseNotificationId({}))
  assertValidationError(() =>
    parseNotificationId({ notificationId: '' }),
  )
  assertValidationError(() =>
    parseNotificationId({ notificationId: 42 }),
  )
})

test('notification list queries apply default pagination and unreadOnly values', () => {
  assert.deepEqual(parseNotificationListQuery({}), {
    page: DEFAULT_PAGE,
    limit: DEFAULT_LIMIT,
    unreadOnly: false,
  })
  assert.deepEqual(parseNotificationListQuery(undefined), {
    page: DEFAULT_PAGE,
    limit: DEFAULT_LIMIT,
    unreadOnly: false,
  })
  assert.deepEqual(
    parseNotificationListQuery({ page: '3', limit: '10' }),
    { page: 3, limit: 10, unreadOnly: false },
  )
})

test('notification list limit accepts 50 and rejects larger values', () => {
  assert.deepEqual(
    parseNotificationListQuery({ limit: String(MAX_LIMIT) }),
    { page: DEFAULT_PAGE, limit: MAX_LIMIT, unreadOnly: false },
  )

  const error = assertValidationError(() =>
    parseNotificationListQuery({ limit: String(MAX_LIMIT + 1) }),
  )
  assert.deepEqual(error.details, [
    {
      field: 'limit',
      message: `Limit must be at most ${MAX_LIMIT}.`,
    },
  ])
})

test('invalid notification pagination values are rejected', () => {
  for (const page of ['0', '-1', '1.5', 'many', '']) {
    const error = assertValidationError(() =>
      parseNotificationListQuery({ page }),
    )
    assert.equal(error.details[0].field, 'page')
  }

  for (const limit of ['0', '-1', '1.5', 'many', '']) {
    const error = assertValidationError(() =>
      parseNotificationListQuery({ limit }),
    )
    assert.equal(error.details[0].field, 'limit')
  }
})

test('unreadOnly parses true and false query-string values', () => {
  assert.equal(
    parseNotificationListQuery({ unreadOnly: 'true' }).unreadOnly,
    true,
  )
  assert.equal(
    parseNotificationListQuery({ unreadOnly: 'false' }).unreadOnly,
    false,
  )
  assert.equal(
    parseNotificationListQuery({ unreadOnly: true }).unreadOnly,
    true,
  )
  assert.equal(
    parseNotificationListQuery({ unreadOnly: false }).unreadOnly,
    false,
  )
  assert.equal(
    parseNotificationListQuery({ unreadOnly: ' TRUE ' }).unreadOnly,
    true,
  )
  assert.equal(
    parseNotificationListQuery({ unreadOnly: ' FALSE ' }).unreadOnly,
    false,
  )
})

test('invalid unreadOnly values are rejected', () => {
  for (const unreadOnly of ['yes', '1', '0', '', null, [], {}]) {
    const error = assertValidationError(() =>
      parseNotificationListQuery({ unreadOnly }),
    )
    assert.equal(error.details[0].field, 'unreadOnly')
  }
})

test('unknown notification query fields are stripped', () => {
  assert.deepEqual(
    parseNotificationListQuery({
      page: '2',
      limit: '10',
      unreadOnly: 'false',
      userId: OTHER_ID,
      notificationId: NOTIFICATION_ID,
      sort: 'oldest',
      isRead: 'true',
    }),
    { page: 2, limit: 10, unreadOnly: false },
  )
})
