'use strict'

process.env.NODE_ENV = 'test'
process.env.SESSION_SECRET =
  'test-only-session-secret-0123456789abcdef'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { Op } = require('sequelize')

const {
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  MAX_LIMIT,
  parseCreateStop,
  parseCreateTrip,
  parseReorderStops,
  parseStopId,
  parseTripId,
  parseTripListQuery,
  parseUpdateStop,
  parseUpdateTrip,
} = require('../src/validators/trip')
const { ValidationError } = require('../src/utils/authErrors')
const {
  DestinationNotFoundError,
} = require('../src/utils/destinationErrors')
const {
  TripDatesConflictError,
  TripNotFoundError,
  TripStopExistsError,
  TripStopNotFoundError,
  TripStopOrderConflictError,
} = require('../src/utils/tripErrors')
const {
  createTripService,
} = require('../src/services/tripService')
const {
  PUBLIC_TRIP_FIELDS,
  PUBLIC_TRIP_STOP_FIELDS,
  toTripDetail,
  toTripStop,
  toTripSummary,
} = require('../src/utils/safeTrip')

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

const buildTrip = (overrides = {}) => ({
  id: '10000000-0000-4000-8000-000000000001',
  userId: '90000000-0000-4000-8000-000000000009',
  title: 'Japan Spring 2027',
  description: 'Temples, food and hiking.',
  tripType: 'personal',
  startDate: '2027-03-28',
  endDate: '2027-04-10',
  maxParticipants: null,
  status: 'draft',
  createdAt: new Date('2026-11-10T10:00:00.000Z'),
  updatedAt: new Date('2026-11-10T10:00:00.000Z'),
  ...overrides,
})

const buildStop = (overrides = {}) => ({
  id: '20000000-0000-4000-8000-000000000001',
  tripId: '10000000-0000-4000-8000-000000000001',
  destinationId: '30000000-0000-4000-8000-000000000001',
  stopOrder: 1,
  arrivalDate: '2027-03-29',
  departureDate: '2027-04-01',
  createdAt: new Date('2026-11-10T10:00:00.000Z'),
  updatedAt: new Date('2026-11-10T10:00:00.000Z'),
  destination: {
    id: '30000000-0000-4000-8000-000000000001',
    name: 'Kyoto',
    slug: 'kyoto-japan',
    country: 'Japan',
    state: 'Kyoto',
    description: 'Former imperial capital.',
    location: 'Kyoto, Japan',
    latitude: '35.0116',
    longitude: '135.7681',
    featured: true,
    status: 'published',
    createdBy: '90000000-0000-4000-8000-000000000009',
    createdAt: new Date('2026-01-15T00:00:00.000Z'),
    updatedAt: new Date('2026-01-16T00:00:00.000Z'),
    images: [
      {
        id: '40000000-0000-4000-8000-000000000001',
        imageUrl: 'https://images.example.com/kyoto.jpg',
        publicId: 'tafera/seed/destinations/kyoto-1',
        altText: 'Kyoto temple',
        displayOrder: 0,
        isCover: true,
      },
    ],
  },
  ...overrides,
})

const createFakeSequelize = () => {
  const transactions = []

  return {
    transactions,
    async transaction(callback) {
      const transaction = { LOCK: { UPDATE: 'UPDATE' } }
      transactions.push(transaction)
      return callback(transaction)
    },
  }
}

