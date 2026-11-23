'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const cloudinary = require('../src/config/cloudinary')
const { ValidationError } = require('../src/utils/authErrors')
const { DestinationNotFoundError } = require('../src/utils/destinationErrors')
const { PUBLIC_STORY_FIELDS, toStory } = require('../src/utils/safeStory')
const {
  StoryNotFoundError,
  StoryOrderConflictError,
} = require('../src/utils/storyErrors')
const {
  parseCreateStory,
  parseReorderStories,
  parseStoryId,
  parseStoryListQuery,
  parseUpdateStory,
} = require('../src/validators/story')
const { createStoryService } = require('../src/services/storyService')

const ADMIN_ID = '11111111-1111-4111-8111-111111111111'
const AUTHOR_ID = '22222222-2222-4222-8222-222222222222'
const DEST_ID = '33333333-3333-4333-8333-333333333333'
const STORY_1 = '44444444-4444-4444-8444-444444444441'
const STORY_2 = '44444444-4444-4444-8444-444444444442'

const buildStoryRecord = (overrides = {}) => ({
  id: STORY_1,
  title: 'Dawn above Idanre Hills',
  excerpt: 'Climbing the 660 steps before sunrise was unforgettable.',
  badgeLabel: 'Traveller spotlight',
  authorName: 'Ada Traveller',
  authorId: AUTHOR_ID,
  destinationId: DEST_ID,
  postId: null,
  coverImageUrl: null,
  coverImagePublicId: 'tafera/stories/old-cover',
  coverImageAlt: 'Misty hills',
  isFeatured: true,
  displayOrder: 0,
  createdBy: ADMIN_ID,
  createdAt: '2026-11-20T10:00:00.000Z',
  updatedAt: '2026-11-20T10:00:00.000Z',
  author: {
    id: AUTHOR_ID,
    fullName: 'Ada Traveller',
    profileImage: null,
    bio: null,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  destination: {
    id: DEST_ID,
    name: 'Idanre Hills',
    slug: 'idanre-hills',
    country: 'Nigeria',
    state: 'Ondo',
    location: 'Ondo, Nigeria',
    latitude: '7.1000',
    longitude: '5.1000',
    description: 'Ancient hills.',
    featured: true,
    status: 'published',
    createdAt: '2026-01-01T00:00:00.000Z',
    images: [],
  },
  async update(values) {
    Object.assign(this, values)
  },
  async destroy() {
    this.destroyed = true
  },
  ...overrides,
})

test('story validators apply defaults, validate URLs, and require unique reorder IDs', () => {
  const parsed = parseCreateStory({
    title: '  Dawn above Idanre Hills  ',
    excerpt: '  A memorable climb.  ',
    authorName: '  Ada Traveller  ',
    coverImageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/hills.jpg',
    destinationId: '',
  })

  assert.equal(parsed.title, 'Dawn above Idanre Hills')
  assert.equal(parsed.badgeLabel, 'Traveller spotlight')
  assert.equal(parsed.isFeatured, true)
  assert.equal(parsed.destinationId, null)

  assert.throws(
    () =>
      parseCreateStory({
        title: 'Bad URL',
        excerpt: 'Test',
        authorName: 'Ada',
        coverImageUrl: 'javascript:alert(1)',
      }),
    ValidationError,
  )

  assert.throws(() => parseUpdateStory({}), ValidationError)
  assert.throws(
    () => parseReorderStories({ storyIds: [STORY_1, STORY_1] }),
    ValidationError,
  )
  assert.deepEqual(parseStoryListQuery({ limit: '3' }), { limit: 3 })
  assert.deepEqual(parseStoryId({ storyId: STORY_1.toUpperCase() }), {
    storyId: STORY_1,
  })
})

test('toStory enforces explicit allowlist and hides draft destinations and suspended authors', () => {
  const serialized = toStory(buildStoryRecord())
  assert.deepEqual(
    Object.keys(serialized).sort(),
    [...PUBLIC_STORY_FIELDS, 'author', 'destination'].sort(),
  )
  assert.equal(serialized.createdBy, undefined)
  assert.equal(serialized.coverImagePublicId, undefined)
  assert.equal(serialized.destination.slug, 'idanre-hills')

  const hiddenRefs = toStory(
    buildStoryRecord({
      author: { id: AUTHOR_ID, fullName: 'Hidden', status: 'suspended' },
      destination: { id: DEST_ID, name: 'Draft', status: 'draft' },
    }),
  )
  assert.equal(hiddenRefs.author, null)
  assert.equal(hiddenRefs.destination, null)
})

test('storyService manages CRUD, cover uploads, Cloudinary cleanup, and transactional reordering', async () => {
  const stored = [
    buildStoryRecord({ id: STORY_1, displayOrder: 0 }),
    buildStoryRecord({ id: STORY_2, title: 'Sunset in Calabar', displayOrder: 1, isFeatured: false }),
  ]

  const destroyedPublicIds = []
  const originalDestroy = cloudinary.uploader.destroy
  const originalUploadStream = cloudinary.uploader.upload_stream

  cloudinary.uploader.destroy = async (publicId) => {
    destroyedPublicIds.push(publicId)
    return { result: 'ok' }
  }
  cloudinary.uploader.upload_stream = (_options, callback) => ({
    end: () =>
      callback(null, {
        secure_url: 'https://res.cloudinary.com/demo/image/upload/v2/new-cover.jpg',
        public_id: 'tafera/stories/new-cover',
      }),
  })

  try {
    const service = createStoryService({
      TravellerStory: {
        async findAll({ where } = {}) {
          let rows = [...stored]
          if (where?.isFeatured === true) {
            rows = rows.filter((item) => item.isFeatured)
          }
          return rows.sort((a, b) => a.displayOrder - b.displayOrder)
        },
        async findOne({ where }) {
          return stored.find((item) => item.id === where.id) || null
        },
        async max() {
          return stored.reduce((max, item) => Math.max(max, item.displayOrder), -1)
        },
        async create(values) {
          const record = buildStoryRecord({
            id: '44444444-4444-4444-8444-444444444443',
            ...values,
            coverImagePublicId: null,
          })
          stored.push(record)
          return record
        },
        async update(values, { where }) {
          const item = stored.find((entry) => entry.id === where.id)
          if (item) Object.assign(item, values)
          return [item ? 1 : 0]
        },
      },
      Destination: {
        async findOne({ where }) {
          return where.id === DEST_ID && where.status === 'published'
            ? { id: DEST_ID }
            : null
        },
      },
      DestinationImage: {},
      User: {
        async findOne({ where }) {
          return where.id === AUTHOR_ID && where.status === 'active'
            ? { id: AUTHOR_ID }
            : null
        },
      },
      Post: { async findOne() { return null } },
      sequelize: {
        async transaction(cb) {
          return cb({})
        },
      },
    })

    // Featured list excludes hidden stories
    const featured = await service.listFeaturedStories({ limit: 3 })
    assert.equal(featured.length, 1)
    assert.equal(featured[0].id, STORY_1)

    // Admin list includes all stories
    const all = await service.listAllStories()
    assert.equal(all.length, 2)

    // Invalid destination rejected
    await assert.rejects(
      service.createStory(ADMIN_ID, {
        title: 'Bad dest',
        excerpt: 'Test',
        authorName: 'Ada',
        destinationId: '99999999-9999-4999-8999-999999999999',
      }),
      DestinationNotFoundError,
    )

    // Cover upload replaces old Cloudinary asset
    const withCover = await service.uploadStoryCover(
      STORY_1,
      { buffer: Buffer.from('img') },
      'Sunrise view',
    )
    assert.equal(
      withCover.coverImageUrl,
      'https://res.cloudinary.com/demo/image/upload/v2/new-cover.jpg',
    )
    assert.equal(withCover.coverImageAlt, 'Sunrise view')
    assert.deepEqual(destroyedPublicIds, ['tafera/stories/old-cover'])

    // Reorder rejects mismatched sets and updates displayOrder cleanly
    await assert.rejects(
      service.reorderStories([STORY_1]),
      StoryOrderConflictError,
    )
    const reordered = await service.reorderStories([STORY_2, STORY_1])
    assert.deepEqual(
      reordered.map((item) => item.id),
      [STORY_2, STORY_1],
    )
    assert.deepEqual(
      reordered.map((item) => item.displayOrder),
      [0, 1],
    )

    // Delete removes story and cleans up Cloudinary asset
    await assert.rejects(
      service.deleteStory('99999999-9999-4999-8999-999999999999'),
      StoryNotFoundError,
    )
    await service.deleteStory(STORY_1)
    assert.equal(destroyedPublicIds.includes('tafera/stories/new-cover'), true)
  } finally {
    cloudinary.uploader.destroy = originalDestroy
    cloudinary.uploader.upload_stream = originalUploadStream
  }
})
