'use strict'

process.env.NODE_ENV = 'test'
process.env.SESSION_SECRET =
  'test-only-session-secret-0123456789abcdef'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { Op } = require('sequelize')

const {
  createTripParticipationService,
} = require('../src/services/tripParticipationService')
const {
  TripFullError,
  TripNotFoundError,
  TripNotJoinableError,
  TripOwnerCannotJoinError,
  TripParticipationExistsError,
  TripParticipationNotFoundError,
  TripParticipationStateConflictError,
} = require('../src/utils/tripErrors')
const {
  PUBLIC_PROFILE_FIELDS,
} = require('../src/utils/safeUser')

const OWNER_ID = '90000000-0000-4000-8000-000000000001'
const USER_ID = '90000000-0000-4000-8000-000000000002'
const TRIP_ID = '10000000-0000-4000-8000-000000000001'
const PARTICIPANT_ID = '20000000-0000-4000-8000-000000000001'

const buildTrip = (overrides = {}) => ({
  id: TRIP_ID,
  userId: OWNER_ID,
  title: 'Japan Spring 2027',
  tripType: 'group',
  status: 'published',
  maxParticipants: 3,
  startDate: '2027-03-28',
  endDate: '2027-04-10',
  ...overrides,
})

const buildParticipant = (overrides = {}) => ({
  id: PARTICIPANT_ID,
  tripId: TRIP_ID,
  userId: USER_ID,
  status: 'pending',
  joinedAt: null,
  createdAt: new Date('2026-11-10T10:00:00.000Z'),
  updatedAt: new Date('2026-11-10T10:00:00.000Z'),
  participant: {
    id: USER_ID,
    fullName: 'Ada Lovelace',
    email: 'ada@example.com',
    profileImage: 'https://example.com/ada.png',
    bio: 'Mathematician',
    role: 'admin',
    status: 'active',
    authVersion: 7,
    emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  },
  ...overrides,
})

const createFakeSequelize = () => {
  const transactions = []

  return {
    transactions,
    async transaction(callback) {
      const transaction = {
        id: `transaction-${transactions.length + 1}`,
        committed: false,
        rolledBack: false,
        LOCK: { UPDATE: 'UPDATE' },
      }
      transactions.push(transaction)

      try {
        const result = await callback(transaction)
        transaction.committed = true
        return result
      } catch (error) {
        transaction.rolledBack = true
        throw error
      }
    },
  }
}

const createService = ({
  trip = buildTrip(),
  participantFindOneResults = [],
  approvedCount = 0,
  createdParticipant = buildParticipant(),
  rows = [],
  count = 0,
  createError = null,
  notificationError = null,
  actorUser,
  sequelize = createFakeSequelize(),
} = {}) => {
  const calls = {
    tripFindOne: [],
    participantFindOne: [],
    participantCreate: [],
    participantUpdate: [],
    participantCount: [],
    participantFindAndCountAll: [],
    userFindByPk: [],
    notifications: [],
    transactions: [],
  }
  let findOneIndex = 0

  const Trip = {
    async findOne(options) {
      calls.tripFindOne.push(options)
      return trip
    },
  }

  const TripParticipant = {
    async findOne(options) {
      calls.participantFindOne.push(options)
      const result = participantFindOneResults[findOneIndex]
      findOneIndex += 1
      return result === undefined ? null : result
    },
    async count(options) {
      calls.participantCount.push(options)
      return approvedCount
    },
    async create(values, options) {
      calls.participantCreate.push({ values, options })

      if (createError) throw createError

      return createdParticipant
    },
    async update(values, options) {
      calls.participantUpdate.push({ values, options })
      return [1]
    },
    async findAndCountAll(options) {
      calls.participantFindAndCountAll.push(options)
      return { count, rows }
    },
  }

  const notificationCreationService = {
    async createNotification(input) {
      calls.notifications.push(input)

      if (notificationError) throw notificationError

      return { id: 'notification-id', ...input }
    },
  }

  const User = {
    async findByPk(id, options) {
      calls.userFindByPk.push({ id, options })
      return actorUser === undefined
        ? {
            id,
            fullName: id === OWNER_ID ? 'Grace Hopper' : 'Ada Lovelace',
          }
        : actorUser
    },
  }

  const service = createTripParticipationService({
    Trip,
    TripParticipant,
    User,
    Notification: {},
    sequelize,
    notificationCreationService,
  })

  return {
    calls,
    service,
    sequelize,
  }
}