const createService = (overrides = {}) => {
  const fakeSequelize = overrides.sequelize || createFakeSequelize()
  const Trip = overrides.Trip || {
    async findOne() {
      assert.fail('Trip.findOne was not expected')
    },
    async findAndCountAll() {
      assert.fail('Trip.findAndCountAll was not expected')
    },
    async create() {
      assert.fail('Trip.create was not expected')
    },
    async update() {
      assert.fail('Trip.update was not expected')
    },
    async destroy() {
      assert.fail('Trip.destroy was not expected')
    },
  }
  const TripDestination = overrides.TripDestination || {
    async findOne() {
      assert.fail('TripDestination.findOne was not expected')
    },
    async findAll() {
      assert.fail('TripDestination.findAll was not expected')
    },
    async create() {
      assert.fail('TripDestination.create was not expected')
    },
    async update() {
      assert.fail('TripDestination.update was not expected')
    },
    async destroy() {
      assert.fail('TripDestination.destroy was not expected')
    },
    async max() {
      assert.fail('TripDestination.max was not expected')
    },
    async increment() {
      assert.fail('TripDestination.increment was not expected')
    },
  }
  const Destination = overrides.Destination || {
    async findOne() {
      return { id: '30000000-0000-4000-8000-000000000001' }
    },
  }

  return {
    service: createTripService({
      Trip,
      TripDestination,
      Destination,
      DestinationImage: {},
      sequelize: fakeSequelize,
    }),
    fakeSequelize,
  }
}

test('create trip validation applies defaults and trims text', () => {
  const parsed = parseCreateTrip({
    title: '  Japan Spring 2027  ',
    description: '',
    startDate: ' 2027-03-28 ',
    endDate: '2027-04-10',
    maxParticipants: null,
  })

  assert.deepEqual(parsed, {
    title: 'Japan Spring 2027',
    description: null,
    tripType: 'personal',
    startDate: '2027-03-28',
    endDate: '2027-04-10',
    maxParticipants: null,
    status: 'draft',
  })
})

test('create trip validation rejects invalid dates and enums', () => {
  const cases = [
    [
      {
        title: 'Trip',
        startDate: '2027-02-30',
        endDate: '2027-03-02',
      },
      'startDate',
    ],
    [
      {
        title: 'Trip',
        startDate: '2027-04-10',
        endDate: '2027-03-28',
      },
      'endDate',
    ],
    [
      {
        title: 'Trip',
        startDate: '2027-03-28',
        endDate: '2027-04-10',
        tripType: 'solo',
      },
      'tripType',
    ],
    [
      {
        title: 'Trip',
        startDate: '2027-03-28',
        endDate: '2027-04-10',
        status: 'archived',
      },
      'status',
    ],
    [
      {
        title: 'Trip',
        startDate: '2027-03-28',
        endDate: '2027-04-10',
        maxParticipants: 0,
      },
      'maxParticipants',
    ],
    [
      {
        title: '',
        startDate: '2027-03-28',
        endDate: '2027-04-10',
      },
      'title',
    ],
  ]

  for (const [input, field] of cases) {
    const details = detailsFor(() => parseCreateTrip(input))

    assert.equal(
      details.some((detail) => detail.field === field),
      true,
      `expected a ${field} error for ${JSON.stringify(input)}`,
    )
  }
})

test('trip update requires a field and validates supplied dates', () => {
  assert.deepEqual(parseUpdateTrip({ title: 'Renamed' }), {
    title: 'Renamed',
  })

  const empty = detailsFor(() => parseUpdateTrip({}))
  assert.equal(empty.some((detail) => detail.field === 'request'), true)

  const reversed = detailsFor(() =>
    parseUpdateTrip({
      startDate: '2027-04-10',
      endDate: '2027-03-28',
    }),
  )
  assert.equal(
    reversed.some((detail) => detail.field === 'endDate'),
    true,
  )
})

test('trip list query applies pagination defaults and status filter', () => {
  assert.deepEqual(parseTripListQuery({}), {
    page: DEFAULT_PAGE,
    limit: DEFAULT_LIMIT,
  })

  assert.deepEqual(
    parseTripListQuery({
      page: '3',
      limit: '7',
      status: 'published',
    }),
    {
      page: 3,
      limit: 7,
      status: 'published',
    },
  )

  for (const input of [
    { page: '0' },
    { limit: '0' },
    { limit: String(MAX_LIMIT + 1) },
    { status: 'archived' },
  ]) {
    assert.equal(
      detailsFor(() => parseTripListQuery(input)).length > 0,
      true,
    )
  }
})

