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
  parseDestinationIdentifier,
  parseDestinationListQuery,
} = require('../src/validators/destination')
const { ValidationError } = require('../src/utils/authErrors')
const {
  DestinationNotFoundError,
} = require('../src/utils/destinationErrors')
const {
  createDestinationService,
} = require('../src/services/destinationService')
const {
  PUBLIC_DESTINATION_FIELDS,
  PUBLIC_DESTINATION_IMAGE_FIELDS,
  selectCoverImage,
  toDestinationDetail,
  toDestinationSummary,
  toPublicDestinationImage,
} = require('../src/utils/safeDestination')

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

const buildDestination = (overrides = {}) => ({
  id: 'd0000000-0000-4000-8000-000000000001',
  name: 'Kyoto',
  slug: 'kyoto-japan',
  country: 'Japan',
  state: 'Kyoto',
  description: 'Former imperial capital of Japan.',
  location: 'Kyoto, Japan',
  latitude: '35.0116',
  longitude: '135.7681',
  featured: true,
  status: 'published',
  createdBy: '00000000-0000-0000-0000-000000000099',
  createdAt: new Date('2026-01-15T00:00:00.000Z'),
  updatedAt: new Date('2026-01-16T00:00:00.000Z'),
  images: [],
  ...overrides,
})

const buildImage = (overrides = {}) => ({
  id: 'd1000000-0000-4000-8000-000000000001',
  destinationId: 'd0000000-0000-4000-8000-000000000001',
  imageUrl: 'https://images.example.com/kyoto.jpg',
  publicId: 'tafera/seed/destinations/kyoto-1',
  altText: 'Kyoto temple',
  displayOrder: 0,
  isCover: true,
  createdAt: new Date('2026-01-15T00:00:00.000Z'),
  updatedAt: new Date('2026-01-16T00:00:00.000Z'),
  ...overrides,
})

test('destination list query uses page, limit and featured defaults', () => {
  const parsed = parseDestinationListQuery({})

  assert.equal(parsed.page, DEFAULT_PAGE)
  assert.equal(parsed.limit, DEFAULT_LIMIT)
  assert.equal(parsed.sort, 'featured')
  assert.equal(parsed.order, 'desc')
  assert.equal(parsed.q, undefined)
  assert.equal(parsed.country, undefined)
  assert.equal(parsed.state, undefined)
  assert.equal(parsed.featured, undefined)
})

test('destination list query trims and parses supported filters', () => {
  const parsed = parseDestinationListQuery({
    q: '  kyoto  ',
    country: ' Japan ',
    state: ' Kyoto ',
    featured: 'true',
    sort: 'name',
    order: 'asc',
    page: '2',
    limit: '5',
  })

  assert.deepEqual(parsed, {
    q: 'kyoto',
    country: 'Japan',
    state: 'Kyoto',
    featured: true,
    sort: 'name',
    order: 'asc',
    page: 2,
    limit: 5,
  })
})

test('empty optional query values are treated as absent', () => {
  const parsed = parseDestinationListQuery({
    q: '   ',
    country: '',
    state: '   ',
    featured: '',
  })

  assert.equal(parsed.q, undefined)
  assert.equal(parsed.country, undefined)
  assert.equal(parsed.state, undefined)
  assert.equal(parsed.featured, undefined)
})

test('default sort direction matches each sort field', () => {
  assert.equal(
    parseDestinationListQuery({ sort: 'featured' }).order,
    'desc',
  )
  assert.equal(
    parseDestinationListQuery({ sort: 'createdAt' }).order,
    'desc',
  )
  assert.equal(
    parseDestinationListQuery({ sort: 'name' }).order,
    'asc',
  )
  assert.equal(
    parseDestinationListQuery({ sort: 'country' }).order,
    'asc',
  )
})

test('invalid list query values are rejected with field details', () => {
  const cases = [
    [{ page: '0' }, 'page'],
    [{ page: '-1' }, 'page'],
    [{ page: '1.5' }, 'page'],
    [{ page: 'abc' }, 'page'],
    [{ limit: '0' }, 'limit'],
    [{ limit: String(MAX_LIMIT + 1) }, 'limit'],
    [{ limit: 'abc' }, 'limit'],
    [{ featured: 'yes' }, 'featured'],
    [{ sort: 'popular' }, 'sort'],
    [{ order: 'up' }, 'order'],
    [{ q: 'x'.repeat(101) }, 'q'],
    [{ country: 'x'.repeat(101) }, 'country'],
    [{ state: 'x'.repeat(101) }, 'state'],
  ]

  for (const [input, field] of cases) {
    const details = detailsFor(() => parseDestinationListQuery(input))

    assert.equal(
      details.some((detail) => detail.field === field),
      true,
      `expected a ${field} error for ${JSON.stringify(input)}`,
    )
  }
})