const rejectsWith = async (promise, ErrorClass) => {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof ErrorClass)
    return true
  })
}

test('requestJoin creates a pending request for a visible group trip', async () => {
  const reloaded = buildParticipant()
  const { calls, service, sequelize } = createService({
    participantFindOneResults: [null, reloaded],
  })

  const result = await service.requestJoin(USER_ID, TRIP_ID)

  assert.equal(result.created, true)
  assert.equal(result.participation.status, 'pending')
  assert.equal(result.participation.joinedAt, null)
  assert.equal(result.participation.user.fullName, 'Ada Lovelace')
  assert.equal(Object.hasOwn(result.participation, 'userId'), false)
  assert.equal(
    JSON.stringify(result.participation).includes('ada@example.com'),
    false,
  )

  assert.equal(sequelize.transactions.length, 1)
  assert.equal(calls.tripFindOne[0].lock, 'UPDATE')
  assert.deepEqual(calls.tripFindOne[0].where, {
    id: TRIP_ID,
    [Op.or]: [
      { userId: USER_ID },
      { status: { [Op.ne]: 'draft' } },
    ],
  })
  assert.deepEqual(calls.participantFindOne[0].where, {
    tripId: TRIP_ID,
    userId: USER_ID,
  })
  assert.equal(calls.participantFindOne[0].lock, 'UPDATE')
  assert.deepEqual(calls.participantCreate[0].values, {
    tripId: TRIP_ID,
    userId: USER_ID,
    status: 'pending',
    joinedAt: null,
  })
  assert.deepEqual(calls.participantCount[0].where, {
    tripId: TRIP_ID,
    status: 'approved',
  })
  assert.equal(
    calls.participantCount[0].transaction,
    sequelize.transactions[0],
  )
})

test('requestJoin reuses rejected and cancelled participations', async () => {
  for (const status of ['rejected', 'cancelled']) {
    const existing = buildParticipant({ status })
    const reloaded = buildParticipant({ status: 'pending' })
    const { calls, service } = createService({
      participantFindOneResults: [existing, reloaded],
    })

    const result = await service.requestJoin(USER_ID, TRIP_ID)

    assert.equal(result.created, false)
    assert.equal(result.participation.status, 'pending')
    assert.deepEqual(calls.participantUpdate[0].values, {
      status: 'pending',
      joinedAt: null,
    })
    assert.deepEqual(calls.participantUpdate[0].options.where, {
      id: PARTICIPANT_ID,
      tripId: TRIP_ID,
    })
    assert.equal(calls.participantCreate.length, 0)
  }
})

test('requestJoin rejects duplicate pending and approved requests', async () => {
  for (const status of ['pending', 'approved']) {
    const { calls, service } = createService({
      participantFindOneResults: [buildParticipant({ status })],
    })

    await rejectsWith(
      service.requestJoin(USER_ID, TRIP_ID),
      TripParticipationExistsError,
    )
    assert.equal(calls.participantCreate.length, 0)
    assert.equal(calls.participantUpdate.length, 0)
  }
})

test('requestJoin rejects a full trip and allows unlimited capacity', async () => {
  const full = createService({
    approvedCount: 3,
    participantFindOneResults: [null],
  })

  await rejectsWith(
    full.service.requestJoin(USER_ID, TRIP_ID),
    TripFullError,
  )
  assert.equal(full.calls.participantCreate.length, 0)

  const unlimited = createService({
    trip: buildTrip({ maxParticipants: null }),
    approvedCount: 99,
    participantFindOneResults: [null, buildParticipant()],
  })

  const result = await unlimited.service.requestJoin(USER_ID, TRIP_ID)
  assert.equal(result.created, true)
  assert.equal(unlimited.calls.participantCount.length, 0)
})

