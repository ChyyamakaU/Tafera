'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  NOTIFICATION_REFERENCE_TYPES,
  SUPPORTED_NOTIFICATION_TYPES,
  createNotificationCreationService,
  notificationCreationService,
} = require('../src/services/notificationCreationService')
const { ValidationError } = require('../src/utils/authErrors')

const RECIPIENT_ID = '11111111-1111-4111-8111-111111111111'
const ACTOR_ID = '22222222-2222-4222-8222-222222222222'
const REFERENCE_ID = '33333333-3333-4333-8333-333333333333'

const SUPPORTED_TYPES = [
  'new_follower',
  'post_comment',
  'trip_join_request',
  'trip_join_approved',
  'trip_join_rejected',
]

const createModel = (created = {}) => {
  const calls = []

  const model = {
    calls,
    async create(values, options) {
      calls.push({ values, options })
      return {
        id: '44444444-4444-4444-8444-444444444444',
        ...values,
        ...created,
      }
    },
  }

  return model
}

const createService = (created) => {
  const model = createModel(created)
  const service = createNotificationCreationService({
    Notification: model,
  })

  return { calls: model.calls, model, service }
}

const baseInput = (overrides = {}) => ({
  recipientId: RECIPIENT_ID,
  actorId: ACTOR_ID,
  type: 'new_follower',
  message: 'Ada Lovelace started following you.',
  ...overrides,
})

const assertValidationError = (error, fields) => {
  assert.ok(error instanceof ValidationError)
  assert.equal(error.code, 'VALIDATION_ERROR')
  assert.equal(error.status, 400)
  assert.equal(error.message, 'The request could not be validated.')
  assert.deepEqual(
    error.details.map((detail) => detail.field),
    fields,
  )

  for (const detail of error.details) {
    assert.equal(typeof detail.message, 'string')
    assert.ok(detail.message.length > 0)
  }
}

test('exposes the supported notification and reference type sets', () => {
  assert.deepEqual(SUPPORTED_NOTIFICATION_TYPES, SUPPORTED_TYPES)
  assert.deepEqual(NOTIFICATION_REFERENCE_TYPES, [
    'user',
    'post',
    'comment',
    'trip',
  ])
  assert.ok(Object.isFrozen(SUPPORTED_NOTIFICATION_TYPES))
  assert.ok(Object.isFrozen(NOTIFICATION_REFERENCE_TYPES))
  assert.equal(SUPPORTED_NOTIFICATION_TYPES.includes('post_like'), false)
  assert.equal(
    typeof notificationCreationService.createNotification,
    'function',
  )
})

test('creates a notification for every supported type', async () => {
  for (const type of SUPPORTED_TYPES) {
    const { calls, service } = createService()

    const notification = await service.createNotification(
      baseInput({
        type,
        message: `Message for ${type}.`,
        referenceType: 'trip',
        referenceId: REFERENCE_ID,
      }),
    )

    assert.deepEqual(calls, [
      {
        values: {
          userId: RECIPIENT_ID,
          actorId: ACTOR_ID,
          type,
          message: `Message for ${type}.`,
          referenceType: 'trip',
          referenceId: REFERENCE_ID,
        },
        options: { transaction: undefined },
      },
    ])
    assert.equal(notification.type, type)
    assert.equal(notification.userId, RECIPIENT_ID)
  }
})

test('maps recipientId to userId and forwards the supplied transaction', async () => {
  const { calls, service } = createService()
  const transaction = { id: 'transaction-1', commit: async () => {} }

  const notification = await service.createNotification(
    baseInput({
      type: 'post_comment',
      referenceType: 'post',
      referenceId: REFERENCE_ID,
      transaction,
    }),
  )

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].values, {
    userId: RECIPIENT_ID,
    actorId: ACTOR_ID,
    type: 'post_comment',
    message: 'Ada Lovelace started following you.',
    referenceType: 'post',
    referenceId: REFERENCE_ID,
  })
  assert.equal(calls[0].options.transaction, transaction)
  assert.equal(notification.userId, RECIPIENT_ID)
})

test('normalizes omitted reference fields to null', async () => {
  const { calls, service } = createService()

  await service.createNotification(baseInput())

  assert.equal(calls[0].values.referenceType, null)
  assert.equal(calls[0].values.referenceId, null)
})

