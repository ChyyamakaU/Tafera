'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { DestinationNotFoundError } = require('../src/utils/destinationErrors')
const { createPostService } = require('../src/services/postService')
const {
  PostAccessDeniedError,
  PostNotFoundError,
  ProfileNotFoundError,
} = require('../src/utils/socialErrors')

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_ID = '22222222-2222-4222-8222-222222222222'
const DESTINATION_ID = '33333333-3333-4333-8333-333333333333'

const author = {
  id: OWNER_ID,
  fullName: 'Ada Lovelace',
  profileImage: null,
  bio: null,
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
}

const destination = {
  id: DESTINATION_ID,
  name: 'Kyoto',
  slug: 'kyoto',
  country: 'Japan',
  state: 'Kyoto',
  location: 'Kyoto, Japan',
  latitude: '35.0116000',
  longitude: '135.7681000',
  description: 'Former imperial capital.',
  featured: false,
  status: 'published',
  createdAt: '2026-01-01T00:00:00.000Z',
  images: [],
}

const createPostRecord = (overrides = {}) => ({
  id: '44444444-4444-4444-8444-444444444444',
  userId: OWNER_ID,
  content: 'A post',
  author,
  destination: null,
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  updates: [],
  async update(values) {
    this.updates.push(values)
    Object.assign(this, values)
  },
  async destroy() {
    this.destroyed = true
  },
  ...overrides,
})

const createService = ({ post, postsResult, user } = {}) => {
  const calls = {
    destinationFindOne: [],
    postCreate: [],
    postFindOne: [],
    postFindAndCountAll: [],
    userFindOne: [],
  }

  const postRecord = post === undefined ? createPostRecord() : post

  const service = createPostService({
    Post: {
      async create(values) {
        calls.postCreate.push(values)
        return postRecord
      },
      async findOne(options) {
        calls.postFindOne.push(options)
        return postRecord
      },
      async findAndCountAll(options) {
        calls.postFindAndCountAll.push(options)
        return postsResult || { count: 0, rows: [] }
      },
    },
    User: {
      async findOne(options) {
        calls.userFindOne.push(options)
        return user === undefined ? { id: OWNER_ID } : user
      },
    },
    Destination: {
      async findOne(options) {
        calls.destinationFindOne.push(options)
        return options.where.status === 'published' &&
          options.where.id === DESTINATION_ID
          ? { id: DESTINATION_ID }
          : null
      },
    },
    DestinationImage: {},
  })

  return { service, calls, postRecord }
}

test('createPost validates the destination and assigns the authenticated author', async () => {
  const { service, calls, postRecord } = createService()
  const post = await service.createPost(OWNER_ID, {
    content: 'A post',
    destinationId: DESTINATION_ID,
  })

  assert.deepEqual(calls.destinationFindOne[0].where, {
    id: DESTINATION_ID,
    status: 'published',
  })
  assert.deepEqual(calls.postCreate[0], {
    content: 'A post',
    destinationId: DESTINATION_ID,
    userId: OWNER_ID,
  })
  assert.equal(post.id, postRecord.id)
  assert.equal(post.userId, undefined)
  assert.equal(post.author.id, OWNER_ID)
  assert.equal(post.author.email, undefined)
})

test('createPost rejects missing, draft and unpublished destinations', async () => {
  const { service, calls } = createService()
  const missing = '55555555-5555-4555-8555-555555555555'

  await assert.rejects(
    service.createPost(OWNER_ID, {
      content: 'A post',
      destinationId: missing,
    }),
    (error) => {
      assert.ok(error instanceof DestinationNotFoundError)
      assert.equal(error.code, 'DESTINATION_NOT_FOUND')
      assert.equal(error.status, 404)
      return true
    },
  )
  assert.equal(calls.postCreate.length, 0)
})

test('listPosts uses newest-first deterministic ordering and pagination', async () => {
  const post = createPostRecord({
    destination,
  })
  const { service, calls } = createService({
    post,
    postsResult: { count: 3, rows: [post] },
  })

  const result = await service.listPosts({ page: 2, limit: 1 })

  assert.equal(calls.postFindAndCountAll[0].order[0][0], 'createdAt')
  assert.equal(calls.postFindAndCountAll[0].order[0][1], 'DESC')
  assert.deepEqual(calls.postFindAndCountAll[0].order[1], ['id', 'DESC'])
  assert.equal(calls.postFindAndCountAll[0].limit, 1)
  assert.equal(calls.postFindAndCountAll[0].offset, 1)
  assert.equal(calls.postFindAndCountAll[0].distinct, true)

  const authorInclude = calls.postFindAndCountAll[0].include.find(
    (include) => include.as === 'author',
  )
  assert.equal(authorInclude.required, true)
  assert.deepEqual(authorInclude.where, { status: 'active' })

  assert.equal(result.posts.length, 1)
  assert.deepEqual(result.pagination, {
    page: 2,
    limit: 1,
    total: 3,
    totalPages: 3,
    hasNextPage: true,
    hasPreviousPage: true,
  })
})