test('requestJoin rejects owner, personal, non-published and invisible trips', async () => {
  const owner = createService({
    trip: buildTrip({ userId: USER_ID }),
  })
  await rejectsWith(
    owner.service.requestJoin(USER_ID, TRIP_ID),
    TripOwnerCannotJoinError,
  )

  for (const trip of [
    buildTrip({ tripType: 'personal' }),
    buildTrip({ status: 'cancelled' }),
    buildTrip({ status: 'completed' }),
  ]) {
    const nonJoinable = createService({ trip })
    await rejectsWith(
      nonJoinable.service.requestJoin(USER_ID, TRIP_ID),
      TripNotJoinableError,
    )
  }

  const invisible = createService({ trip: null })
  await rejectsWith(
    invisible.service.requestJoin(USER_ID, TRIP_ID),
    TripNotFoundError,
  )
})

test('requestJoin maps unique constraint races to participation exists', async () => {
  const uniqueError = Object.assign(new Error('duplicate'), {
    name: 'SequelizeUniqueConstraintError',
  })
  const { service } = createService({
    participantFindOneResults: [null],
    createError: uniqueError,
  })

  await rejectsWith(
    service.requestJoin(USER_ID, TRIP_ID),
    TripParticipationExistsError,
  )
})

test('leaveTrip cancels pending and approved participation', async () => {
  for (const status of ['pending', 'approved']) {
    const { calls, service } = createService({
      participantFindOneResults: [
        buildParticipant({ status }),
        buildParticipant({ status: 'cancelled' }),
      ],
    })

    const participation = await service.leaveTrip(USER_ID, TRIP_ID)

    assert.equal(participation.status, 'cancelled')
    assert.equal(participation.joinedAt, null)
    assert.deepEqual(calls.participantUpdate[0].values, {
      status: 'cancelled',
      joinedAt: null,
    })
    assert.deepEqual(calls.participantUpdate[0].options.where, {
      id: PARTICIPANT_ID,
      tripId: TRIP_ID,
    })
    assert.equal(calls.participantFindOne[0].lock, 'UPDATE')
  }
})

test('leaveTrip rejects missing, final-state and owner participation', async () => {
  const missing = createService({
    participantFindOneResults: [null],
  })
  await rejectsWith(
    missing.service.leaveTrip(USER_ID, TRIP_ID),
    TripParticipationNotFoundError,
  )

  for (const status of ['rejected', 'cancelled']) {
    const finalState = createService({
      participantFindOneResults: [buildParticipant({ status })],
    })
    await rejectsWith(
      finalState.service.leaveTrip(USER_ID, TRIP_ID),
      TripParticipationStateConflictError,
    )
    assert.equal(finalState.calls.participantUpdate.length, 0)
  }

  const owner = createService({
    trip: buildTrip({ userId: USER_ID }),
  })
  await rejectsWith(
    owner.service.leaveTrip(USER_ID, TRIP_ID),
    TripOwnerCannotJoinError,
  )

  const missingTrip = createService({ trip: null })
  await rejectsWith(
    missingTrip.service.leaveTrip(USER_ID, TRIP_ID),
    TripNotFoundError,
  )
})

test('getOwnParticipation returns the current record or null', async () => {
  const found = createService({
    participantFindOneResults: [buildParticipant({ status: 'approved' })],
  })

  const participation = await found.service.getOwnParticipation(
    USER_ID,
    TRIP_ID,
  )

  assert.equal(participation.status, 'approved')
  assert.equal(participation.user.fullName, 'Ada Lovelace')
  assert.equal(Object.hasOwn(participation, 'userId'), false)
  assert.equal(
    JSON.stringify(participation).includes('passwordHash'),
    false,
  )

  const none = createService({ participantFindOneResults: [null] })
  assert.equal(
    await none.service.getOwnParticipation(USER_ID, TRIP_ID),
    null,
  )
})

