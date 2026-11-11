'use strict'

process.env.NODE_ENV = 'development'
process.env.SESSION_SECRET =
  'test-only-session-secret-0123456789abcdef'
process.env.DB_NAME = process.env.DB_NAME || 'tafera'
process.env.DB_USER = process.env.DB_USER || 'tafera_user'
process.env.ARGON2_MAX_QUEUE = '50'

const {
  test,
  before,
  after,
  beforeEach,
} = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const crypto = require('node:crypto')
const express = require('express')
const cookieParser = require('cookie-parser')
const { Sequelize, DataTypes } = require('sequelize')
const { createClient } = require('redis')

const { runtimeConfig } = require('../src/config/database')
const UserModel = require('../src/models/user')
const FollowModel = require('../src/models/follow')
const passwordService = require('../src/services/passwordService')
const sessionService = require('../src/services/sessionService')
const {
  createSessionIndex,
} = require('../src/services/sessionIndex')
const {
  createSessionMiddleware,
} = require('../src/config/session')
const {
  createSessionPolicy,
} = require('../src/middlewares/sessionPolicy')
const { createAuthService } = require('../src/services/authService')
const {
  createAuthController,
} = require('../src/controllers/authController')
const {
  createCsrfProtection,
} = require('../src/middlewares/csrfProtection')
const { createUsersRouter } = require('../src/routes/users')
const {
  createProfileService,
} = require('../src/services/profileService')
const { createFollowService } = require('../src/services/followService')
const { PUBLIC_PROFILE_FIELDS } = require('../src/utils/safeUser')
const errorHandler = require('../src/middlewares/errorHandler')

const TEST_SECRET = 'test-only-session-secret-0123456789abcdef'
const SESSION_COOKIE = 'tafera.sid'
const PASSWORD = 'a sufficiently long passphrase'

let base = null
let scoped = null
let User = null
let Follow = null
let schema = null
let databaseAvailable = false
let redisClient = null
let redisAvailable = false
let passwordHashPromise = null

const getPasswordHash = () => {
  if (!passwordHashPromise) {
    passwordHashPromise = passwordService.hashPassword(PASSWORD)
  }

  return passwordHashPromise
}

before(async () => {
  const config = runtimeConfig()
  const connection = {
    ...config.options,
    host: config.host,
    port: config.port,
    logging: false,
  }

  base = new Sequelize(
    config.database,
    config.username,
    config.password,
    connection,
  )

  try {
    await base.authenticate()

    schema = `tafera_follows_${process.pid}_${Date.now()}`
    await base.query(`CREATE SCHEMA "${schema}"`)
    await base.query(
      `CREATE TYPE "${schema}".enum_users_role AS ENUM ('user', 'admin')`,
    )
    await base.query(
      `CREATE TYPE "${schema}".enum_users_status AS ENUM ('active', 'suspended')`,
    )
    await base.query(
      `CREATE TABLE "${schema}".users (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         full_name varchar(255) NOT NULL,
         email varchar(255) NOT NULL,
         password_hash varchar(255) NOT NULL,
         profile_image varchar(255),
         bio text,
         role "${schema}".enum_users_role NOT NULL DEFAULT 'user',
         status "${schema}".enum_users_status NOT NULL DEFAULT 'active',
         auth_version integer NOT NULL DEFAULT 1,
         email_verified_at timestamptz,
         created_at timestamptz NOT NULL DEFAULT now(),
         updated_at timestamptz NOT NULL DEFAULT now()
       )`,
    )
    await base.query(
      `CREATE UNIQUE INDEX users_email_lower_unique
       ON "${schema}".users (lower(email))`,
    )
    await base.query(
      `CREATE TABLE "${schema}".follows (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         follower_id uuid NOT NULL REFERENCES "${schema}".users(id)
           ON DELETE CASCADE ON UPDATE CASCADE,
         following_id uuid NOT NULL REFERENCES "${schema}".users(id)
           ON DELETE CASCADE ON UPDATE CASCADE,
         created_at timestamptz NOT NULL DEFAULT now(),
         CONSTRAINT follows_follower_id_following_id_unique
           UNIQUE (follower_id, following_id),
         CONSTRAINT follows_no_self_follow_check
           CHECK (follower_id <> following_id)
       )`,
    )
    await base.query(
      `CREATE INDEX follows_follower_id_idx
       ON "${schema}".follows (follower_id)`,
    )
    await base.query(
      `CREATE INDEX follows_following_id_idx
       ON "${schema}".follows (following_id)`,
    )

    scoped = new Sequelize(
      config.database,
      config.username,
      config.password,
      {
        ...connection,
        searchPath: schema,
        dialectOptions: {
          ...(config.options.dialectOptions || {}),
          prependSearchPath: true,
        },
      },
    )

    await scoped.authenticate()

    User = UserModel(scoped, DataTypes)
    Follow = FollowModel(scoped, DataTypes)

    Follow.belongsTo(User, {
      foreignKey: 'followerId',
      as: 'follower',
    })
    Follow.belongsTo(User, {
      foreignKey: 'followingId',
      as: 'followingUser',
    })
    User.hasMany(Follow, {
      foreignKey: 'followerId',
      as: 'following',
    })
    User.hasMany(Follow, {
      foreignKey: 'followingId',
      as: 'followers',
    })

    databaseAvailable = true
  } catch {
    databaseAvailable = false
  }

  redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  })
  redisClient.on('error', () => {})

  try {
    await redisClient.connect()
    await redisClient.ping()
    redisAvailable = true
  } catch {
    redisAvailable = false
    try {
      redisClient.destroy()
    } catch {
      // ignore
    }
    redisClient = null
  }
})

