'use strict'

process.env.NODE_ENV = 'test'
process.env.SESSION_SECRET =
  'test-only-session-secret-0123456789abcdef'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  createNotificationController,
} = require('../src/controllers/notificationController')
const { ValidationError } = require('../src/utils/authErrors')
const {
  NotificationNotFoundError,
} = require('../src/utils/notificationErrors')

const USER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222'
const NOTIFICATION_ID = '33333333-3333-4333-8333-333333333333'

const NOTIFICATION = {
  id: NOTIFICATION_ID,
  type: 'new_follower',
  message: 'Ada Lovelace started following you.',
  referenceType: 'user',
  referenceId: USER_ID,
  isRead: false,
  readAt: null,
  createdAt: new Date('2026-01-03T00:00:00.000Z'),
  actor: {
    id: USER_ID,
    fullName: 'Ada Lovelace',
    profileImage: null,
    bio: 'Mathematician',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  },
}

const PAGINATION = {
  page: 1,
  limit: 20,
  total: 1,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
}

const createResponse = () => {
  const headers = {}
  const res = {
    headers,
    statusCode: null,
    body: undefined,
    set(name, value) {
      headers[name] = value
      return res
    },
    status(code) {
      res.statusCode = code
      return res
    },
    json(payload) {
      res.body = payload
      return res
    },
  }

  return res
}

const createService = (results = {}) => {
  const calls = {
    getUnreadCount: [],
    listNotifications: [],
    markAllNotificationsAsRead: [],
    markNotificationAsRead: [],
  }

  const defaults = {
    getUnreadCount: { unreadCount: 1 },
    listNotifications: {
      notifications: [NOTIFICATION],
      pagination: PAGINATION,
    },
    markAllNotificationsAsRead: { updatedCount: 2 },
    markNotificationAsRead: NOTIFICATION,
  }

  const service = {}

  for (const name of Object.keys(calls)) {
    service[name] = async (...args) => {
      calls[name].push(args)
      const result = Object.hasOwn(results, name)
        ? results[name]
        : defaults[name]

      if (result instanceof Error) throw result

      return result
    }
  }

  return { calls, service }
}

const createRequest = (overrides = {}) => ({
  params: {},
  query: {},
  body: {},
  auth: { userId: USER_ID },
  ...overrides,
})

const invoke = async (action, req) => {
  const res = createResponse()
  const errors = []
  const next = (error) => errors.push(error)

  await action(req, res, next)

  return { res, errors }
}

const controllerFor = (service) =>
  createNotificationController({ notificationService: service })

const assertNoStore = (res) => {
  assert.equal(res.headers['Cache-Control'], 'no-store')
}

test('controller exposes only the approved notification actions', () => {
  const controller = controllerFor(createService().service)

  assert.deepEqual(Object.keys(controller).sort(), [
    'list',
    'markAllAsRead',
    'markAsRead',
    'unreadCount',
  ])
  assert.equal(controller.remove, undefined)
  assert.equal(controller.delete, undefined)
})

test('list parses query values and returns the paginated envelope', async () => {
  const { calls, service } = createService()
  const controller = controllerFor(service)

  const { res, errors } = await invoke(
    controller.list,
    createRequest({
      query: {
        page: '2',
        limit: '10',
        unreadOnly: 'true',
        userId: OTHER_USER_ID,
      },
    }),
  )

  assert.deepEqual(errors, [])
  assert.equal(res.statusCode, 200)
  assertNoStore(res)
  assert.deepEqual(res.body, {
    data: {
      notifications: [NOTIFICATION],
      pagination: PAGINATION,
    },
  })
  assert.deepEqual(calls.listNotifications, [
    [USER_ID, { page: 2, limit: 10, unreadOnly: true }],
  ])
})

test('list applies pagination and unread defaults', async () => {
  const { calls, service } = createService()
  const controller = controllerFor(service)

  const { res, errors } = await invoke(
    controller.list,
    createRequest(),
  )

  assert.deepEqual(errors, [])
  assert.equal(res.statusCode, 200)
  assert.deepEqual(calls.listNotifications, [
    [USER_ID, { page: 1, limit: 20, unreadOnly: false }],
  ])
})