test('getOwnParticipation preserves trip visibility rules', async () => {
  const invisible = createService({ trip: null })

  await rejectsWith(
    invisible.service.getOwnParticipation(USER_ID, TRIP_ID),
    TripNotFoundError,
  )

  const visible = createService({
    participantFindOneResults: [null],
  })
  await visible.service.getOwnParticipation(USER_ID, TRIP_ID)

  assert.deepEqual(visible.calls.tripFindOne[0].where, {
    id: TRIP_ID,
    [Op.or]: [
      { userId: USER_ID },
      { status: { [Op.ne]: 'draft' } },
    ],
  })
})

test('listParticipants scopes to the owner and applies filtering and pagination', async () => {
  const rows = [
    buildParticipant({ status: 'pending' }),
    buildParticipant({
      id: '20000000-0000-4000-8000-000000000002',
      status: 'approved',
    }),
  ]
  const { calls, service } = createService({
    rows,
    count: 23,
  })

  const result = await service.listParticipants(OWNER_ID, TRIP_ID, {
    status: 'pending',
    page: 2,
    limit: 10,
  })

  assert.deepEqual(calls.tripFindOne[0].where, {
    id: TRIP_ID,
    userId: OWNER_ID,
  })
  assert.deepEqual(calls.participantFindAndCountAll[0].where, {
    tripId: TRIP_ID,
    status: 'pending',
  })
  assert.deepEqual(calls.participantFindAndCountAll[0].order, [
    ['createdAt', 'ASC'],
    ['id', 'ASC'],
  ])
  assert.equal(calls.participantFindAndCountAll[0].limit, 10)
  assert.equal(calls.participantFindAndCountAll[0].offset, 10)
  assert.equal(calls.participantFindAndCountAll[0].distinct, true)
  assert.deepEqual(
    calls.participantFindAndCountAll[0].include[0].attributes,
    [...PUBLIC_PROFILE_FIELDS],
  )
  assert.equal(
    calls.participantFindAndCountAll[0].include[0].as,
    'participant',
  )

  assert.deepEqual(result.pagination, {
    page: 2,
    limit: 10,
    total: 23,
    totalPages: 3,
    hasNextPage: true,
    hasPreviousPage: true,
  })
  assert.equal(result.participants.length, 2)
  assert.equal(result.participants[0].status, 'pending')
  assert.equal(result.participants[0].user.fullName, 'Ada Lovelace')
  assert.equal(
    JSON.stringify(result.participants).includes('passwordHash'),
    false,
  )
})

test('listParticipants rejects non-owners', async () => {
  const { calls, service } = createService({ trip: null })

  await rejectsWith(
    service.listParticipants(USER_ID, TRIP_ID, {
      page: 1,
      limit: 20,
    }),
    TripNotFoundError,
  )
  assert.equal(calls.participantFindAndCountAll.length, 0)
})

test('moderateParticipant approves a pending request and sets joinedAt', async () => {
  const reloaded = buildParticipant({
    status: 'approved',
    joinedAt: new Date('2026-11-11T12:00:00.000Z'),
  })
  const { calls, service, sequelize } = createService({
    approvedCount: 1,
    participantFindOneResults: [
      buildParticipant({ status: 'pending' }),
      reloaded,
    ],
  })

  const participation = await service.moderateParticipant(
    OWNER_ID,
    TRIP_ID,
    PARTICIPANT_ID,
    { status: 'approved' },
  )

  assert.equal(participation.status, 'approved')
  assert.equal(calls.tripFindOne[0].lock, 'UPDATE')
  assert.equal(calls.participantFindOne[0].lock, 'UPDATE')
  assert.deepEqual(calls.participantFindOne[0].where, {
    id: PARTICIPANT_ID,
    tripId: TRIP_ID,
  })
  assert.equal(calls.participantUpdate[0].values.status, 'approved')
  assert.ok(calls.participantUpdate[0].values.joinedAt instanceof Date)
  assert.deepEqual(calls.participantCount[0].where, {
    tripId: TRIP_ID,
    status: 'approved',
  })
  assert.equal(
    calls.participantCount[0].transaction,
    sequelize.transactions[0],
  )
})