test('destination identifiers accept UUIDs and lowercase kebab-case slugs', () => {
  assert.deepEqual(
    parseDestinationIdentifier({
      idOrSlug: ' D0000000-0000-4000-8000-000000000001 ',
    }),
    { idOrSlug: 'd0000000-0000-4000-8000-000000000001' },
  )

  assert.deepEqual(
    parseDestinationIdentifier({ idOrSlug: 'kyoto-japan' }),
    { idOrSlug: 'kyoto-japan' },
  )
})

test('malformed destination identifiers are rejected', () => {
  const cases = [
    '',
    '   ',
    'Kyoto-Japan',
    'kyoto--japan',
    '-kyoto',
    'kyoto-',
    'kyoto_japan',
    'x'.repeat(256),
  ]

  for (const idOrSlug of cases) {
    const details = detailsFor(() =>
      parseDestinationIdentifier({ idOrSlug }),
    )

    assert.equal(
      details.some((detail) => detail.field === 'idOrSlug'),
      true,
      `expected an idOrSlug error for ${JSON.stringify(idOrSlug)}`,
    )
  }
})

test('destination summaries expose only public fields', () => {
  const destination = buildDestination({
    images: [
      buildImage(),
      buildImage({
        id: 'd1000000-0000-4000-8000-000000000002',
        displayOrder: 1,
        isCover: false,
      }),
    ],
  })

  const summary = toDestinationSummary(destination)

  assert.deepEqual(
    Object.keys(summary).sort(),
    ['coverImage', ...PUBLIC_DESTINATION_FIELDS].sort(),
  )
  assert.equal(summary.latitude, 35.0116)
  assert.equal(summary.longitude, 135.7681)
  assert.equal(summary.coverImage.id, 'd1000000-0000-4000-8000-000000000001')

  const serialized = JSON.stringify(summary)
  for (const sensitive of [
    'createdBy',
    'created_by',
    '"status"',
    'updatedAt',
    'publicId',
    'public_id',
    'tafera/seed',
  ]) {
    assert.equal(serialized.includes(sensitive), false)
  }
})

test('destination details include ordered public images only', () => {
  const destination = buildDestination({
    images: [
      buildImage({
        id: 'd1000000-0000-4000-8000-000000000003',
        displayOrder: 2,
        isCover: false,
      }),
      buildImage({
        id: 'd1000000-0000-4000-8000-000000000001',
        displayOrder: 0,
        isCover: true,
      }),
      buildImage({
        id: 'd1000000-0000-4000-8000-000000000002',
        displayOrder: 1,
        isCover: false,
      }),
    ],
  })

  const detail = toDestinationDetail(destination)

  assert.deepEqual(
    detail.images.map((image) => image.displayOrder),
    [0, 1, 2],
  )

  for (const image of detail.images) {
    assert.deepEqual(
      Object.keys(image).sort(),
      [...PUBLIC_DESTINATION_IMAGE_FIELDS].sort(),
    )
    assert.equal(Object.hasOwn(image, 'publicId'), false)
  }
})

test('cover image prefers isCover, then display order, then null', () => {
  const preferred = selectCoverImage([
    buildImage({
      id: 'd1000000-0000-4000-8000-000000000001',
      displayOrder: 9,
      isCover: true,
    }),
    buildImage({
      id: 'd1000000-0000-4000-8000-000000000002',
      displayOrder: 0,
      isCover: false,
    }),
  ])
  assert.equal(preferred.id, 'd1000000-0000-4000-8000-000000000001')

  const fallback = selectCoverImage([
    buildImage({
      id: 'd1000000-0000-4000-8000-000000000003',
      displayOrder: 5,
      isCover: false,
    }),
    buildImage({
      id: 'd1000000-0000-4000-8000-000000000004',
      displayOrder: 1,
      isCover: false,
    }),
  ])
  assert.equal(fallback.id, 'd1000000-0000-4000-8000-000000000004')

  const tied = selectCoverImage([
    buildImage({
      id: 'd1000000-0000-4000-8000-000000000006',
      displayOrder: 0,
      isCover: false,
    }),
    buildImage({
      id: 'd1000000-0000-4000-8000-000000000005',
      displayOrder: 0,
      isCover: false,
    }),
  ])
  assert.equal(tied.id, 'd1000000-0000-4000-8000-000000000005')

  assert.equal(selectCoverImage([]), null)
  assert.equal(selectCoverImage(undefined), null)
})

test('image serialization uses an allowlist and normalizes display order', () => {
  const image = toPublicDestinationImage(
    buildImage({ displayOrder: '3', isCover: 1 }),
  )

  assert.deepEqual(image, {
    id: 'd1000000-0000-4000-8000-000000000001',
    imageUrl: 'https://images.example.com/kyoto.jpg',
    altText: 'Kyoto temple',
    displayOrder: 3,
    isCover: true,
  })
  assert.equal(Object.hasOwn(image, 'publicId'), false)
})