after(async () => {
  if (base && schema) {
    await base
      .query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      .catch(() => {})
  }
  if (scoped) {
    await scoped.close().catch(() => {})
  }
  if (base) {
    await base.close().catch(() => {})
  }
  if (redisClient && redisClient.isOpen) {
    await redisClient.quit().catch(() => {})
  }
})

beforeEach(async () => {
  if (databaseAvailable) {
    await base.query(
      `TRUNCATE TABLE "${schema}".follows,
         "${schema}".users CASCADE`,
    )
  }
})

const skip = (t) => {
  if (!databaseAvailable) {
    t.skip('PostgreSQL is unavailable; follow integration test skipped')
    return true
  }
  if (!redisAvailable) {
    t.skip('Redis is unavailable; follow integration test skipped')
    return true
  }
  return false
}

const request = ({ port, method = 'GET', path = '/', headers = {}, body }) =>
  new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body)
    const requestHeaders = { ...headers }

    if (payload !== undefined) {
      requestHeaders['Content-Type'] = 'application/json'
      requestHeaders['Content-Length'] = Buffer.byteLength(payload)
    }

    const req = http.request(
      { host: '127.0.0.1', port, method, path, headers: requestHeaders },
      (res) => {
        let raw = ''
        res.on('data', (chunk) => {
          raw += chunk
        })
        res.on('end', () => {
          let parsed = null

          if (raw.length > 0) {
            try {
              parsed = JSON.parse(raw)
            } catch {
              parsed = raw
            }
          }

          resolve({
            status: res.statusCode,
            headers: res.headers,
            setCookies: res.headers['set-cookie'] || [],
            body: parsed,
          })
        })
      },
    )

    req.on('error', reject)
    if (payload !== undefined) req.write(payload)
    req.end()
  })

const createHttpClient = (port) => {
  let cookie = null
  let csrfToken = null

  const send = async (method, path, { body } = {}) => {
    const headers = {}

    if (cookie) {
      headers.Cookie = cookie
    }

    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken
    }

    const response = await request({
      port,
      method,
      path,
      headers,
      body,
    })

    const setCookie = (response.setCookies || []).find((header) =>
      header.startsWith(`${SESSION_COOKIE}=`),
    )

    if (setCookie) {
      cookie = setCookie.split(';')[0]
    }

    if (response.body && response.body.data) {
      if (typeof response.body.data.csrfToken === 'string') {
        csrfToken = response.body.data.csrfToken
      }
    }

    return response
  }

  return {
    get: (path) => send('GET', path),
    post: (path, body) => send('POST', path, { body }),
    patch: (path, body) => send('PATCH', path, { body }),
    delete: (path) => send('DELETE', path),
    clearCsrf: () => {
      csrfToken = null
    },
  }
}

