'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  PUBLIC_NOTIFICATION_FIELDS,
  toNotification,
} = require('../src/utils/safeNotification')

const ACTOR = {
  id: '11111111-1111-4111-8111-111111111111',
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

const PUBLIC_ACTOR_KEYS = [
  'bio',
  'createdAt',
  'fullName',
  'id',
  'profileImage',
]

const assertPublicActor = (actor) => {
  assert.deepEqual(Object.keys(actor).sort(), PUBLIC_ACTOR_KEYS)
  assert.equal(actor.email, undefined)
  assert.equal(actor.role, undefined)
  assert.equal(actor.status, undefined)
  assert.equal(actor.authVersion, undefined)
  assert.equal(actor.emailVerifiedAt, undefined)
  assert.equal(actor.passwordHash, undefined)
}

const createNotification = (overrides = {}) => ({
  id: '22222222-2222-4222-8222-222222222222',
  userId: '33333333-3333-4333-8333-333333333333',
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
  ...overrides,
})

test('notification serialization uses an explicit allowlist', () => {
  const notification = toNotification(createNotification())

  assert.deepEqual(Object.keys(notification).sort(), [
    ...PUBLIC_NOTIFICATION_FIELDS,
    'actor',
  ].sort())
  assert.equal(notification.userId, undefined)
  assert.equal(notification.actorId, undefined)
  assert.equal(notification.updatedAt, undefined)
})

test('notification serialization maps every public field', () => {
  const readAt = new Date('2026-01-05T00:00:00.000Z')
  const notification = toNotification(
    createNotification({
      type: 'trip_join_approved',
      message: 'Your trip request was approved.',
      referenceType: 'trip',
      referenceId: '44444444-4444-4444-8444-444444444444',
      isRead: true,
      readAt,
    }),
  )

  assert.equal(notification.id, '22222222-2222-4222-8222-222222222222')
  assert.equal(notification.type, 'trip_join_approved')
  assert.equal(
    notification.message,
    'Your trip request was approved.',
  )
  assert.equal(notification.referenceType, 'trip')
  assert.equal(
    notification.referenceId,
    '44444444-4444-4444-8444-444444444444',
  )
  assert.equal(notification.isRead, true)
  assert.equal(notification.readAt, readAt)
  assert.equal(notification.createdAt, '2026-01-03T00:00:00.000Z')
})

test('notification actor uses the public-profile serializer', () => {
  const notification = toNotification(createNotification())

  assertPublicActor(notification.actor)
  assert.deepEqual(notification.actor, {
    id: ACTOR.id,
    fullName: ACTOR.fullName,
    profileImage: ACTOR.profileImage,
    bio: ACTOR.bio,
    createdAt: ACTOR.createdAt,
  })
})

test('private actor fields are never exposed', () => {
  const notification = toNotification(createNotification())

  assertPublicActor(notification.actor)
  assert.equal(notification.actor.email, undefined)
  assert.equal(notification.actor.role, undefined)
  assert.equal(notification.actor.status, undefined)
  assert.equal(notification.actor.authVersion, undefined)
  assert.equal(notification.actor.emailVerifiedAt, undefined)
  assert.equal(notification.actor.passwordHash, undefined)
})

test('a null actor leaves the notification available', () => {
  const notification = toNotification(
    createNotification({ actorId: null, actor: null }),
  )

  assert.notEqual(notification, null)
  assert.equal(notification.id, '22222222-2222-4222-8222-222222222222')
  assert.equal(notification.actor, null)
})

test('a suspended actor serializes as null', () => {
  const suspended = { ...ACTOR, status: 'suspended' }
  const notification = toNotification(
    createNotification({ actorId: suspended.id, actor: suspended }),
  )

  assert.notEqual(notification, null)
  assert.equal(notification.id, '22222222-2222-4222-8222-222222222222')
  assert.equal(notification.actor, null)
})

test('null reference fields are preserved as a null pair', () => {
  const notification = toNotification(
    createNotification({
      referenceType: null,
      referenceId: null,
    }),
  )

  assert.equal(notification.referenceType, null)
  assert.equal(notification.referenceId, null)
})

test('serialization supports Sequelize-style model instances', () => {
  const instance = {
    get: () => createNotification(),
  }

  const notification = toNotification(instance)

  assert.equal(notification.type, 'new_follower')
  assertPublicActor(notification.actor)
  assert.equal(toNotification(null), null)
})