test('unreadCount returns the authenticated user count', async () => {
  const { calls, service } = createService({
    getUnreadCount: { unreadCount: 4 },
  })
  const controller = controllerFor(service)

  const { res, errors } = await invoke(
    controller.unreadCount,
    createRequest({ query: { userId: OTHER_USER_ID } }),
  )

  assert.deepEqual(errors, [])
  assert.equal(res.statusCode, 200)
  assertNoStore(res)
  assert.deepEqual(res.body, { data: { unreadCount: 4 } })
  assert.deepEqual(calls.getUnreadCount, [[USER_ID]])
})

test('markAsRead normalizes the ID and uses only the authenticated identity', async () => {
  const { calls, service } = createService()
  const controller = controllerFor(service)

  const { res, errors } = await invoke(
    controller.markAsRead,
    createRequest({
      params: { notificationId: NOTIFICATION_ID.toUpperCase() },
      body: { userId: OTHER_USER_ID },
      query: { userId: OTHER_USER_ID },
    }),
  )

  assert.deepEqual(errors, [])
  assert.equal(res.statusCode, 200)
  assertNoStore(res)
  assert.deepEqual(res.body, { data: { notification: NOTIFICATION } })
  assert.deepEqual(calls.markNotificationAsRead, [
    [USER_ID, NOTIFICATION_ID],
  ])
})

test('markAllAsRead returns the updated count envelope', async () => {
  const { calls, service } = createService({
    markAllNotificationsAsRead: { updatedCount: 3 },
  })
  const controller = controllerFor(service)

  const { res, errors } = await invoke(
    controller.markAllAsRead,
    createRequest({ body: { userId: OTHER_USER_ID } }),
  )

  assert.deepEqual(errors, [])
  assert.equal(res.statusCode, 200)
  assertNoStore(res)
  assert.deepEqual(res.body, { data: { updatedCount: 3 } })
  assert.deepEqual(calls.markAllNotificationsAsRead, [[USER_ID]])
})

test('invalid notification IDs are forwarded before the service runs', async () => {
  const { calls, service } = createService()
  const controller = controllerFor(service)

  const { res, errors } = await invoke(
    controller.markAsRead,
    createRequest({
      params: { notificationId: 'not-a-uuid' },
    }),
  )

  assert.equal(errors.length, 1)
  assert.ok(errors[0] instanceof ValidationError)
  assert.equal(errors[0].code, 'VALIDATION_ERROR')
  assert.equal(errors[0].status, 400)
  assert.equal(res.statusCode, null)
  assert.equal(res.body, undefined)
  assert.deepEqual(calls.markNotificationAsRead, [])
})

test('invalid list queries are forwarded before the service runs', async () => {
  const controller = controllerFor(createService().service)

  for (const query of [
    { page: '0' },
    { limit: '51' },
    { unreadOnly: 'yes' },
  ]) {
    const { res, errors } = await invoke(
      controller.list,
      createRequest({ query }),
    )

    assert.equal(errors.length, 1)
    assert.ok(errors[0] instanceof ValidationError)
    assert.equal(errors[0].code, 'VALIDATION_ERROR')
    assert.equal(res.statusCode, null)
    assert.equal(res.body, undefined)
  }
})

test('service errors are forwarded to the error middleware', async () => {
  const { service } = createService({
    markNotificationAsRead: new NotificationNotFoundError(),
  })
  const controller = controllerFor(service)

  const { res, errors } = await invoke(
    controller.markAsRead,
    createRequest({
      params: { notificationId: NOTIFICATION_ID },
    }),
  )

  assert.equal(errors.length, 1)
  assert.ok(errors[0] instanceof NotificationNotFoundError)
  assert.equal(errors[0].code, 'NOTIFICATION_NOT_FOUND')
  assert.equal(errors[0].status, 404)
  assert.equal(res.statusCode, null)
  assert.equal(res.body, undefined)
})