const startServer = async (app) => {
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })

  return server
}

const cleanupNamespace = async (namespace) => {
  const keys = await redisClient.keys(`${namespace}:*`)
  if (keys.length > 0) {
    await redisClient.del(keys)
  }
}

const createHarness = async () => {
  const namespace = `tafera-follow-test-${crypto.randomUUID()}`
  const index = createSessionIndex({ client: redisClient, namespace })
  const nodeEnv = 'development'
  const sessions = {
    createAuthenticatedSession: (req, user, options = {}) =>
      sessionService.createAuthenticatedSession(req, user, {
        ...options,
        index,
        nodeEnv,
      }),
    createAnonymousSession: (req, options = {}) =>
      sessionService.createAnonymousSession(req, {
        ...options,
        index,
        nodeEnv,
      }),
    destroySession: (req, options = {}) =>
      sessionService.destroySession(req, {
        ...options,
        index,
        nodeEnv,
      }),
  }

  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use(
    createSessionMiddleware({
      nodeEnv,
      namespace,
      client: redisClient,
      secret: TEST_SECRET,
    }),
  )
  app.use(createSessionPolicy({ nodeEnv, index }))

  const authService = createAuthService({
    User,
    sessions,
    nodeEnv,
    verifications: {},
  })
  const authController = createAuthController({
    authService,
    sessions,
    nodeEnv,
    verifications: {},
  })
  const authRouter = express.Router()
  authRouter.get('/csrf', authController.csrf)
  authRouter.post(
    '/login',
    createCsrfProtection(),
    authController.login,
  )
  app.use('/api/auth', authRouter)

  const profileService = createProfileService({ User })
  const followService = createFollowService({ Follow, User })
  const postService = {
    async listUserPosts() {
      return { posts: [], pagination: {} }
    },
  }

  app.use(
    '/api/users',
    createUsersRouter({
      profileService,
      postService,
      followService,
      sessions,
      nodeEnv,
      User,
    }),
  )
  app.use(errorHandler)

  const server = await startServer(app)

  return {
    namespace,
    port: server.address().port,
    client: () => createHttpClient(server.address().port),
    close: async () => {
      await new Promise((resolve) => server.close(resolve))
      await cleanupNamespace(namespace)
    },
  }
}

const createUser = async (overrides = {}) => {
  const passwordHash = await getPasswordHash()

  return User.create({
    fullName: 'Ada Lovelace',
    email: `ada-${crypto.randomUUID()}@example.com`,
    passwordHash,
    role: 'user',
    status: 'active',
    authVersion: 1,
    emailVerifiedAt: new Date(),
    ...overrides,
    passwordHash,
  })
}

const loginUser = async (client, email) => {
  await client.get('/api/auth/csrf')
  return client.post('/api/auth/login', { email, password: PASSWORD })
}

const createVerifiedClient = async (harness, overrides = {}) => {
  const user = await createUser(overrides)
  const client = harness.client()
  const login = await loginUser(client, user.email)

  assert.equal(login.status, 200)

  return { user, client }
}

const follow = (client, userId, body) =>
  client.post(`/api/users/${userId}/follow`, body)

const unfollow = (client, userId) =>
  client.delete(`/api/users/${userId}/follow`)

const listFollowers = (client, userId, query = '') =>
  client.get(`/api/users/${userId}/followers${query}`)

const listFollowing = (client, userId, query = '') =>
  client.get(`/api/users/${userId}/following${query}`)

const assertNoStore = (response) => {
  assert.match(
    String(response.headers['cache-control'] || ''),
    /no-store/,
  )
}

const assertPublicFollow = (entry, expectedUserId) => {
  assert.deepEqual(Object.keys(entry).sort(), [
    'followedAt',
    'user',
  ])
  assert.equal(entry.id, undefined)
  assert.equal(entry.followerId, undefined)
  assert.equal(entry.followingId, undefined)
  assert.equal(entry.user.id, expectedUserId)
  assert.deepEqual(
    Object.keys(entry.user).sort(),
    [...PUBLIC_PROFILE_FIELDS].sort(),
  )
  assert.equal(entry.user.email, undefined)
  assert.equal(entry.user.role, undefined)
  assert.equal(entry.user.status, undefined)
  assert.equal(entry.user.emailVerifiedAt, undefined)
  assert.equal(entry.user.passwordHash, undefined)
}