test('trip and stop identifiers must be UUIDs', () => {
  const tripId = 'D0000000-0000-4000-8000-000000000001'
  const stopId = 'E0000000-0000-4000-8000-000000000002'

  assert.deepEqual(parseTripId({ tripId }), {
    tripId: tripId.toLowerCase(),
  })
  assert.deepEqual(parseStopId({ tripId, stopId }), {
    tripId: tripId.toLowerCase(),
    stopId: stopId.toLowerCase(),
  })

  for (const value of ['', 'not-a-uuid', '1234']) {
    assert.equal(
      detailsFor(() => parseTripId({ tripId: value })).some(
        (detail) => detail.field === 'tripId',
      ),
      true,
    )
  }
})

test('stop validation accepts optional dates and rejects invalid ranges', () => {
  assert.deepEqual(
    parseCreateStop({
      destinationId: 'D0000000-0000-4000-8000-000000000001',
      arrivalDate: '',
      departureDate: null,
    }),
    {
      destinationId: 'd0000000-0000-4000-8000-000000000001',
      arrivalDate: null,
      departureDate: null,
    },
  )

  const reversed = detailsFor(() =>
    parseCreateStop({
      destinationId: 'd0000000-0000-4000-8000-000000000001',
      arrivalDate: '2027-04-05',
      departureDate: '2027-04-01',
    }),
  )
  assert.equal(
    reversed.some((detail) => detail.field === 'departureDate'),
    true,
  )

  assert.deepEqual(parseUpdateStop({ arrivalDate: '' }), {
    arrivalDate: null,
  })

  const empty = detailsFor(() => parseUpdateStop({}))
  assert.equal(empty.some((detail) => detail.field === 'request'), true)
})

test('reorder validation requires unique stop UUIDs', () => {
  assert.deepEqual(
    parseReorderStops({
      stopIds: ['D0000000-0000-4000-8000-000000000001'],
    }),
    { stopIds: ['d0000000-0000-4000-8000-000000000001'] },
  )

  const duplicate = detailsFor(() =>
    parseReorderStops({
      stopIds: [
        'd0000000-0000-4000-8000-000000000001',
        'd0000000-0000-4000-8000-000000000001',
      ],
    }),
  )
  assert.equal(
    duplicate.some((detail) => detail.field === 'stopIds'),
    true,
  )
})

test('trip summaries use only the public allowlist', () => {
  const summary = toTripSummary(buildTrip())

  assert.deepEqual(
    Object.keys(summary).sort(),
    [...PUBLIC_TRIP_FIELDS].sort(),
  )

  const serialized = JSON.stringify(summary)
  assert.equal(serialized.includes('userId'), false)
  assert.equal(serialized.includes('creator'), false)
  assert.equal(summary.startDate, '2027-03-28')
})

test('trip details sort stops and hide destination internal fields', () => {
  const trip = buildTrip({
    destinations: [
      buildStop({
        id: '20000000-0000-4000-8000-000000000003',
        stopOrder: 3,
        destinationId: '30000000-0000-4000-8000-000000000003',
      }),
      buildStop(),
    ],
  })

  const detail = toTripDetail(trip)

  assert.deepEqual(
    detail.stops.map((stop) => stop.stopOrder),
    [1, 3],
  )
  assert.deepEqual(
    Object.keys(detail.stops[0]).sort(),
    [
      'arrivalDate',
      'createdAt',
      'departureDate',
      'destination',
      'destinationId',
      'id',
      'stopOrder',
      'updatedAt',
    ].sort(),
  )
  assert.ok(detail.stops[0].destination)

  const serialized = JSON.stringify(detail)
  for (const sensitive of [
    'userId',
    'createdBy',
    'publicId',
    'tafera/seed',
  ]) {
    assert.equal(serialized.includes(sensitive), false)
  }
  assert.equal(
    Object.hasOwn(detail.stops[0].destination, 'status'),
    false,
  )
})

test('stop serialization normalizes dates and requires public keys only', () => {
  const stop = toTripStop(
    buildStop({
      arrivalDate: new Date('2027-03-29T00:00:00.000Z'),
      departureDate: null,
    }),
  )

  assert.deepEqual(
    Object.keys(stop).sort(),
    [
      'arrivalDate',
      'createdAt',
      'departureDate',
      'destination',
      'destinationId',
      'id',
      'stopOrder',
      'updatedAt',
    ].sort(),
  )
  assert.equal(stop.arrivalDate, '2027-03-29')
  assert.equal(stop.departureDate, null)
  assert.deepEqual(
    PUBLIC_TRIP_STOP_FIELDS.includes('destinationId'),
    true,
  )
})

