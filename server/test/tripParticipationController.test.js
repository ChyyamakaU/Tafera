'use strict'

process.env.NODE_ENV = 'test'
process.env.SESSION_SECRET =
  'test-only-session-secret-0123456789abcdef'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  createTripParticipationController,
} = require('../src/controllers/tripParticipationController')
const { ValidationError } = require('../src/utils/authErrors')
const { TripFullError } = require('../src/utils/tripErrors')

const OWNER_ID = '90000000-0000-4000-8000-000000000001'
const USER_ID = '90000000-0000-4000-8000-000000000002'
const TRIP_ID = '10000000-0000-4000-8000-000000000001'
const PARTICIPANT_ID = '20000000-0000-4000-8000-000000000001'

const PARTICIPANT = {
  id: PARTICIPANT_ID,
  status: 'pending',
  joinedAt: null,
  createdAt: new Date('2026-11-10T10:00:00.000Z'),
  updatedAt: new Date('2026-11-10T10:00:00.000Z'),
  user: {
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
    ended: false,
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
    end() {
      res.ended = true
      return res
    },
  }

  return res
}

const createService = (results = {}) => {
  const calls = {
    requestJoin: [],
    leaveTrip: [],
    getOwnParticipation: [],
    listParticipants: [],
    moderateParticipant: [],
  }

  const defaults = {
    requestJoin: { participation: PARTICIPANT, created: true },
    leaveTrip: PARTICIPANT,
    getOwnParticipation: PARTICIPANT,
    listParticipants: {
      participants: [PARTICIPANT],
      pagination: PAGINATION,
    },
    moderateParticipant: PARTICIPANT,
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
  params: { tripId: TRIP_ID },
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
  createTripParticipationController({
    tripParticipationService: service,
  })

const assertNoStore = (res) => {
  assert.equal(res.headers['Cache-Control'], 'no-store')
}

test('requestJoin returns 201 for a new request with a safe envelope', async () => {
  const { calls, service } = createService()
  const controller = controllerFor(service)

  const { res, errors } = await invoke(
    controller.requestJoin,
    createRequest({
      body: {
        userId: OWNER_ID,
        tripId: TRIP_ID,
        status: 'approved',
        joinedAt: '2026-11-11T00:00:00.000Z',
      },
    }),
  )

  assert.deepEqual(errors, [])
  assert.equal(res.statusCode, 201)
  assertNoStore(res)
  assert.deepEqual(res.body, { data: { participation: PARTICIPANT } })
  assert.deepEqual(calls.requestJoin, [[USER_ID, TRIP_ID]])
  assert.equal(
    JSON.stringify(res.body).includes('passwordHash'),
    false,
  )
})

test('requestJoin returns 200 when a participation record is reused', async () => {
  const reused = { participation: PARTICIPANT, created: false }
  const { service } = createService({ requestJoin: reused })
  const controller = controllerFor(service)

  const { res, errors } = await invoke(
    controller.requestJoin,
    createRequest(),
  )

  assert.deepEqual(errors, [])
  assert.equal(res.statusCode, 200)
  assertNoStore(res)
  assert.deepEqual(res.body, { data: { participation: PARTICIPANT } })
})

test('requestJoin normalizes route ids and never trusts the body', async () => {
  const { calls, service } = createService()
  const controller = controllerFor(service)

  await invoke(
    controller.requestJoin,
    createRequest({
      params: { tripId: TRIP_ID.toUpperCase() },
      body: { userId: OWNER_ID },
    }),
  )

  assert.deepEqual(calls.requestJoin, [[USER_ID, TRIP_ID]])
})

test('leaveTrip returns the cancelled participation', async () => {
  const cancelled = {
    ...PARTICIPANT,
    status: 'cancelled',
    joinedAt: null,
  }
  const { calls, service } = createService({ leaveTrip: cancelled })
  const controller = controllerFor(service)

  const { res, errors } = await invoke(
    controller.leaveTrip,
    createRequest(),
  )

  assert.deepEqual(errors, [])
  assert.equal(res.statusCode, 200)
  assertNoStore(res)
  assert.deepEqual(res.body, { data: { participation: cancelled } })
  assert.deepEqual(calls.leaveTrip, [[USER_ID, TRIP_ID]])
})

test('getOwnParticipation returns 200 and preserves a null record', async () => {
  const controller = controllerFor(createService().service)

  const found = await invoke(
    controller.getOwnParticipation,
    createRequest(),
  )

  assert.deepEqual(found.errors, [])
  assert.equal(found.res.statusCode, 200)
  assertNoStore(found.res)
  assert.deepEqual(found.res.body, {
    data: { participation: PARTICIPANT },
  })

  const missingController = controllerFor(
    createService({ getOwnParticipation: null }).service,
  )
  const missing = await invoke(
    missingController.getOwnParticipation,
    createRequest(),
  )

  assert.deepEqual(missing.errors, [])
  assert.equal(missing.res.statusCode, 200)
  assert.deepEqual(missing.res.body, { data: { participation: null } })
})

test('listParticipants passes parsed filters and returns pagination', async () => {
  const { calls, service } = createService()
  const controller = controllerFor(service)

  const { res, errors } = await invoke(
    controller.listParticipants,
    createRequest({
      params: { tripId: TRIP_ID.toUpperCase() },
      query: { status: 'pending', page: '2', limit: '10' },
    }),
  )

  assert.deepEqual(errors, [])
  assert.equal(res.statusCode, 200)
  assertNoStore(res)
  assert.deepEqual(res.body, {
    data: { participants: [PARTICIPANT], pagination: PAGINATION },
  })
  assert.deepEqual(calls.listParticipants, [
    [USER_ID, TRIP_ID, { status: 'pending', page: 2, limit: 10 }],
  ])
})

test('listParticipants applies the pagination defaults', async () => {
  const { calls, service } = createService()
  const controller = controllerFor(service)

  await invoke(controller.listParticipants, createRequest())

  assert.deepEqual(calls.listParticipants, [
    [USER_ID, TRIP_ID, { page: 1, limit: 20 }],
  ])
})

test('moderateParticipant forwards only validated moderation input', async () => {
  const approved = { ...PARTICIPANT, status: 'approved' }
  const { calls, service } = createService({
    moderateParticipant: approved,
  })
  const controller = controllerFor(service)

  const { res, errors } = await invoke(
    controller.moderateParticipant,
    createRequest({
      params: {
        tripId: TRIP_ID,
        participantId: PARTICIPANT_ID.toUpperCase(),
      },
      body: {
        status: 'approved',
        userId: OWNER_ID,
        tripId: TRIP_ID,
        joinedAt: '2026-11-11T00:00:00.000Z',
      },
    }),
  )

  assert.deepEqual(errors, [])
  assert.equal(res.statusCode, 200)
  assertNoStore(res)
  assert.deepEqual(res.body, { data: { participation: approved } })
  assert.deepEqual(calls.moderateParticipant, [
    [USER_ID, TRIP_ID, PARTICIPANT_ID, { status: 'approved' }],
  ])
})

test('actions reject invalid route parameters before calling the service', async () => {
  const { calls, service } = createService()
  const controller = controllerFor(service)

  const invalidParticipantRequests = [
    [controller.requestJoin, { params: { tripId: 'not-a-uuid' } }],
    [controller.leaveTrip, { params: { tripId: 'not-a-uuid' } }],
    [controller.getOwnParticipation, { params: { tripId: 'not-a-uuid' } }],
    [controller.listParticipants, { params: { tripId: 'not-a-uuid' } }],
    [
      controller.moderateParticipant,
      {
        params: { tripId: TRIP_ID, participantId: 'not-a-uuid' },
        body: { status: 'approved' },
      },
    ],
  ]

  for (const [action, overrides] of invalidParticipantRequests) {
    const { res, errors } = await invoke(
      action,
      createRequest(overrides),
    )

    assert.equal(errors.length, 1)
    assert.ok(errors[0] instanceof ValidationError)
    assert.equal(errors[0].code, 'VALIDATION_ERROR')
    assert.equal(errors[0].status, 400)
    assert.equal(res.statusCode, null)
    assert.equal(res.body, undefined)
  }

  assert.deepEqual(calls, {
    requestJoin: [],
    leaveTrip: [],
    getOwnParticipation: [],
    listParticipants: [],
    moderateParticipant: [],
  })
})

test('actions reject invalid query and body values', async () => {
  const { calls, service } = createService()
  const controller = controllerFor(service)

  const invalidRequests = [
    [controller.listParticipants, { query: { status: 'owner' } }],
    [controller.listParticipants, { query: { page: '0' } }],
    [controller.listParticipants, { query: { page: 'first' } }],
    [controller.listParticipants, { query: { limit: '51' } }],
    [controller.listParticipants, { query: { limit: '-1' } }],
    [
      controller.moderateParticipant,
      {
        params: { tripId: TRIP_ID, participantId: PARTICIPANT_ID },
        body: { status: 'pending' },
      },
    ],
    [
      controller.moderateParticipant,
      {
        params: { tripId: TRIP_ID, participantId: PARTICIPANT_ID },
        body: {},
      },
    ],
  ]

  for (const [action, overrides] of invalidRequests) {
    const { res, errors } = await invoke(
      action,
      createRequest(overrides),
    )

    assert.equal(errors.length, 1)
    assert.ok(errors[0] instanceof ValidationError)
    assert.equal(errors[0].code, 'VALIDATION_ERROR')
    assert.equal(res.statusCode, null)
  }

  assert.equal(calls.listParticipants.length, 0)
  assert.equal(calls.moderateParticipant.length, 0)
})

test('service errors are forwarded to the error middleware', async () => {
  const { service } = createService({
    requestJoin: new TripFullError(),
  })
  const controller = controllerFor(service)

  const { res, errors } = await invoke(
    controller.requestJoin,
    createRequest(),
  )

  assert.equal(errors.length, 1)
  assert.ok(errors[0] instanceof TripFullError)
  assert.equal(errors[0].code, 'TRIP_FULL')
  assert.equal(res.statusCode, null)
  assert.equal(res.body, undefined)
})
