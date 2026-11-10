'use strict'

process.env.NODE_ENV = 'test'
process.env.SESSION_SECRET =
  'test-only-session-secret-0123456789abcdef'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  MAX_LIMIT,
  MODERATION_STATUSES,
  PARTICIPANT_STATUSES,
  parseJoinTrip,
  parseParticipantId,
  parseParticipantListQuery,
  parseParticipantModeration,
  parseTripId,
} = require('../src/validators/tripParticipant')
const { AuthError, ValidationError } = require('../src/utils/authErrors')
const {
  TripFullError,
  TripNotJoinableError,
  TripOwnerCannotJoinError,
  TripParticipantLimitConflictError,
  TripParticipationExistsError,
  TripParticipationNotFoundError,
  TripParticipationStateConflictError,
} = require('../src/utils/tripErrors')
const { PUBLIC_PROFILE_FIELDS } = require('../src/utils/safeUser')
const {
  PUBLIC_TRIP_PARTICIPANT_FIELDS,
  toTripParticipant,
} = require('../src/utils/safeTripParticipant')

const detailsFor = (callback) => {
  try {
    callback()
  } catch (error) {
    assert.ok(error instanceof ValidationError)
    assert.equal(error.code, 'VALIDATION_ERROR')
    return error.details
  }

  assert.fail('expected a ValidationError')
}

const hasField = (details, field) =>
  details.some((detail) => detail.field === field)