test('destination service applies published-only filters and pagination', async () => {
  const calls = []
  const destination = buildDestination({ images: [buildImage()] })
  const service = createDestinationService({
    Destination: {
      async findAndCountAll(options) {
        calls.push(options)
        return { count: 1, rows: [destination] }
      },
      async findOne() {
        assert.fail('findOne should not be used for list queries')
      },
    },
    DestinationImage: { name: 'DestinationImage' },
  })

  const result = await service.listDestinations(
    parseDestinationListQuery({}),
  )

  assert.equal(calls.length, 1)
  const options = calls[0]
  assert.deepEqual(options.where, { status: 'published' })
  assert.deepEqual(options.order, [
    ['featured', 'DESC'],
    ['name', 'ASC'],
    ['id', 'ASC'],
  ])
  assert.equal(options.limit, DEFAULT_LIMIT)
  assert.equal(options.offset, 0)
  assert.equal(options.distinct, true)
  assert.deepEqual(options.attributes, [...PUBLIC_DESTINATION_FIELDS])
  assert.equal(options.include[0].as, 'images')
  assert.equal(options.include[0].separate, true)
  assert.equal(
    options.include[0].attributes.includes('publicId'),
    false,
  )
  assert.equal(result.destinations.length, 1)
  assert.deepEqual(result.pagination, {
    page: 1,
    limit: DEFAULT_LIMIT,
    total: 1,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  })
})

test('destination service builds search, filters, sorting and paging', async () => {
  const calls = []
  const service = createDestinationService({
    Destination: {
      async findAndCountAll(options) {
        calls.push(options)
        return { count: 23, rows: [] }
      },
      async findOne() {
        assert.fail('findOne should not be used for list queries')
      },
    },
    DestinationImage: { name: 'DestinationImage' },
  })

  const filters = parseDestinationListQuery({
    q: '50%_off',
    country: 'Japan',
    state: 'Kyoto',
    featured: 'false',
    sort: 'name',
    order: 'desc',
    page: '3',
    limit: '7',
  })
  const result = await service.listDestinations(filters)

  const options = calls[0]
  assert.deepEqual(options.where, {
    status: 'published',
    country: { [Op.iLike]: 'Japan' },
    state: { [Op.iLike]: 'Kyoto' },
    featured: false,
    [Op.or]: [
      { name: { [Op.iLike]: '%50\\%\\_off%' } },
      { slug: { [Op.iLike]: '%50\\%\\_off%' } },
      { country: { [Op.iLike]: '%50\\%\\_off%' } },
      { state: { [Op.iLike]: '%50\\%\\_off%' } },
      { location: { [Op.iLike]: '%50\\%\\_off%' } },
      { description: { [Op.iLike]: '%50\\%\\_off%' } },
    ],
  })
  assert.deepEqual(options.order, [
    ['name', 'DESC'],
    ['id', 'ASC'],
  ])
  assert.equal(options.limit, 7)
  assert.equal(options.offset, 14)
  assert.deepEqual(result.pagination, {
    page: 3,
    limit: 7,
    total: 23,
    totalPages: 4,
    hasNextPage: true,
    hasPreviousPage: true,
  })
})

test('destination detail looks up UUIDs by id or slug and slugs by slug', async () => {
  const calls = []
  const destination = buildDestination({ images: [buildImage()] })
  const service = createDestinationService({
    Destination: {
      async findOne(options) {
        calls.push(options)
        return destination
      },
      async findAndCountAll() {
        assert.fail('findAndCountAll should not be used for detail')
      },
    },
    DestinationImage: { name: 'DestinationImage' },
  })

  const byUuid = await service.getDestination(
    'd0000000-0000-4000-8000-000000000001',
  )
  assert.deepEqual(calls[0].where, {
    status: 'published',
    [Op.or]: [
      { id: 'd0000000-0000-4000-8000-000000000001' },
      { slug: 'd0000000-0000-4000-8000-000000000001' },
    ],
  })
  assert.equal(byUuid.images.length, 1)

  await service.getDestination('kyoto-japan')
  assert.deepEqual(calls[1].where, {
    status: 'published',
    slug: 'kyoto-japan',
  })
})

test('missing and unpublished destinations return the same not-found error', async () => {
  const service = createDestinationService({
    Destination: {
      async findOne() {
        return null
      },
    },
    DestinationImage: { name: 'DestinationImage' },
  })

  await assert.rejects(
    service.getDestination('kyoto-japan'),
    (error) => {
      assert.ok(error instanceof DestinationNotFoundError)
      assert.equal(error.code, 'DESTINATION_NOT_FOUND')
      assert.equal(error.status, 404)
      assert.equal(error.expose, true)
      assert.equal(error.message, 'Destination not found.')
      return true
    },
  )
})

test('empty result pages report zero pages and no previous page', async () => {
  const service = createDestinationService({
    Destination: {
      async findAndCountAll() {
        return { count: 0, rows: [] }
      },
    },
    DestinationImage: { name: 'DestinationImage' },
  })

  const result = await service.listDestinations(
    parseDestinationListQuery({ page: '2', limit: '5' }),
  )

  assert.deepEqual(result.pagination, {
    page: 2,
    limit: 5,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  })
})