test('moderateParticipant rejects and cancels pending requests', async () => {
  for (const target of ['rejected', 'cancelled']) {
    const { calls, service } = createService({
      participantFindOneResults: [
        buildParticipant({ status: 'pending' }),
        buildParticipant({ status: target }),
      ],
    })

    const participation = await service.moderateParticipant(
      OWNER_ID,
      TRIP_ID,
      PARTICIPANT_ID,
      { status: target },
    )

    assert.equal(participation.status, target)
    assert.deepEqual(calls.participantUpdate[0].values, {
      status: target,
      joinedAt: null,
    })
  }
})

test('moderateParticipant allows approved-to-cancelled only for approved records', async () => {
  const cancelled = createService({
    participantFindOneResults: [
      buildParticipant({ status: 'approved' }),
      buildParticipant({ status: 'cancelled' }),
    ],
  })

  const participation = await cancelled.service.moderateParticipant(
    OWNER_ID,
    TRIP_ID,
    PARTICIPANT_ID,
    { status: 'cancelled' },
  )
  assert.equal(participation.status, 'cancelled')
  assert.equal(
    cancelled.calls.participantUpdate[0].values.joinedAt,
    null,
  )

  const invalid = [
    ['approved', 'approved'],
    ['approved', 'rejected'],
    ['rejected', 'approved'],
    ['cancelled', 'approved'],
  ]

  for (const [current, target] of invalid) {
    const serviceFixture = createService({
      participantFindOneResults: [buildParticipant({ status: current })],
    })

    await rejectsWith(
      serviceFixture.service.moderateParticipant(
        OWNER_ID,
        TRIP_ID,
        PARTICIPANT_ID,
        { status: target },
      ),
      TripParticipationStateConflictError,
    )
    assert.equal(serviceFixture.calls.participantUpdate.length, 0)
  }
})

test('moderateParticipant enforces capacity when approving', async () => {
  const full = createService({
    approvedCount: 3,
    participantFindOneResults: [
      buildParticipant({ status: 'pending' }),
    ],
  })

  await rejectsWith(
    full.service.moderateParticipant(
      OWNER_ID,
      TRIP_ID,
      PARTICIPANT_ID,
      { status: 'approved' },
    ),
    TripFullError,
  )
  assert.equal(full.calls.participantUpdate.length, 0)

  const unlimited = createService({
    trip: buildTrip({ maxParticipants: null }),
    approvedCount: 99,
    participantFindOneResults: [
      buildParticipant({ status: 'pending' }),
      buildParticipant({ status: 'approved' }),
    ],
  })

  const participation = await unlimited.service.moderateParticipant(
    OWNER_ID,
    TRIP_ID,
    PARTICIPANT_ID,
    { status: 'approved' },
  )
  assert.equal(participation.status, 'approved')
  assert.equal(unlimited.calls.participantCount.length, 0)
})

test('moderateParticipant rejects missing participants and non-owners', async () => {
  const missing = createService({
    participantFindOneResults: [null],
  })
  await rejectsWith(
    missing.service.moderateParticipant(
      OWNER_ID,
      TRIP_ID,
      PARTICIPANT_ID,
      { status: 'approved' },
    ),
    TripParticipationNotFoundError,
  )

  const nonOwner = createService({ trip: null })
  await rejectsWith(
    nonOwner.service.moderateParticipant(
      USER_ID,
      TRIP_ID,
      PARTICIPANT_ID,
      { status: 'approved' },
    ),
    TripNotFoundError,
  )
  assert.equal(nonOwner.calls.participantFindOne.length, 0)
})