test('verified users can follow a public profile and protected input is ignored', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const actor = await createVerifiedClient(harness)
    const target = await createVerifiedClient(harness)

    const response = await follow(actor.client, target.user.id, {
      followerId: target.user.id,
      followingId: actor.user.id,
      id: 'attacker-id',
      createdAt: '2020-01-01T00:00:00.000Z',
    })

    assert.equal(response.status, 201)
    assertNoStore(response)
    assertPublicFollow(response.body.data.follow, target.user.id)
    assert.notEqual(
      response.body.data.follow.followedAt,
      '2020-01-01T00:00:00.000Z',
    )

    const stored = await Follow.findOne({
      where: {
        followerId: actor.user.id,
        followingId: target.user.id,
      },
    })
    assert.ok(stored)
    assert.equal(stored.followerId, actor.user.id)
    assert.equal(stored.followingId, target.user.id)
    assert.equal(await Follow.count(), 1)
  } finally {
    await harness.close()
  }
})

test('follow writes require authentication, CSRF and a verified email', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const actor = await createVerifiedClient(harness)
    const target = await createVerifiedClient(harness)

    const anonymous = await follow(harness.client(), target.user.id)
    assert.equal(anonymous.status, 401)
    assert.equal(anonymous.body.error.code, 'AUTH_REQUIRED')
    assertNoStore(anonymous)

    const unverifiedUser = await createUser({ emailVerifiedAt: null })
    const unverified = harness.client()
    assert.equal(
      (await loginUser(unverified, unverifiedUser.email)).status,
      200,
    )
    const blocked = await follow(unverified, target.user.id)
    assert.equal(blocked.status, 403)
    assert.equal(
      blocked.body.error.code,
      'EMAIL_VERIFICATION_REQUIRED',
    )

    actor.client.clearCsrf()
    const missingCsrf = await follow(actor.client, target.user.id)
    assert.equal(missingCsrf.status, 403)
    assert.equal(
      missingCsrf.body.error.code,
      'CSRF_TOKEN_INVALID',
    )

    const deleteClient = await createVerifiedClient(harness)
    deleteClient.client.clearCsrf()
    const missingDeleteCsrf = await unfollow(
      deleteClient.client,
      target.user.id,
    )
    assert.equal(missingDeleteCsrf.status, 403)
    assert.equal(
      missingDeleteCsrf.body.error.code,
      'CSRF_TOKEN_INVALID',
    )
  } finally {
    await harness.close()
  }
})

test('users cannot follow themselves', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const actor = await createVerifiedClient(harness)

    const response = await follow(actor.client, actor.user.id)

    assert.equal(response.status, 400)
    assert.equal(response.body.error.code, 'VALIDATION_ERROR')
    assert.deepEqual(response.body.error.details, [
      {
        field: 'userId',
        message: 'You cannot follow yourself.',
      },
    ])
    assertNoStore(response)
    assert.equal(await Follow.count(), 0)
  } finally {
    await harness.close()
  }
})

test('missing and suspended targets return PROFILE_NOT_FOUND for every endpoint', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const actor = await createVerifiedClient(harness)
    const suspended = await createVerifiedClient(harness)
    await suspended.user.update({ status: 'suspended' })

    const missingId = crypto.randomUUID()

    const missingFollow = await follow(actor.client, missingId)
    assert.equal(missingFollow.status, 404)
    assert.equal(
      missingFollow.body.error.code,
      'PROFILE_NOT_FOUND',
    )
    assertNoStore(missingFollow)

    const suspendedFollow = await follow(
      actor.client,
      suspended.user.id,
    )
    assert.equal(suspendedFollow.status, 404)
    assert.equal(
      suspendedFollow.body.error.code,
      'PROFILE_NOT_FOUND',
    )

    const missingUnfollow = await unfollow(actor.client, missingId)
    assert.equal(missingUnfollow.status, 404)
    assert.equal(
      missingUnfollow.body.error.code,
      'PROFILE_NOT_FOUND',
    )

    const suspendedUnfollow = await unfollow(
      actor.client,
      suspended.user.id,
    )
    assert.equal(suspendedUnfollow.status, 404)
    assert.equal(
      suspendedUnfollow.body.error.code,
      'PROFILE_NOT_FOUND',
    )

    for (const [client, userId] of [
      [harness.client(), missingId],
      [harness.client(), suspended.user.id],
    ]) {
      const followers = await listFollowers(client, userId)
      assert.equal(followers.status, 404)
      assert.equal(
        followers.body.error.code,
        'PROFILE_NOT_FOUND',
      )
      assertNoStore(followers)

      const following = await listFollowing(client, userId)
      assert.equal(following.status, 404)
      assert.equal(
        following.body.error.code,
        'PROFILE_NOT_FOUND',
      )
    }
  } finally {
    await harness.close()
  }
})

