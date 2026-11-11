'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  createNotificationService,
} = require('../src/services/notificationService')
const {
  PUBLIC_NOTIFICATION_FIELDS,
} = require('../src/utils/safeNotification')
const {
  NotificationNotFoundError,
} = require('../src/utils/notificationErrors')

const USER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222'
const NOTIFICATION_ID = '33333333-3333-4333-8333-333333333333'
const OTHER_NOTIFICATION_ID = '44444444-4444-4444-8444-444444444444'

const ACTOR = {
  id: '55555555-5555-4555-8555-555555555555',
  fullName: 'Ada Lovelace',
  email: 'ada@example.com',
  profileImage: 'https://example.com/ada.png',
  bio: 'Mathematician',
  role: 'admin',
  status: 'active',
  authVersion: 7,
  emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
  passwordHash: 'secret-hash',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
}

const createNotificationRecord = (overrides = {}) => {
  const record = {
    id: NOTIFICATION_ID,
    userId: USER_ID,
    actorId: ACTOR.id,
    type: 'new_follower',
    message: 'Ada Lovelace started following you.',
    referenceType: 'user',
    referenceId: ACTOR.id,
    isRead: false,
    readAt: null,
    createdAt: '2026-01-03T00:00:00.000Z',
    updatedAt: '2026-01-04T00:00:00.000Z',
    actor: ACTOR,
    updates: [],
    async update(values) {
      record.updates.push(values)
      Object.assign(record, values)
    },
  }

  return Object.assign(record, overrides)
}

const createService = ({
  rows = [],
  total = 0,
  unreadCount = 0,
  notification = null,
  updatedCount = 0,
} = {}) => {
  const calls = {
    count: [],
    findAndCountAll: [],
    findOne: [],
    update: [],
  }

  const Notification = {
    async findAndCountAll(options) {
      calls.findAndCountAll.push(options)
      return { count: total, rows }
    },
    async count(options) {
      calls.count.push(options)
      return unreadCount
    },
    async findOne(options) {
      calls.findOne.push(options)
      return notification
    },
    async update(values, options) {
      calls.update.push({ values, options })
      return [updatedCount]
    },
  }

  return {
    calls,
    service: createNotificationService({ Notification, User: {} }),
  }
}

test('listNotifications scopes queries to the authenticated user and orders newest first', async () => {
  const row = createNotificationRecord()
  const { calls, service } = createService({ rows: [row], total: 1 })

  const result = await service.listNotifications(USER_ID, {
    page: 1,
    limit: 20,
  })

  assert.deepEqual(calls.findAndCountAll[0].where, { userId: USER_ID })
  assert.deepEqual(calls.findAndCountAll[0].order, [
    ['createdAt', 'DESC'],
    ['id', 'DESC'],
  ])
  assert.equal(calls.findAndCountAll[0].limit, 20)
  assert.equal(calls.findAndCountAll[0].offset, 0)

  assert.equal(result.notifications.length, 1)
  assert.deepEqual(
    Object.keys(result.notifications[0]).sort(),
    [...PUBLIC_NOTIFICATION_FIELDS, 'actor'].sort(),
  )
  assert.equal(result.notifications[0].actor.email, undefined)
  assert.equal(result.notifications[0].actor.role, undefined)
  assert.equal(result.notifications[0].actor.status, undefined)
  assert.equal(result.notifications[0].actor.passwordHash, undefined)
  assert.deepEqual(result.pagination, {
    page: 1,
    limit: 20,
    total: 1,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  })
})

test('listNotifications applies the default page and limit', async () => {
  const { calls, service } = createService()

  const result = await service.listNotifications(USER_ID)

  assert.equal(calls.findAndCountAll[0].limit, 20)
  assert.equal(calls.findAndCountAll[0].offset, 0)
  assert.equal(result.pagination.page, 1)
  assert.equal(result.pagination.limit, 20)
})

test('listNotifications filters unread notifications and applies pagination offsets', async () => {
  const { calls, service } = createService()

  await service.listNotifications(USER_ID, {
    page: 2,
    limit: 10,
    unreadOnly: true,
  })

  assert.deepEqual(calls.findAndCountAll[0].where, {
    userId: USER_ID,
    isRead: false,
  })
  assert.equal(calls.findAndCountAll[0].offset, 10)
  assert.equal(calls.findAndCountAll[0].limit, 10)
})