const buildParticipant = (overrides = {}) => ({
  id: '20000000-0000-4000-8000-000000000001',
  tripId: '10000000-0000-4000-8000-000000000001',
  userId: '90000000-0000-4000-8000-000000000009',
  status: 'pending',
  joinedAt: null,
  createdAt: new Date('2026-11-10T10:00:00.000Z'),
  updatedAt: new Date('2026-11-10T10:00:00.000Z'),
  participant: {
    id: '90000000-0000-4000-8000-000000000009',
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

test('participant status constants expose the supported values', () => {
  assert.deepEqual(PARTICIPANT_STATUSES, [
    'pending',
    'approved',
    'rejected',
    'cancelled',
  ])
  assert.deepEqual(MODERATION_STATUSES, [
    'approved',
    'rejected',
    'cancelled',
  ])
})

test('join requests accept an empty body and strip protected fields', () => {
  assert.deepEqual(parseJoinTrip(), {})
  assert.deepEqual(parseJoinTrip({}), {})
  assert.deepEqual(
    parseJoinTrip({
      userId: '90000000-0000-4000-8000-000000000009',
      tripId: '10000000-0000-4000-8000-000000000001',
      participantId: '20000000-0000-4000-8000-000000000001',
      status: 'approved',
      joinedAt: '2026-11-10T10:00:00.000Z',
      unexpected: true,
    }),
    {},
  )
})

test('trip and participant identifiers must be UUIDs and normalize casing', () => {
  const tripId = 'D0000000-0000-4000-8000-000000000001'
  const participantId = 'E0000000-0000-4000-8000-000000000002'

  assert.deepEqual(parseTripId({ tripId }), {
    tripId: tripId.toLowerCase(),
  })
  assert.deepEqual(parseParticipantId({ tripId, participantId }), {
    tripId: tripId.toLowerCase(),
    participantId: participantId.toLowerCase(),
  })

  for (const value of ['', 'not-a-uuid', '1234']) {
    assert.equal(
      hasField(detailsFor(() => parseTripId({ tripId: value })), 'tripId'),
      true,
    )
    assert.equal(
      hasField(
        detailsFor(() =>
          parseParticipantId({ tripId, participantId: value }),
        ),
        'participantId',
      ),
      true,
    )
  }
})

test('participant list query applies defaults and accepts a status filter', () => {
  assert.deepEqual(parseParticipantListQuery({}), {
    page: DEFAULT_PAGE,
    limit: DEFAULT_LIMIT,
  })

  assert.deepEqual(
    parseParticipantListQuery({
      status: 'pending',
      page: '2',
      limit: '50',
    }),
    {
      status: 'pending',
      page: 2,
      limit: 50,
    },
  )

  assert.deepEqual(parseParticipantListQuery({ status: 'approved' }), {
    status: 'approved',
    page: DEFAULT_PAGE,
    limit: DEFAULT_LIMIT,
  })
})

test('participant list query rejects invalid statuses and pagination', () => {
  const cases = [
    [{ status: 'joined' }, 'status'],
    [{ status: 'pending ' }, 'status'],
    [{ page: '0' }, 'page'],
    [{ page: 'abc' }, 'page'],
    [{ limit: '0' }, 'limit'],
    [{ limit: String(MAX_LIMIT + 1) }, 'limit'],
    [{ limit: 'abc' }, 'limit'],
  ]

  for (const [input, field] of cases) {
    assert.equal(
      hasField(
        detailsFor(() => parseParticipantListQuery(input)),
        field,
      ),
      true,
      `expected a ${field} error for ${JSON.stringify(input)}`,
    )
  }
})

test('moderation accepts approved, rejected or cancelled and strips unknowns', () => {
  for (const status of MODERATION_STATUSES) {
    assert.deepEqual(parseParticipantModeration({ status }), { status })
  }

  assert.deepEqual(
    parseParticipantModeration({
      status: 'approved',
      userId: '90000000-0000-4000-8000-000000000009',
      joinedAt: '2026-11-10T10:00:00.000Z',
      unexpected: true,
    }),
    { status: 'approved' },
  )
})

test('moderation rejects pending and unknown target statuses', () => {
  for (const status of ['pending', 'joined', '', null]) {
    assert.equal(
      hasField(
        detailsFor(() => parseParticipantModeration({ status })),
        'status',
      ),
      true,
      `expected a status error for ${JSON.stringify(status)}`,
    )
  }

  assert.equal(
    hasField(
      detailsFor(() => parseParticipantModeration({})),
      'status',
    ),
    true,
  )
})

test('participant errors follow the AuthError contract', () => {
  const cases = [
    [
      TripParticipationNotFoundError,
      'TripParticipationNotFoundError',
      'TRIP_PARTICIPATION_NOT_FOUND',
      404,
    ],
    [
      TripParticipationExistsError,
      'TripParticipationExistsError',
      'TRIP_PARTICIPATION_EXISTS',
      409,
    ],
    [
      TripNotJoinableError,
      'TripNotJoinableError',
      'TRIP_NOT_JOINABLE',
      409,
    ],
    [
      TripOwnerCannotJoinError,
      'TripOwnerCannotJoinError',
      'TRIP_OWNER_CANNOT_JOIN',
      409,
    ],
    [
      TripFullError,
      'TripFullError',
      'TRIP_FULL',
      409,
    ],
    [
      TripParticipationStateConflictError,
      'TripParticipationStateConflictError',
      'TRIP_PARTICIPATION_STATE_CONFLICT',
      409,
    ],
    [
      TripParticipantLimitConflictError,
      'TripParticipantLimitConflictError',
      'TRIP_PARTICIPANT_LIMIT_CONFLICT',
      409,
    ],
  ]

  for (const [ErrorClass, name, code, status] of cases) {
    const error = new ErrorClass()

    assert.ok(error instanceof AuthError)
    assert.ok(error instanceof ErrorClass)
    assert.equal(error.name, name)
    assert.equal(error.code, code)
    assert.equal(error.status, status)
    assert.equal(error.expose, true)
    assert.equal(typeof error.message, 'string')
    assert.equal(error.message.length > 0, true)
  }
})

test('participant serialization uses only the public allowlist', () => {
  const participant = toTripParticipant(
    buildParticipant({
      status: 'approved',
      joinedAt: new Date('2026-11-11T09:30:00.000Z'),
    }),
  )

  assert.deepEqual(
    Object.keys(participant).sort(),
    [...PUBLIC_TRIP_PARTICIPANT_FIELDS, 'user'].sort(),
  )
  assert.equal(participant.id, '20000000-0000-4000-8000-000000000001')
  assert.equal(participant.status, 'approved')
  assert.deepEqual(
    participant.joinedAt,
    new Date('2026-11-11T09:30:00.000Z'),
  )
  assert.deepEqual(
    participant.createdAt,
    new Date('2026-11-10T10:00:00.000Z'),
  )
  assert.deepEqual(
    participant.updatedAt,
    new Date('2026-11-10T10:00:00.000Z'),
  )
})

test('participant serialization includes a safe nested public profile', () => {
  const participant = toTripParticipant(buildParticipant())

  assert.deepEqual(
    Object.keys(participant.user).sort(),
    [...PUBLIC_PROFILE_FIELDS].sort(),
  )
  assert.deepEqual(participant.user, {
    id: '90000000-0000-4000-8000-000000000009',
    fullName: 'Ada Lovelace',
    profileImage: 'https://example.com/ada.png',
    bio: 'Mathematician',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  })
})

test('participant serialization excludes sensitive user fields', () => {
  const participant = toTripParticipant(buildParticipant())
  const serialized = JSON.stringify(participant)

  assert.equal(participant.user.status, undefined)
  assert.equal(participant.user.role, undefined)
  assert.equal(participant.user.email, undefined)
  assert.equal(participant.user.passwordHash, undefined)
  assert.equal(participant.user.authVersion, undefined)
  assert.equal(participant.user.emailVerifiedAt, undefined)

  for (const sensitive of [
    'userId',
    'tripId',
    'email',
    'passwordHash',
    'role',
    'authVersion',
    'emailVerifiedAt',
    '"status":"active"',
  ]) {
    assert.equal(
      serialized.includes(sensitive),
      false,
      `expected ${sensitive} not to be serialized`,
    )
  }
})

test('participant serialization handles missing or null user associations', () => {
  for (const participant of [
    buildParticipant({ participant: null }),
    buildParticipant({ participant: undefined }),
  ]) {
    const serialized = toTripParticipant(participant)

    assert.equal(serialized.user, null)
    assert.deepEqual(
      Object.keys(serialized).sort(),
      [...PUBLIC_TRIP_PARTICIPANT_FIELDS, 'user'].sort(),
    )
  }

  assert.equal(toTripParticipant(null), null)
})

test('participant serialization normalizes missing joinedAt to null', () => {
  const participant = toTripParticipant(
    buildParticipant({ joinedAt: undefined }),
  )

  assert.equal(participant.joinedAt, null)
})

test('participant list query strips unknown keys and rejects array values', () => {
  assert.deepEqual(
    parseParticipantListQuery({
      userId: '90000000-0000-4000-8000-000000000009',
      tripId: '10000000-0000-4000-8000-000000000001',
      page: '1',
      limit: '20',
    }),
    { page: DEFAULT_PAGE, limit: DEFAULT_LIMIT },
  )

  for (const input of [
    { status: ['pending'] },
    { page: ['1'] },
    { limit: ['20'] },
  ]) {
    const field = Object.keys(input)[0]
    assert.equal(
      hasField(detailsFor(() => parseParticipantListQuery(input)), field),
      true,
      `expected a ${field} error for ${JSON.stringify(input)}`,
    )
  }
})

test('moderation strips participant identifiers and rejects non-string statuses', () => {
  assert.deepEqual(
    parseParticipantModeration({
      status: 'approved',
      tripId: '10000000-0000-4000-8000-000000000001',
      participantId: '20000000-0000-4000-8000-000000000001',
      userId: '90000000-0000-4000-8000-000000000009',
    }),
    { status: 'approved' },
  )

  for (const status of ['APPROVED', ['approved'], 1]) {
    assert.equal(
      hasField(
        detailsFor(() => parseParticipantModeration({ status })),
        'status',
      ),
      true,
      `expected a status error for ${JSON.stringify(status)}`,
    )
  }
})