test('duplicate follows return FOLLOW_EXISTS', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const actor = await createVerifiedClient(harness)
    const target = await createVerifiedClient(harness)

    assert.equal(
      (await follow(actor.client, target.user.id)).status,
      201,
    )

    const duplicate = await follow(actor.client, target.user.id)
    assert.equal(duplicate.status, 409)
    assert.equal(duplicate.body.error.code, 'FOLLOW_EXISTS')
    assertNoStore(duplicate)
    assert.equal(await Follow.count(), 1)

    // The schema itself also enforces uniqueness if two requests race past
    // the service's existence check.
    await assert.rejects(
      Follow.create({
        followerId: actor.user.id,
        followingId: target.user.id,
      }),
      (error) =>
        error.name === 'SequelizeUniqueConstraintError',
    )
  } finally {
    await harness.close()
  }
})

test('unfollowing removes the relationship and reports missing ones', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const actor = await createVerifiedClient(harness)
    const target = await createVerifiedClient(harness)

    assert.equal(
      (await follow(actor.client, target.user.id)).status,
      201,
    )

    const deleted = await unfollow(actor.client, target.user.id)
    assert.equal(deleted.status, 204)
    assertNoStore(deleted)
    assert.equal(deleted.body, null)
    assert.equal(await Follow.count(), 0)

    const missing = await unfollow(actor.client, target.user.id)
    assert.equal(missing.status, 404)
    assert.equal(missing.body.error.code, 'FOLLOW_NOT_FOUND')
    assertNoStore(missing)
  } finally {
    await harness.close()
  }
})

test('followers listings are public, paginated and deterministically newest first', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const target = await createVerifiedClient(harness)
    const first = await createVerifiedClient(harness)
    const second = await createVerifiedClient(harness)
    const third = await createVerifiedClient(harness)

    for (const follower of [first, second, third]) {
      assert.equal(
        (await follow(follower.client, target.user.id)).status,
        201,
      )
    }

    await Follow.update(
      { createdAt: new Date('2026-01-01T00:00:00.000Z') },
      {
        where: {
          followerId: first.user.id,
          followingId: target.user.id,
        },
      },
    )
    await Follow.update(
      { createdAt: new Date('2026-01-02T00:00:00.000Z') },
      {
        where: {
          followerId: second.user.id,
          followingId: target.user.id,
        },
      },
    )
    await Follow.update(
      { createdAt: new Date('2026-01-03T00:00:00.000Z') },
      {
        where: {
          followerId: third.user.id,
          followingId: target.user.id,
        },
      },
    )

    const pageOne = await listFollowers(
      harness.client(),
      target.user.id,
      '?page=1&limit=2',
    )
    assert.equal(pageOne.status, 200)
    assertNoStore(pageOne)
    assert.deepEqual(
      pageOne.body.data.followers.map((entry) => entry.user.id),
      [third.user.id, second.user.id],
    )
    assert.equal(
      pageOne.body.data.followers[0].followedAt,
      '2026-01-03T00:00:00.000Z',
    )
    assertPublicFollow(pageOne.body.data.followers[0], third.user.id)
    assert.deepEqual(pageOne.body.data.pagination, {
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
      hasNextPage: true,
      hasPreviousPage: false,
    })

    const pageTwo = await listFollowers(
      harness.client(),
      target.user.id,
      '?page=2&limit=2',
    )
    assert.equal(pageTwo.status, 200)
    assert.deepEqual(
      pageTwo.body.data.followers.map((entry) => entry.user.id),
      [first.user.id],
    )
    assert.deepEqual(pageTwo.body.data.pagination, {
      page: 2,
      limit: 2,
      total: 3,
      totalPages: 2,
      hasNextPage: false,
      hasPreviousPage: true,
    })

    await second.user.update({ status: 'suspended' })

    const hiddenFollower = await listFollowers(
      harness.client(),
      target.user.id,
    )
    assert.equal(hiddenFollower.status, 200)
    assert.deepEqual(
      hiddenFollower.body.data.followers.map(
        (entry) => entry.user.id,
      ),
      [third.user.id, first.user.id],
    )
    assert.equal(hiddenFollower.body.data.pagination.total, 2)
  } finally {
    await harness.close()
  }
})