test('listTrips scopes to the owner and applies status and pagination', async () => {
  const calls = []
  const { service } = createService({
    Trip: {
      async findAndCountAll(options) {
        calls.push(options)
        return { count: 23, rows: [buildTrip()] }
      },
    },
  })

  const result = await service.listTrips(
    'owner-1',
    parseTripListQuery({
      status: 'draft',
      page: '3',
      limit: '7',
    }),
  )

  assert.deepEqual(calls[0].where, {
    userId: 'owner-1',
    status: 'draft',
  })
  assert.deepEqual(calls[0].order, [
    ['startDate', 'DESC'],
    ['id', 'ASC'],
  ])
  assert.equal(calls[0].limit, 7)
  assert.equal(calls[0].offset, 14)
  assert.deepEqual(result.pagination, {
    page: 3,
    limit: 7,
    total: 23,
    totalPages: 4,
    hasNextPage: true,
    hasPreviousPage: true,
  })
})

test('getTrip applies public non-draft visibility and owner access', async () => {
  const calls = []
  const { service } = createService({
    Trip: {
      async findOne(options) {
        calls.push(options)
        return buildTrip({ status: 'published', destinations: [] })
      },
    },
  })

  await service.getTrip('trip-1')
  assert.deepEqual(calls[0].where, {
    id: 'trip-1',
    status: { [Op.ne]: 'draft' },
  })

  await service.getTrip('trip-1', 'owner-1')
  assert.deepEqual(calls[1].where, {
    id: 'trip-1',
    [Op.or]: [
      { userId: 'owner-1' },
      { status: { [Op.ne]: 'draft' } },
    ],
  })
})

test('getTrip returns the same not-found error for missing and draft trips', async () => {
  const { service } = createService({
    Trip: {
      async findOne() {
        return null
      },
    },
  })

  await assert.rejects(
    service.getTrip('trip-1'),
    (error) => {
      assert.ok(error instanceof TripNotFoundError)
      assert.equal(error.code, 'TRIP_NOT_FOUND')
      assert.equal(error.status, 404)
      assert.equal(error.expose, true)
      return true
    },
  )
})

test('createTrip uses the authenticated owner and returns a detail shape', async () => {
  let created = null
  const { service } = createService({
    Trip: {
      async create(values) {
        created = values
        return buildTrip({
          ...values,
          id: '10000000-0000-4000-8000-000000000001',
          destinations: [],
        })
      },
    },
  })

  const trip = await service.createTrip('owner-1', {
    title: 'Trip',
    startDate: '2027-03-28',
    endDate: '2027-04-10',
    userId: 'attacker',
  })

  assert.equal(created.userId, 'owner-1')
  assert.deepEqual(trip.stops, [])
  assert.equal(Object.hasOwn(trip, 'userId'), false)
})

test('updateTrip rejects date changes that invalidate a stop', async () => {
  let updateCalled = false
  const { service } = createService({
    Trip: {
      async findOne() {
        return buildTrip()
      },
      async update() {
        updateCalled = true
      },
    },
    TripDestination: {
      async findOne() {
        return buildStop()
      },
    },
  })

  await assert.rejects(
    service.updateTrip('owner-1', 'trip-1', {
      endDate: '2027-03-30',
    }),
    (error) => {
      assert.ok(error instanceof TripDatesConflictError)
      assert.equal(error.code, 'TRIP_DATES_CONFLICT')
      return true
    },
  )
  assert.equal(updateCalled, false)
})