test('requestJoin does not reuse a rejected record when the trip is full', async () => {
  const existing = buildParticipant({ status: 'rejected' })
  const { calls, service } = createService({
    approvedCount: 3,
    participantFindOneResults: [existing],
  })

  await rejectsWith(
    service.requestJoin(USER_ID, TRIP_ID),
    TripFullError,
  )
  assert.equal(calls.participantUpdate.length, 0)
  assert.equal(calls.participantCreate.length, 0)
})

test('listParticipants omits the status filter and handles an empty page', async () => {
  const { calls, service } = createService({
    rows: [],
    count: 0,
  })

  const result = await service.listParticipants(OWNER_ID, TRIP_ID, {
    page: 1,
    limit: 20,
  })

  assert.deepEqual(calls.participantFindAndCountAll[0].where, {
    tripId: TRIP_ID,
  })
  assert.deepEqual(result.participants, [])
  assert.deepEqual(result.pagination, {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  })
})

test('participation writes use the transaction for every mutation', async () => {
  const pending = buildParticipant({ status: 'pending' })

  const leaving = createService({
    participantFindOneResults: [
      pending,
      buildParticipant({ status: 'cancelled' }),
    ],
  })
  await leaving.service.leaveTrip(USER_ID, TRIP_ID)
  assert.equal(
    leaving.calls.participantUpdate[0].options.transaction,
    leaving.sequelize.transactions[0],
  )

  const moderating = createService({
    participantFindOneResults: [
      pending,
      buildParticipant({ status: 'approved' }),
    ],
  })
  await moderating.service.moderateParticipant(
    OWNER_ID,
    TRIP_ID,
    PARTICIPANT_ID,
    { status: 'approved' },
  )
  assert.equal(
    moderating.calls.participantUpdate[0].options.transaction,
    moderating.sequelize.transactions[0],
  )

  const joining = createService({
    participantFindOneResults: [null, buildParticipant()],
  })
  await joining.service.requestJoin(USER_ID, TRIP_ID)
  assert.equal(
    joining.calls.participantCreate[0].options.transaction,
    joining.sequelize.transactions[0],
  )
})

test('requestJoin notifies the trip owner of a new pending request', async () => {
  const reloaded = buildParticipant()
  const { calls, service, sequelize } = createService({
    participantFindOneResults: [null, reloaded],
  })

  await service.requestJoin(USER_ID, TRIP_ID)

  assert.deepEqual(calls.userFindByPk, [
    { id: USER_ID, options: { attributes: ['id', 'fullName'] } },
  ])
  assert.equal(calls.notifications.length, 1)
  assert.deepEqual(calls.notifications[0], {
    recipientId: OWNER_ID,
    actorId: USER_ID,
    type: 'trip_join_request',
    message: 'Ada Lovelace requested to join your trip.',
    referenceType: 'trip',
    referenceId: TRIP_ID,
    transaction: sequelize.transactions[0],
  })
  assert.equal(sequelize.transactions.length, 1)
  assert.equal(sequelize.transactions[0].committed, true)
  assert.equal(sequelize.transactions[0].rolledBack, false)
  assert.equal(
    calls.participantCreate[0].options.transaction,
    sequelize.transactions[0],
  )
})

test('requestJoin notifies the trip owner when a cancelled request is reactivated', async () => {
  const existing = buildParticipant({ status: 'cancelled' })
  const reloaded = buildParticipant({ status: 'pending' })
  const { calls, service, sequelize } = createService({
    participantFindOneResults: [existing, reloaded],
  })

  const result = await service.requestJoin(USER_ID, TRIP_ID)

  assert.equal(result.created, false)
  assert.equal(calls.notifications.length, 1)
  assert.equal(calls.notifications[0].recipientId, OWNER_ID)
  assert.equal(calls.notifications[0].actorId, USER_ID)
  assert.equal(calls.notifications[0].type, 'trip_join_request')
  assert.equal(
    calls.notifications[0].message,
    'Ada Lovelace requested to join your trip.',
  )
  assert.equal(calls.notifications[0].referenceType, 'trip')
  assert.equal(calls.notifications[0].referenceId, TRIP_ID)
  assert.equal(sequelize.transactions[0].committed, true)
})