test('following listings are public, paginated and deterministically newest first', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const actor = await createVerifiedClient(harness)
    const first = await createVerifiedClient(harness)
    const second = await createVerifiedClient(harness)
    const third = await createVerifiedClient(harness)

    for (const target of [first, second, third]) {
      assert.equal(
        (await follow(actor.client, target.user.id)).status,
        201,
      )
    }

    await Follow.update(
      { createdAt: new Date('2026-02-01T00:00:00.000Z') },
      {
        where: {
          followerId: actor.user.id,
          followingId: first.user.id,
        },
      },
    )
    await Follow.update(
      { createdAt: new Date('2026-02-02T00:00:00.000Z') },
      {
        where: {
          followerId: actor.user.id,
          followingId: second.user.id,
        },
      },
    )
    await Follow.update(
      { createdAt: new Date('2026-02-03T00:00:00.000Z') },
      {
        where: {
          followerId: actor.user.id,
          followingId: third.user.id,
        },
      },
    )

    const pageOne = await listFollowing(
      harness.client(),
      actor.user.id,
      '?page=1&limit=2',
    )
    assert.equal(pageOne.status, 200)
    assertNoStore(pageOne)
    assert.deepEqual(
      pageOne.body.data.following.map((entry) => entry.user.id),
      [third.user.id, second.user.id],
    )
    assert.equal(
      pageOne.body.data.following[0].followedAt,
      '2026-02-03T00:00:00.000Z',
    )
    assertPublicFollow(pageOne.body.data.following[0], third.user.id)
    assert.deepEqual(pageOne.body.data.pagination, {
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
      hasNextPage: true,
      hasPreviousPage: false,
    })

    const pageTwo = await listFollowing(
      harness.client(),
      actor.user.id,
      '?page=2&limit=2',
    )
    assert.equal(pageTwo.status, 200)
    assert.deepEqual(
      pageTwo.body.data.following.map((entry) => entry.user.id),
      [first.user.id],
    )

    await second.user.update({ status: 'suspended' })

    const hiddenFollowed = await listFollowing(
      harness.client(),
      actor.user.id,
    )
    assert.equal(hiddenFollowed.status, 200)
    assert.deepEqual(
      hiddenFollowed.body.data.following.map(
        (entry) => entry.user.id,
      ),
      [third.user.id, first.user.id],
    )
    assert.equal(hiddenFollowed.body.data.pagination.total, 2)
  } finally {
    await harness.close()
  }
})

test('follow listings of a suspended profile return PROFILE_NOT_FOUND', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const actor = await createVerifiedClient(harness)
    const profile = await createVerifiedClient(harness)

    await profile.user.update({ status: 'suspended' })

    const followers = await listFollowers(
      harness.client(),
      profile.user.id,
    )
    assert.equal(followers.status, 404)
    assert.equal(followers.body.error.code, 'PROFILE_NOT_FOUND')
    assertNoStore(followers)

    const following = await listFollowing(
      harness.client(),
      profile.user.id,
    )
    assert.equal(following.status, 404)
    assert.equal(following.body.error.code, 'PROFILE_NOT_FOUND')

    const ownFollow = await follow(actor.client, profile.user.id)
    assert.equal(ownFollow.status, 404)
    assert.equal(ownFollow.body.error.code, 'PROFILE_NOT_FOUND')
  } finally {
    await harness.close()
  }
})
