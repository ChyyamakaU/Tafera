'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createFollowService } = require('../src/services/followService')
const { ValidationError } = require('../src/utils/authErrors')
const { ProfileNotFoundError } = require('../src/utils/profileErrors')
const {
  FollowExistsError,
  FollowNotFoundError,
} = require('../src/utils/socialErrors')

const ACTOR_ID = '11111111-1111-4111-8111-111111111111'
const TARGET_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_ID = '33333333-3333-4333-8333-333333333333'
const FOLLOW_ID = '44444444-4444-4444-8444-444444444444'

const createProfile = (overrides = {}) => ({
  id: TARGET_ID,
  fullName: 'Grace Hopper',
  profileImage: null,
  bio: 'Computer scientist',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

const createFollowRecord = (overrides = {}) => ({
  id: FOLLOW_ID,
  followerId: ACTOR_ID,
  followingId: TARGET_ID,
  createdAt: '2026-01-05T00:00:00.000Z',
  async destroy() {
    this.destroyed = true
  },
  ...overrides,
})

const createService = ({
  targetUser,
  follow,
  existingFollow,
  followersResult,
  followingResult,
  createError,
} = {}) => {
  const calls = {
    userFindOne: [],
    followFindOne: [],
    followCreate: [],
    followFindAndCountAll: [],
  }

  const followRecord =
    follow === undefined ? createFollowRecord() : follow

  const service = createFollowService({
    User: {
      async findOne(options) {
        calls.userFindOne.push(options)
        return targetUser === undefined
          ? createProfile()
          : targetUser
      },
    },
    Follow: {
      async findOne(options) {
        calls.followFindOne.push(options)
        return existingFollow === undefined ? null : existingFollow
      },
      async create(values) {
        calls.followCreate.push(values)

        if (createError) throw createError

        return followRecord
      },
      async findAndCountAll(options) {
        calls.followFindAndCountAll.push(options)

        if (options.where.followingId) {
          return followersResult || { count: 0, rows: [] }
        }

        return followingResult || { count: 0, rows: [] }
      },
    },
  })

  return { service, calls, followRecord }
}

test('createFollow rejects self-following with the validation convention', async () => {
  const { service, calls } = createService()

  await assert.rejects(
    service.createFollow(ACTOR_ID, ACTOR_ID),
    (error) => {
      assert.ok(error instanceof ValidationError)
      assert.equal(error.code, 'VALIDATION_ERROR')
      assert.equal(error.status, 400)
      assert.deepEqual(error.details, [
        {
          field: 'userId',
          message: 'You cannot follow yourself.',
        },
      ])
      return true
    },
  )
  assert.equal(calls.userFindOne.length, 0)
  assert.equal(calls.followCreate.length, 0)
})

test('createFollow rejects missing and suspended targets', async () => {
  const { service, calls } = createService({ targetUser: null })

  await assert.rejects(
    service.createFollow(ACTOR_ID, TARGET_ID),
    (error) => {
      assert.ok(error instanceof ProfileNotFoundError)
      assert.equal(error.code, 'PROFILE_NOT_FOUND')
      assert.equal(error.status, 404)
      return true
    },
  )
  assert.deepEqual(calls.userFindOne[0].where, {
    id: TARGET_ID,
    status: 'active',
  })
  assert.equal(calls.followFindOne.length, 0)
  assert.equal(calls.followCreate.length, 0)
})

test('createFollow returns FOLLOW_EXISTS before inserting duplicates', async () => {
  const { service, calls } = createService({
    existingFollow: { id: FOLLOW_ID },
  })

  await assert.rejects(
    service.createFollow(ACTOR_ID, TARGET_ID),
    (error) => {
      assert.ok(error instanceof FollowExistsError)
      assert.equal(error.code, 'FOLLOW_EXISTS')
      assert.equal(error.status, 409)
      return true
    },
  )
  assert.deepEqual(calls.followFindOne[0].where, {
    followerId: ACTOR_ID,
    followingId: TARGET_ID,
  })
  assert.equal(calls.followCreate.length, 0)
})

test('createFollow assigns the authenticated follower and returns a safe relationship', async () => {
  const { service, calls, followRecord } = createService()

  const relationship = await service.createFollow(ACTOR_ID, TARGET_ID)

  assert.deepEqual(calls.followCreate[0], {
    followerId: ACTOR_ID,
    followingId: TARGET_ID,
  })
  assert.deepEqual(Object.keys(relationship).sort(), [
    'followedAt',
    'user',
  ])
  assert.equal(relationship.user.id, TARGET_ID)
  assert.equal(relationship.user.email, undefined)
  assert.equal(relationship.user.role, undefined)
  assert.equal(relationship.user.status, undefined)
  assert.equal(relationship.followedAt, followRecord.createdAt)
  assert.equal(relationship.id, undefined)
  assert.equal(relationship.followerId, undefined)
  assert.equal(relationship.followingId, undefined)
})

test('createFollow translates a unique constraint violation into FOLLOW_EXISTS', async () => {
  const uniqueError = Object.assign(
    new Error('duplicate key value violates unique constraint'),
    { name: 'SequelizeUniqueConstraintError' },
  )
  const { service } = createService({ createError: uniqueError })

  await assert.rejects(
    service.createFollow(ACTOR_ID, TARGET_ID),
    (error) => {
      assert.ok(error instanceof FollowExistsError)
      assert.equal(error.code, 'FOLLOW_EXISTS')
      return true
    },
  )
})

test('createFollow propagates unrelated persistence errors', async () => {
  const databaseError = Object.assign(new Error('database offline'), {
    name: 'SequelizeConnectionError',
  })
  const { service } = createService({ createError: databaseError })

  await assert.rejects(
    service.createFollow(ACTOR_ID, TARGET_ID),
    databaseError,
  )
})

test('deleteFollow rejects missing and suspended targets', async () => {
  const { service, calls } = createService({ targetUser: null })

  await assert.rejects(
    service.deleteFollow(ACTOR_ID, TARGET_ID),
    ProfileNotFoundError,
  )
  assert.equal(calls.followFindOne.length, 0)
})

test('deleteFollow returns FOLLOW_NOT_FOUND when no relationship exists', async () => {
  const { service } = createService({ existingFollow: null })

  await assert.rejects(
    service.deleteFollow(ACTOR_ID, TARGET_ID),
    (error) => {
      assert.ok(error instanceof FollowNotFoundError)
      assert.equal(error.code, 'FOLLOW_NOT_FOUND')
      assert.equal(error.status, 404)
      return true
    },
  )
})

test('deleteFollow removes the authenticated user relationship', async () => {
  const existingFollow = createFollowRecord()
  const { service, calls } = createService({ existingFollow })

  await service.deleteFollow(ACTOR_ID, TARGET_ID)

  assert.deepEqual(calls.followFindOne[0].where, {
    followerId: ACTOR_ID,
    followingId: TARGET_ID,
  })
  assert.equal(existingFollow.destroyed, true)
})

test('listFollowers checks the profile and uses deterministic ordering', async () => {
  const followerFollow = createFollowRecord({
    followerId: OTHER_ID,
    followingId: TARGET_ID,
    follower: createProfile({ id: OTHER_ID }),
  })
  const { service, calls } = createService({
    followersResult: { count: 3, rows: [followerFollow] },
  })

  const result = await service.listFollowers(TARGET_ID, {
    page: 2,
    limit: 1,
  })

  assert.deepEqual(calls.userFindOne[0].where, {
    id: TARGET_ID,
    status: 'active',
  })

  const query = calls.followFindAndCountAll[0]
  assert.deepEqual(query.where, { followingId: TARGET_ID })
  assert.deepEqual(query.order, [
    ['createdAt', 'DESC'],
    ['id', 'DESC'],
  ])
  assert.equal(query.limit, 1)
  assert.equal(query.offset, 1)
  assert.equal(query.distinct, true)

  const include = query.include.find((item) => item.as === 'follower')
  assert.equal(include.required, true)
  assert.deepEqual(include.where, { status: 'active' })

  assert.equal(result.followers.length, 1)
  assert.equal(result.followers[0].user.id, OTHER_ID)
  assert.equal(result.followers[0].id, undefined)
  assert.equal(result.followers[0].followerId, undefined)
  assert.equal(result.followers[0].followingId, undefined)
  assert.equal(result.followers[0].followedAt, followerFollow.createdAt)
  assert.deepEqual(result.pagination, {
    page: 2,
    limit: 1,
    total: 3,
    totalPages: 3,
    hasNextPage: true,
    hasPreviousPage: true,
  })
})

test('listFollowing checks the profile and includes the followed user', async () => {
  const followedFollow = createFollowRecord({
    followerId: TARGET_ID,
    followingId: OTHER_ID,
    followingUser: createProfile({ id: OTHER_ID }),
  })
  const { service, calls } = createService({
    followingResult: { count: 1, rows: [followedFollow] },
  })

  const result = await service.listFollowing(TARGET_ID, {
    page: 1,
    limit: 20,
  })

  const query = calls.followFindAndCountAll[0]
  assert.deepEqual(query.where, { followerId: TARGET_ID })
  const include = query.include.find(
    (item) => item.as === 'followingUser',
  )
  assert.equal(include.required, true)
  assert.deepEqual(include.where, { status: 'active' })

  assert.equal(result.following.length, 1)
  assert.equal(result.following[0].user.id, OTHER_ID)
  assert.equal(result.following[0].id, undefined)
  assert.equal(result.following[0].followedAt, followedFollow.createdAt)
})

test('listFollowers and listFollowing return PROFILE_NOT_FOUND for hidden profiles', async () => {
  const { service, calls } = createService({ targetUser: null })

  await assert.rejects(
    service.listFollowers(TARGET_ID, { page: 1, limit: 20 }),
    ProfileNotFoundError,
  )
  await assert.rejects(
    service.listFollowing(TARGET_ID, { page: 1, limit: 20 }),
    ProfileNotFoundError,
  )
  assert.equal(calls.followFindAndCountAll.length, 0)
})

test('lists defensively omit rows whose related account is not active', async () => {
  const suspendedFollow = createFollowRecord({
    follower: createProfile({
      id: OTHER_ID,
      status: 'suspended',
    }),
  })
  const { service } = createService({
    followersResult: { count: 1, rows: [suspendedFollow] },
  })

  const result = await service.listFollowers(TARGET_ID, {
    page: 1,
    limit: 20,
  })

  assert.deepEqual(result.followers, [])
  assert.equal(result.pagination.total, 1)
})