test('updateTrip writes validated fields through the owner scope', async () => {
  const updates = []
  const { service } = createService({
    Trip: {
      async findOne(options) {
        if (options.include) {
          return buildTrip({ title: 'Renamed', destinations: [] })
        }
        return buildTrip()
      },
      async update(values, options) {
        updates.push({ values, options })
      },
    },
    TripDestination: {
      async findOne() {
        return null
      },
    },
  })

  await service.updateTrip('owner-1', 'trip-1', {
    title: 'Renamed',
    endDate: '2027-04-12',
  })

  assert.deepEqual(updates[0].values, {
    title: 'Renamed',
    endDate: '2027-04-12',
  })
  assert.deepEqual(updates[0].options.where, {
    id: 'trip-1',
    userId: 'owner-1',
  })
})

test('addStop assigns the next order and stores normalized dates', async () => {
  let created = null
  const { service } = createService({
    Trip: {
      async findOne() {
        return buildTrip({ destinations: [] })
      },
    },
    TripDestination: {
      async findOne() {
        return null
      },
      async max() {
        return 2
      },
      async create(values) {
        created = values
      },
    },
  })

  await service.addStop('owner-1', 'trip-1', {
    destinationId: '30000000-0000-4000-8000-000000000001',
    arrivalDate: null,
    departureDate: null,
  })

  assert.deepEqual(created, {
    tripId: 'trip-1',
    destinationId: '30000000-0000-4000-8000-000000000001',
    stopOrder: 3,
    arrivalDate: null,
    departureDate: null,
  })
})

test('addStop rejects duplicate and unpublished destinations', async () => {
  const duplicate = createService({
    Trip: {
      async findOne() {
        return buildTrip({ destinations: [] })
      },
    },
    TripDestination: {
      async findOne() {
        return buildStop()
      },
    },
  }).service

  await assert.rejects(
    duplicate.addStop('owner-1', 'trip-1', {
      destinationId: '30000000-0000-4000-8000-000000000001',
    }),
    (error) => {
      assert.ok(error instanceof TripStopExistsError)
      assert.equal(error.code, 'TRIP_STOP_EXISTS')
      return true
    },
  )

  const unpublished = createService({
    Trip: {
      async findOne() {
        return buildTrip({ destinations: [] })
      },
    },
    Destination: {
      async findOne() {
        return null
      },
    },
  }).service

  await assert.rejects(
    unpublished.addStop('owner-1', 'trip-1', {
      destinationId: '30000000-0000-4000-8000-000000000001',
    }),
    (error) => {
      assert.ok(error instanceof DestinationNotFoundError)
      assert.equal(error.code, 'DESTINATION_NOT_FOUND')
      return true
    },
  )
})

test('addStop rejects dates outside the trip range', async () => {
  const { service } = createService({
    Trip: {
      async findOne() {
        return buildTrip({ destinations: [] })
      },
    },
    TripDestination: {
      async findOne() {
        return null
      },
    },
  })

  await assert.rejects(
    service.addStop('owner-1', 'trip-1', {
      destinationId: '30000000-0000-4000-8000-000000000001',
      arrivalDate: '2027-03-27',
    }),
    (error) => {
      assert.ok(error instanceof ValidationError)
      assert.equal(
        error.details.some(
          (detail) => detail.field === 'arrivalDate',
        ),
        true,
      )
      return true
    },
  )
})

test('updateStop validates merged dates and scopes the stop to the trip', async () => {
  const updates = []
  const { service } = createService({
    Trip: {
      async findOne() {
        return buildTrip({ destinations: [] })
      },
    },
    TripDestination: {
      async findOne() {
        return buildStop()
      },
      async update(values, options) {
        updates.push({ values, options })
      },
    },
  })

  await assert.rejects(
    service.updateStop('owner-1', 'trip-1', 'stop-1', {
      departureDate: '2027-03-28',
    }),
    (error) => {
      assert.ok(error instanceof ValidationError)
      return true
    },
  )

  await service.updateStop('owner-1', 'trip-1', 'stop-1', {
    arrivalDate: null,
  })

  assert.deepEqual(updates[0].values, { arrivalDate: null })
  assert.deepEqual(updates[0].options.where, {
    id: 'stop-1',
    tripId: 'trip-1',
  })
})