test('requestJoin does not notify when a rejected request is reactivated', async () => {
  const existing = buildParticipant({ status: 'rejected' })
  const reloaded = buildParticipant({ status: 'pending' })
  const { calls, service, sequelize } = createService({
    participantFindOneResults: [existing, reloaded],
  })

  const result = await service.requestJoin(USER_ID, TRIP_ID)

  assert.equal(result.created, false)
  assert.equal(result.participation.status, 'pending')
  // A rejected record reactivated to pending does not create a notification.
  assert.equal(calls.notifications.length, 0)
  assert.equal(calls.userFindByPk.length, 0)
  assert.equal(sequelize.transactions[0].committed, true)
})

test('requestJoin does not notify for duplicate pending or approved requests', async () => {
  for (const status of ['pending', 'approved']) {
    const { calls, service } = createService({
      participantFindOneResults: [buildParticipant({ status })],
    })

    await rejectsWith(
      service.requestJoin(USER_ID, TRIP_ID),
      TripParticipationExistsError,
    )
    assert.equal(calls.notifications.length, 0)
    assert.equal(calls.userFindByPk.length, 0)
  }
})

test('requestJoin does not notify when the trip is full', async () => {
  const { calls, service } = createService({
    approvedCount: 3,
    participantFindOneResults: [null],
  })

  await rejectsWith(
    service.requestJoin(USER_ID, TRIP_ID),
    TripFullError,
  )
  assert.equal(calls.notifications.length, 0)
  assert.equal(calls.userFindByPk.length, 0)
})

test('requestJoin rolls back when notification creation fails', async () => {
  const notificationError = new Error('notification write failed')
  const { calls, service, sequelize } = createService({
    participantFindOneResults: [null, buildParticipant()],
    notificationError,
  })

  await assert.rejects(
    service.requestJoin(USER_ID, TRIP_ID),
    notificationError,
  )

  assert.equal(calls.participantCreate.length, 1)
  assert.equal(calls.notifications.length, 1)
  assert.equal(calls.notifications[0].transaction, sequelize.transactions[0])
  assert.equal(sequelize.transactions.length, 1)
  assert.equal(sequelize.transactions[0].committed, false)
  assert.equal(sequelize.transactions[0].rolledBack, true)
})

test('moderateParticipant notifies the participant when approved', async () => {
  const reloaded = buildParticipant({
    status: 'approved',
    joinedAt: new Date('2026-11-11T12:00:00.000Z'),
  })
  const { calls, service, sequelize } = createService({
    approvedCount: 1,
    participantFindOneResults: [
      buildParticipant({ status: 'pending' }),
      reloaded,
    ],
  })

  await service.moderateParticipant(
    OWNER_ID,
    TRIP_ID,
    PARTICIPANT_ID,
    { status: 'approved' },
  )

  assert.deepEqual(calls.userFindByPk, [
    { id: OWNER_ID, options: { attributes: ['id', 'fullName'] } },
  ])
  assert.equal(calls.notifications.length, 1)
  assert.deepEqual(calls.notifications[0], {
    recipientId: USER_ID,
    actorId: OWNER_ID,
    type: 'trip_join_approved',
    message: 'The trip owner approved your request to join.',
    referenceType: 'trip',
    referenceId: TRIP_ID,
    transaction: sequelize.transactions[0],
  })
  assert.equal(sequelize.transactions[0].committed, true)
})

test('moderateParticipant notifies the participant when rejected', async () => {
  const { calls, service, sequelize } = createService({
    participantFindOneResults: [
      buildParticipant({ status: 'pending' }),
      buildParticipant({ status: 'rejected' }),
    ],
  })

  await service.moderateParticipant(
    OWNER_ID,
    TRIP_ID,
    PARTICIPANT_ID,
    { status: 'rejected' },
  )

  assert.equal(calls.notifications.length, 1)
  assert.equal(calls.notifications[0].recipientId, USER_ID)
  assert.equal(calls.notifications[0].actorId, OWNER_ID)
  assert.equal(calls.notifications[0].type, 'trip_join_rejected')
  assert.equal(
    calls.notifications[0].message,
    'The trip owner rejected your request to join.',
  )
  assert.equal(calls.notifications[0].referenceType, 'trip')
  assert.equal(calls.notifications[0].referenceId, TRIP_ID)
  assert.equal(sequelize.transactions[0].committed, true)
})