test('suppresses self-notifications without touching the model', async () => {
  const { calls, service } = createService()

  const notification = await service.createNotification(
    baseInput({
      recipientId: ACTOR_ID,
      actorId: ACTOR_ID,
      transaction: { id: 'transaction-1' },
    }),
  )

  assert.equal(notification, null)
  assert.deepEqual(calls, [])
})

test('suppresses self-notifications only after input validation passes', async () => {
  const { calls, service } = createService()

  await assert.rejects(
    service.createNotification(
      baseInput({
        recipientId: ACTOR_ID,
        actorId: ACTOR_ID,
        type: 'post_like',
      }),
    ),
    (error) => {
      assertValidationError(error, ['type'])
      return true
    },
  )

  assert.deepEqual(calls, [])
})

test('rejects post_like and unknown types as unsupported', async () => {
  for (const type of ['post_like', 'unfollowed', 'NEW_FOLLOWER']) {
    const { calls, service } = createService()

    await assert.rejects(
      service.createNotification(baseInput({ type })),
      (error) => {
        assertValidationError(error, ['type'])
        assert.equal(error.details[0].message, 'Unsupported notification type.')
        return true
      },
    )

    assert.deepEqual(calls, [])
  }
})

test('rejects missing required inputs with field details', async () => {
  const cases = [
    [{ recipientId: undefined }, ['recipientId']],
    [{ recipientId: '' }, ['recipientId']],
    [{ recipientId: '   ' }, ['recipientId']],
    [{ actorId: undefined }, ['actorId']],
    [{ actorId: '' }, ['actorId']],
    [{ type: undefined }, ['type']],
    [{ type: '' }, ['type']],
    [{ message: undefined }, ['message']],
    [{ message: '' }, ['message']],
    [{ message: '   ' }, ['message']],
  ]

  for (const [overrides, fields] of cases) {
    const { calls, service } = createService()

    await assert.rejects(
      service.createNotification(baseInput(overrides)),
      (error) => {
        assertValidationError(error, fields)
        return true
      },
    )

    assert.deepEqual(calls, [])
  }
})

test('collects every missing required field in one error', async () => {
  const { calls, service } = createService()

  await assert.rejects(
    service.createNotification({
      recipientId: null,
      actorId: ' ',
      message: '',
    }),
    (error) => {
      assertValidationError(error, ['recipientId', 'actorId', 'type', 'message'])
      return true
    },
  )

  assert.deepEqual(calls, [])
})

test('requires reference type and reference ID to be supplied together', async () => {
  const cases = [
    [
      { referenceType: 'post', referenceId: null },
      ['referenceId'],
      'Reference type and reference ID must both be set or both be null.',
    ],
    [
      { referenceType: null, referenceId: REFERENCE_ID },
      ['referenceType'],
      'Reference type and reference ID must both be set or both be null.',
    ],
  ]

  for (const [overrides, fields, message] of cases) {
    const { calls, service } = createService()

    await assert.rejects(
      service.createNotification(baseInput(overrides)),
      (error) => {
        assertValidationError(error, fields)
        assert.equal(error.details[0].message, message)
        return true
      },
    )

    assert.deepEqual(calls, [])
  }
})

test('rejects unsupported reference types and blank reference IDs', async () => {
  const unsupported = createService()

  await assert.rejects(
    unsupported.service.createNotification(
      baseInput({ referenceType: 'trip_member', referenceId: REFERENCE_ID }),
    ),
    (error) => {
      assertValidationError(error, ['referenceType'])
      assert.equal(error.details[0].message, 'Unsupported reference type.')
      return true
    },
  )
  assert.deepEqual(unsupported.calls, [])

  for (const referenceId of ['', '   ']) {
    const blank = createService()

    await assert.rejects(
      blank.service.createNotification(
        baseInput({ referenceType: 'user', referenceId }),
      ),
      (error) => {
        assertValidationError(error, ['referenceId'])
        assert.equal(error.details[0].message, 'Reference ID is required.')
        return true
      },
    )
    assert.deepEqual(blank.calls, [])
  }
})

test('propagates model creation failures to the caller', async () => {
  const failure = new Error('database unavailable')
  const model = {
    async create() {
      throw failure
    },
  }
  const service = createNotificationCreationService({
    Notification: model,
  })

  await assert.rejects(
    service.createNotification(baseInput()),
    (error) => error === failure,
  )
})