test('updateStop reports missing stops through the trip scope', async () => {
  const { service } = createService({
    Trip: {
      async findOne() {
        return buildTrip({ destinations: [] })
      },
    },
    TripDestination: {
      async findOne() {
        return null
      },
    },
  })

  await assert.rejects(
    service.updateStop('owner-1', 'trip-1', 'stop-1', {
      arrivalDate: null,
    }),
    (error) => {
      assert.ok(error instanceof TripStopNotFoundError)
      assert.equal(error.code, 'TRIP_STOP_NOT_FOUND')
      return true
    },
  )
})

test('deleteStop removes the stop and compacts remaining orders', async () => {
  const updates = []
  const { service } = createService({
    Trip: {
      async findOne() {
        return buildTrip({ destinations: [] })
      },
    },
    TripDestination: {
      async findOne() {
        return buildStop()
      },
      async destroy() {},
      async findAll() {
        return [
          { id: 'stop-a', stopOrder: 1 },
          { id: 'stop-c', stopOrder: 3 },
        ]
      },
      async update(values, options) {
        updates.push({ values, options })
      },
    },
  })

  await service.deleteStop('owner-1', 'trip-1', 'stop-1')

  assert.deepEqual(updates, [
    {
      values: { stopOrder: 2 },
      options: {
        where: { id: 'stop-c', tripId: 'trip-1' },
        transaction: updates[0].options.transaction,
      },
    },
  ])
})

test('reorderStops uses a temporary offset and writes the requested order', async () => {
  const increments = []
  const updates = []
  const { service } = createService({
    Trip: {
      async findOne() {
        return buildTrip({ destinations: [] })
      },
    },
    TripDestination: {
      async findAll() {
        return [
          { id: 'stop-a', stopOrder: 1 },
          { id: 'stop-b', stopOrder: 2 },
          { id: 'stop-c', stopOrder: 3 },
        ]
      },
      async increment(values, options) {
        increments.push({ values, options })
      },
      async update(values, options) {
        updates.push({ values, options })
      },
    },
  })

  await service.reorderStops('owner-1', 'trip-1', {
    stopIds: ['stop-b', 'stop-c', 'stop-a'],
  })

  assert.deepEqual(increments[0].values, { stopOrder: 4 })
  assert.deepEqual(
    updates.map((update) => update.values.stopOrder),
    [1, 2, 3],
  )
  assert.deepEqual(
    updates.map((update) => update.options.where.id),
    ['stop-b', 'stop-c', 'stop-a'],
  )
})

test('reorderStops rejects lists that do not match the current stops', async () => {
  const { service } = createService({
    Trip: {
      async findOne() {
        return buildTrip({ destinations: [] })
      },
    },
    TripDestination: {
      async findAll() {
        return [
          { id: 'stop-a', stopOrder: 1 },
          { id: 'stop-b', stopOrder: 2 },
        ]
      },
    },
  })

  await assert.rejects(
    service.reorderStops('owner-1', 'trip-1', {
      stopIds: ['stop-a'],
    }),
    (error) => {
      assert.ok(error instanceof TripStopOrderConflictError)
      assert.equal(error.code, 'TRIP_STOP_ORDER_CONFLICT')
      return true
    },
  )

  await assert.rejects(
    service.reorderStops('owner-1', 'trip-1', {
      stopIds: ['stop-a', 'stop-c'],
    }),
    (error) => {
      assert.ok(error instanceof TripStopOrderConflictError)
      return true
    },
  )
})

test('deleteTrip reports missing and non-owned trips consistently', async () => {
  const missing = createService({
    Trip: {
      async destroy() {
        return 0
      },
    },
  }).service

  await assert.rejects(
    missing.deleteTrip('owner-1', 'trip-1'),
    (error) => {
      assert.ok(error instanceof TripNotFoundError)
      return true
    },
  )

  let destroyedWhere = null
  const owned = createService({
    Trip: {
      async destroy(options) {
        destroyedWhere = options.where
        return 1
      },
    },
  }).service

  await owned.deleteTrip('owner-1', 'trip-1')
  assert.deepEqual(destroyedWhere, {
    id: 'trip-1',
    userId: 'owner-1',
  })
})