test('moderateParticipant does not notify for pending-to-cancelled', async () => {
  const { calls, service } = createService({
    participantFindOneResults: [
      buildParticipant({ status: 'pending' }),
      buildParticipant({ status: 'cancelled' }),
    ],
  })

  await service.moderateParticipant(
    OWNER_ID,
    TRIP_ID,
    PARTICIPANT_ID,
    { status: 'cancelled' },
  )

  assert.equal(calls.notifications.length, 0)
})

test('moderateParticipant does not notify for approved-to-cancelled', async () => {
  const { calls, service } = createService({
    participantFindOneResults: [
      buildParticipant({ status: 'approved' }),
      buildParticipant({ status: 'cancelled' }),
    ],
  })

  await service.moderateParticipant(
    OWNER_ID,
    TRIP_ID,
    PARTICIPANT_ID,
    { status: 'cancelled' },
  )

  assert.equal(calls.notifications.length, 0)
})

test('moderateParticipant does not notify for invalid transitions', async () => {
  const invalid = [
    ['approved', 'approved'],
    ['approved', 'rejected'],
    ['rejected', 'approved'],
    ['cancelled', 'approved'],
  ]

  for (const [current, target] of invalid) {
    const { calls, service } = createService({
      participantFindOneResults: [buildParticipant({ status: current })],
    })

    await rejectsWith(
      service.moderateParticipant(
        OWNER_ID,
        TRIP_ID,
        PARTICIPANT_ID,
        { status: target },
      ),
      TripParticipationStateConflictError,
    )
    assert.equal(calls.notifications.length, 0)
    assert.equal(calls.userFindByPk.length, 0)
  }
})

test('moderateParticipant rolls back when notification creation fails', async () => {
  const notificationError = new Error('notification write failed')
  const reloaded = buildParticipant({
    status: 'approved',
    joinedAt: new Date('2026-11-11T12:00:00.000Z'),
  })
  const { calls, service, sequelize } = createService({
    approvedCount: 1,
    participantFindOneResults: [
      buildParticipant({ status: 'pending' }),
      reloaded,
    ],
    notificationError,
  })

  await assert.rejects(
    service.moderateParticipant(
      OWNER_ID,
      TRIP_ID,
      PARTICIPANT_ID,
      { status: 'approved' },
    ),
    notificationError,
  )

  assert.equal(calls.participantUpdate.length, 1)
  assert.equal(calls.notifications.length, 1)
  assert.equal(calls.notifications[0].transaction, sequelize.transactions[0])
  assert.equal(sequelize.transactions.length, 1)
  assert.equal(sequelize.transactions[0].committed, false)
  assert.equal(sequelize.transactions[0].rolledBack, true)
})

test('moderateParticipant rolls back rejection when notification creation fails', async () => {
  const notificationError = new Error('notification write failed')
  const { calls, service, sequelize } = createService({
    participantFindOneResults: [
      buildParticipant({ status: 'pending' }),
      buildParticipant({ status: 'rejected' }),
    ],
    notificationError,
  })

  await assert.rejects(
    service.moderateParticipant(
      OWNER_ID,
      TRIP_ID,
      PARTICIPANT_ID,
      { status: 'rejected' },
    ),
    notificationError,
  )

  assert.equal(calls.participantUpdate.length, 1)
  assert.equal(calls.notifications.length, 1)
  assert.equal(calls.notifications[0].transaction, sequelize.transactions[0])
  assert.equal(sequelize.transactions.length, 1)
  assert.equal(sequelize.transactions[0].committed, false)
  assert.equal(sequelize.transactions[0].rolledBack, true)
})