test('listNotifications does not filter by read state unless requested', async () => {
  const { calls, service } = createService()

  await service.listNotifications(USER_ID, {
    page: 1,
    limit: 20,
    unreadOnly: false,
  })

  assert.deepEqual(calls.findAndCountAll[0].where, { userId: USER_ID })
})

test('listNotifications returns empty pagination metadata', async () => {
  const { service } = createService({ rows: [], total: 0 })

  const result = await service.listNotifications(USER_ID, {
    page: 1,
    limit: 20,
  })

  assert.deepEqual(result.notifications, [])
  assert.deepEqual(result.pagination, {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  })
})

test('listNotifications serializes a suspended actor as null without hiding the notification', async () => {
  const suspended = { ...ACTOR, status: 'suspended' }
  const row = createNotificationRecord({ actor: suspended })
  const { service } = createService({ rows: [row], total: 1 })

  const result = await service.listNotifications(USER_ID, {
    page: 1,
    limit: 20,
  })

  assert.equal(result.notifications.length, 1)
  assert.equal(result.notifications[0].id, NOTIFICATION_ID)
  assert.equal(result.notifications[0].actor, null)
})

test('getUnreadCount scopes the count to the authenticated user', async () => {
  const { calls, service } = createService({ unreadCount: 4 })

  const result = await service.getUnreadCount(USER_ID)

  assert.deepEqual(result, { unreadCount: 4 })
  assert.deepEqual(calls.count[0].where, {
    userId: USER_ID,
    isRead: false,
  })
})

test('markNotificationAsRead sets isRead and readAt together', async () => {
  const row = createNotificationRecord()
  const { calls, service } = createService({ notification: row })

  const result = await service.markNotificationAsRead(
    USER_ID,
    NOTIFICATION_ID,
  )

  assert.deepEqual(calls.findOne[0].where, {
    id: NOTIFICATION_ID,
    userId: USER_ID,
  })
  assert.equal(row.updates.length, 1)
  assert.equal(row.updates[0].isRead, true)
  assert.ok(row.updates[0].readAt instanceof Date)
  assert.equal(result.id, NOTIFICATION_ID)
  assert.equal(result.isRead, true)
  assert.equal(result.readAt, row.updates[0].readAt)
})

test('markNotificationAsRead does not change an already-read readAt timestamp', async () => {
  const readAt = new Date('2026-01-06T00:00:00.000Z')
  const row = createNotificationRecord({ isRead: true, readAt })
  const { service } = createService({ notification: row })

  const result = await service.markNotificationAsRead(
    USER_ID,
    NOTIFICATION_ID,
  )

  assert.equal(row.updates.length, 0)
  assert.equal(result.isRead, true)
  assert.equal(result.readAt, readAt)
})

test('markAllNotificationsAsRead updates only the authenticated user unread rows', async () => {
  const { calls, service } = createService({ updatedCount: 3 })

  const result = await service.markAllNotificationsAsRead(USER_ID)

  assert.deepEqual(result, { updatedCount: 3 })
  assert.equal(calls.update.length, 1)
  assert.equal(calls.update[0].values.isRead, true)
  assert.ok(calls.update[0].values.readAt instanceof Date)
  assert.deepEqual(calls.update[0].options.where, {
    userId: USER_ID,
    isRead: false,
  })
})

test('missing and foreign notifications return the same not-found error', async () => {
  const { calls, service } = createService({ notification: null })

  const capture = async (notificationId) => {
    try {
      await service.markNotificationAsRead(USER_ID, notificationId)
      assert.fail('Expected a NotificationNotFoundError')
    } catch (error) {
      return error
    }
  }

  const missing = await capture(NOTIFICATION_ID)
  const foreign = await capture(OTHER_NOTIFICATION_ID)

  assert.ok(missing instanceof NotificationNotFoundError)
  assert.ok(foreign instanceof NotificationNotFoundError)
  assert.equal(missing.constructor, foreign.constructor)
  assert.equal(missing.name, foreign.name)
  assert.equal(missing.code, foreign.code)
  assert.equal(missing.status, foreign.status)
  assert.equal(missing.message, foreign.message)
  assert.equal(missing.code, 'NOTIFICATION_NOT_FOUND')
  assert.equal(missing.status, 404)

  assert.deepEqual(calls.findOne[0].where, {
    id: NOTIFICATION_ID,
    userId: USER_ID,
  })
  assert.deepEqual(calls.findOne[1].where, {
    id: OTHER_NOTIFICATION_ID,
    userId: USER_ID,
  })
  assert.notEqual(USER_ID, OTHER_USER_ID)
})