test('getPost returns not found when the visible-author query has no row', async () => {
  const { service } = createService({ post: null })

  await assert.rejects(
    service.getPost('44444444-4444-4444-8444-444444444444'),
    (error) => {
      assert.ok(error instanceof PostNotFoundError)
      assert.equal(error.code, 'POST_NOT_FOUND')
      assert.equal(error.status, 404)
      return true
    },
  )
})

test('listUserPosts rejects missing and suspended profiles', async () => {
  const { service, calls } = createService({ user: null })

  await assert.rejects(
    service.listUserPosts(OWNER_ID, { page: 1, limit: 20 }),
    (error) => {
      assert.ok(error instanceof ProfileNotFoundError)
      assert.equal(error.code, 'PROFILE_NOT_FOUND')
      assert.equal(error.status, 404)
      return true
    },
  )
  assert.equal(calls.postFindAndCountAll.length, 0)
})

test('listUserPosts scopes the feed to the requested user', async () => {
  const { service, calls } = createService({
    postsResult: { count: 0, rows: [] },
  })

  await service.listUserPosts(OWNER_ID, { page: 1, limit: 20 })

  assert.deepEqual(calls.userFindOne[0].where, {
    id: OWNER_ID,
    status: 'active',
  })
  assert.deepEqual(calls.postFindAndCountAll[0].where, {
    userId: OWNER_ID,
  })
})

test('updatePost rejects a different author with POST_ACCESS_DENIED', async () => {
  const { service, postRecord } = createService({
    post: createPostRecord({ userId: OWNER_ID }),
  })

  await assert.rejects(
    service.updatePost(OTHER_ID, postRecord.id, { content: 'Nope' }),
    (error) => {
      assert.ok(error instanceof PostAccessDeniedError)
      assert.equal(error.code, 'POST_ACCESS_DENIED')
      assert.equal(error.status, 403)
      return true
    },
  )
  assert.equal(postRecord.updates.length, 0)
})

test('updatePost lets the author assign and clear a destination', async () => {
  const { service, postRecord } = createService({
    post: createPostRecord({ userId: OWNER_ID }),
  })

  await service.updatePost(OWNER_ID, postRecord.id, {
    destinationId: DESTINATION_ID,
  })
  assert.deepEqual(postRecord.updates[0], {
    destinationId: DESTINATION_ID,
  })

  await service.updatePost(OWNER_ID, postRecord.id, {
    destinationId: null,
  })
  assert.deepEqual(postRecord.updates[1], { destinationId: null })
})

test('updatePost validates a supplied destination before updating', async () => {
  const { service, calls, postRecord } = createService({
    post: createPostRecord({ userId: OWNER_ID }),
  })

  await assert.rejects(
    service.updatePost(OWNER_ID, postRecord.id, {
      destinationId: '66666666-6666-4666-8666-666666666666',
    }),
    DestinationNotFoundError,
  )
  assert.equal(postRecord.updates.length, 0)
  assert.equal(calls.postCreate.length, 0)
})

test('deletePost rejects non-authors and hard-deletes for the author', async () => {
  const nonAuthor = createService({ post: createPostRecord() })
  await assert.rejects(
    nonAuthor.service.deletePost(OTHER_ID, nonAuthor.postRecord.id),
    PostAccessDeniedError,
  )
  assert.equal(nonAuthor.postRecord.destroyed, undefined)

  const author = createService({ post: createPostRecord() })
  await author.service.deletePost(OWNER_ID, author.postRecord.id)
  assert.equal(author.postRecord.destroyed, true)
})

test('deletePost returns not found for a missing or hidden post', async () => {
  const { service } = createService({ post: null })

  await assert.rejects(
    service.deletePost(OWNER_ID, '44444444-4444-4444-8444-444444444444'),
    PostNotFoundError,
  )
})
