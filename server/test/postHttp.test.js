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
const DestinationModel = require('../src/models/destination')
const DestinationImageModel = require('../src/models/destinationImage')
const PostModel = require('../src/models/post')
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
const { createPostsRouter } = require('../src/routes/posts')
const { createUsersRouter } = require('../src/routes/users')
const { createPostService } = require('../src/services/postService')
const { PUBLIC_PROFILE_FIELDS } = require('../src/utils/safeUser')
const {
  PUBLIC_DESTINATION_FIELDS,
} = require('../src/utils/safeDestination')
const errorHandler = require('../src/middlewares/errorHandler')

const TEST_SECRET = 'test-only-session-secret-0123456789abcdef'
const SESSION_COOKIE = 'tafera.sid'
const PASSWORD = 'a sufficiently long passphrase'

let base = null
let scoped = null
let User = null
let Destination = null
let DestinationImage = null
let Post = null
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

    schema = `tafera_posts_${process.pid}_${Date.now()}`
    await base.query(`CREATE SCHEMA "${schema}"`)
    await base.query(
      `CREATE TYPE "${schema}".enum_users_role AS ENUM ('user', 'admin')`,
    )
    await base.query(
      `CREATE TYPE "${schema}".enum_users_status AS ENUM ('active', 'suspended')`,
    )
    await base.query(
      `CREATE TYPE "${schema}".enum_destinations_status AS ENUM ('draft', 'published')`,
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
      `CREATE TABLE "${schema}".destinations (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         name varchar(255) NOT NULL,
         slug varchar(255) NOT NULL,
         country varchar(255) NOT NULL,
         state varchar(255),
         description text NOT NULL,
         location varchar(255),
         latitude decimal(10,7),
         longitude decimal(10,7),
         featured boolean NOT NULL DEFAULT false,
         status "${schema}".enum_destinations_status NOT NULL DEFAULT 'draft',
         created_by uuid REFERENCES "${schema}".users(id)
           ON DELETE SET NULL ON UPDATE CASCADE,
         created_at timestamptz NOT NULL DEFAULT now(),
         updated_at timestamptz NOT NULL DEFAULT now()
       )`,
    )
    await base.query(
      `CREATE UNIQUE INDEX destinations_slug_unique
       ON "${schema}".destinations (slug)`,
    )
    await base.query(
      `CREATE TABLE "${schema}".destination_images (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         destination_id uuid NOT NULL REFERENCES "${schema}".destinations(id)
           ON DELETE CASCADE ON UPDATE CASCADE,
         image_url varchar(255) NOT NULL,
         public_id varchar(255) NOT NULL,
         alt_text varchar(255),
         display_order integer NOT NULL DEFAULT 0,
         is_cover boolean NOT NULL DEFAULT false,
         created_at timestamptz NOT NULL DEFAULT now(),
         updated_at timestamptz NOT NULL DEFAULT now()
       )`,
    )
    await base.query(
      `CREATE TABLE "${schema}".posts (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         user_id uuid NOT NULL REFERENCES "${schema}".users(id)
           ON DELETE CASCADE ON UPDATE CASCADE,
         destination_id uuid REFERENCES "${schema}".destinations(id)
           ON DELETE SET NULL ON UPDATE CASCADE,
         content text NOT NULL,
         created_at timestamptz NOT NULL DEFAULT now(),
         updated_at timestamptz NOT NULL DEFAULT now()
       )`,
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
    Destination = DestinationModel(scoped, DataTypes)
    DestinationImage = DestinationImageModel(scoped, DataTypes)
    Post = PostModel(scoped, DataTypes)
    Follow = FollowModel(scoped, DataTypes)

    Post.belongsTo(User, { foreignKey: 'userId', as: 'author' })
    Post.belongsTo(Destination, {
      foreignKey: 'destinationId',
      as: 'destination',
    })
    Follow.belongsTo(User, {
      foreignKey: 'followerId',
      as: 'follower',
    })
    Follow.belongsTo(User, {
      foreignKey: 'followingId',
      as: 'followingUser',
    })
    User.hasMany(Post, { foreignKey: 'userId', as: 'posts' })
    User.hasMany(Follow, {
      foreignKey: 'followerId',
      as: 'following',
    })
    User.hasMany(Follow, {
      foreignKey: 'followingId',
      as: 'followers',
    })
    Destination.hasMany(DestinationImage, {
      foreignKey: 'destinationId',
      as: 'images',
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
         "${schema}".posts,
         "${schema}".destination_images,
         "${schema}".destinations,
         "${schema}".users CASCADE`,
    )
  }
})

const skip = (t) => {
  if (!databaseAvailable) {
    t.skip('PostgreSQL is unavailable; post integration test skipped')
    return true
  }
  if (!redisAvailable) {
    t.skip('Redis is unavailable; post integration test skipped')
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
    get cookie() {
      return cookie
    },
    get csrfToken() {
      return csrfToken
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
  const namespace = `tafera-post-test-${crypto.randomUUID()}`
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

  const postService = createPostService({
    Post,
    User,
    Destination,
    DestinationImage,
    Follow,
  })

  app.use(
    '/api/posts',
    createPostsRouter({
      postService,
      sessions,
      nodeEnv,
      User,
    }),
  )
  app.use(
    '/api/users',
    createUsersRouter({
      postService,
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

const createDestination = async (overrides = {}) => {
  const id = overrides.id || crypto.randomUUID()

  return Destination.create({
    id,
    name: 'Kyoto',
    slug: `kyoto-${id.slice(0, 8)}`,
    country: 'Japan',
    state: 'Kyoto',
    description: 'Former imperial capital of Japan.',
    location: 'Kyoto, Japan',
    latitude: 35.0116,
    longitude: 135.7681,
    featured: false,
    status: 'published',
    ...overrides,
    id,
  })
}

const createPost = (client, overrides = {}) =>
  client.post('/api/posts', {
    content: 'Japan Spring 2027',
    ...overrides,
  })

const getPost = (client, postId) => client.get(`/api/posts/${postId}`)

const listPosts = (client, query = '') =>
  client.get(`/api/posts${query}`)

const listUserPosts = (client, userId, query = '') =>
  client.get(`/api/users/${userId}/posts${query}`)

const listFollowingPosts = (client, query = '') =>
  client.get(`/api/posts/following${query}`)

const createFollow = (followerId, followingId) =>
  Follow.create({ followerId, followingId })

const assertNoStore = (response) => {
  assert.match(
    String(response.headers['cache-control'] || ''),
    /no-store/,
  )
}

const assertPublicPost = (post, expectedAuthorId) => {
  assert.deepEqual(Object.keys(post).sort(), [
    'author',
    'content',
    'createdAt',
    'destination',
    'id',
    'updatedAt',
  ])
  assert.equal(post.userId, undefined)
  assert.equal(post.destinationId, undefined)
  assert.equal(post.author.id, expectedAuthorId)
  assert.deepEqual(
    Object.keys(post.author).sort(),
    [...PUBLIC_PROFILE_FIELDS].sort(),
  )
  assert.equal(post.author.email, undefined)
  assert.equal(post.author.role, undefined)
  assert.equal(post.author.status, undefined)
  assert.equal(post.author.emailVerifiedAt, undefined)
  assert.equal(post.author.passwordHash, undefined)
}

const publicPostKeys = [
  'author',
  'content',
  'createdAt',
  'destination',
  'id',
  'updatedAt',
]

test('verified users can create posts and protected fields are stripped', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { user, client } = await createVerifiedClient(harness)
    const other = await createUser()

    const response = await createPost(client, {
      content: '  Hello world  ',
      userId: other.id,
      id: 'attacker-id',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
      status: 'active',
    })

    assert.equal(response.status, 201)
    assertNoStore(response)
    assertPublicPost(response.body.data.post, user.id)
    assert.deepEqual(
      Object.keys(response.body.data.post).sort(),
      publicPostKeys,
    )
    assert.equal(response.body.data.post.content, 'Hello world')
    assert.notEqual(
      response.body.data.post.createdAt,
      '2020-01-01T00:00:00.000Z',
    )

    const stored = await Post.findByPk(response.body.data.post.id)
    assert.equal(stored.userId, user.id)
    assert.equal(stored.content, 'Hello world')
  } finally {
    await harness.close()
  }
})

test('post creation validates content and destination availability', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { client } = await createVerifiedClient(harness)
    const draft = await createDestination({ status: 'draft' })

    const empty = await createPost(client, { content: '   ' })
    assert.equal(empty.status, 400)
    assert.equal(empty.body.error.code, 'VALIDATION_ERROR')
    assertNoStore(empty)

    const overlong = await createPost(client, {
      content: 'a'.repeat(5001),
    })
    assert.equal(overlong.status, 400)
    assert.equal(overlong.body.error.code, 'VALIDATION_ERROR')

    const invalidId = await createPost(client, {
      destinationId: 'not-a-uuid',
    })
    assert.equal(invalidId.status, 400)
    assert.equal(invalidId.body.error.code, 'VALIDATION_ERROR')

    const missing = await createPost(client, {
      destinationId: crypto.randomUUID(),
    })
    assert.equal(missing.status, 404)
    assert.equal(missing.body.error.code, 'DESTINATION_NOT_FOUND')

    const unpublished = await createPost(client, {
      destinationId: draft.id,
    })
    assert.equal(unpublished.status, 404)
    assert.equal(
      unpublished.body.error.code,
      'DESTINATION_NOT_FOUND',
    )
  } finally {
    await harness.close()
  }
})

test('post writes require authentication and a verified email', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const anonymous = harness.client()
    const unauthorized = await createPost(anonymous)
    assert.equal(unauthorized.status, 401)
    assert.equal(unauthorized.body.error.code, 'AUTH_REQUIRED')

    const unverifiedUser = await createUser({
      emailVerifiedAt: null,
    })
    const unverified = harness.client()
    assert.equal(
      (await loginUser(unverified, unverifiedUser.email)).status,
      200,
    )
    const blocked = await createPost(unverified)
    assert.equal(blocked.status, 403)
    assert.equal(
      blocked.body.error.code,
      'EMAIL_VERIFICATION_REQUIRED',
    )

    const { client } = await createVerifiedClient(harness)
    client.clearCsrf()
    const missingCsrf = await createPost(client)
    assert.equal(missingCsrf.status, 403)
    assert.equal(missingCsrf.body.error.code, 'CSRF_TOKEN_INVALID')
  } finally {
    await harness.close()
  }
})

test('the public feed paginates newest first and hides suspended authors', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { user, client } = await createVerifiedClient(harness)
    const first = await createPost(client, { content: 'First' })
    const second = await createPost(client, { content: 'Second' })
    const third = await createPost(client, { content: 'Third' })

    await Post.update(
      { createdAt: new Date('2026-01-01T00:00:00.000Z') },
      { where: { id: first.body.data.post.id } },
    )
    await Post.update(
      { createdAt: new Date('2026-01-02T00:00:00.000Z') },
      { where: { id: second.body.data.post.id } },
    )
    await Post.update(
      { createdAt: new Date('2026-01-03T00:00:00.000Z') },
      { where: { id: third.body.data.post.id } },
    )

    const pageOne = await listPosts(harness.client(), '?page=1&limit=2')
    assert.equal(pageOne.status, 200)
    assertNoStore(pageOne)
    assert.deepEqual(
      pageOne.body.data.posts.map((post) => post.content),
      ['Third', 'Second'],
    )
    assert.deepEqual(pageOne.body.data.pagination, {
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
      hasNextPage: true,
      hasPreviousPage: false,
    })

    const pageTwo = await listPosts(harness.client(), '?page=2&limit=2')
    assert.equal(pageTwo.status, 200)
    assert.deepEqual(
      pageTwo.body.data.posts.map((post) => post.content),
      ['First'],
    )
    assert.deepEqual(pageTwo.body.data.pagination, {
      page: 2,
      limit: 2,
      total: 3,
      totalPages: 2,
      hasNextPage: false,
      hasPreviousPage: true,
    })

    await user.update({ status: 'suspended' })

    const hiddenFeed = await listPosts(harness.client())
    assert.equal(hiddenFeed.status, 200)
    assert.deepEqual(hiddenFeed.body.data.posts, [])
    assert.equal(hiddenFeed.body.data.pagination.total, 0)

    const hiddenDetail = await getPost(
      harness.client(),
      first.body.data.post.id,
    )
    assert.equal(hiddenDetail.status, 404)
    assert.equal(hiddenDetail.body.error.code, 'POST_NOT_FOUND')
  } finally {
    await harness.close()
  }
})

test('public post detail is available and missing posts return 404', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { user, client } = await createVerifiedClient(harness)
    const created = await createPost(client, {
      content: 'Visible post',
    })

    const detail = await getPost(
      harness.client(),
      created.body.data.post.id,
    )
    assert.equal(detail.status, 200)
    assertNoStore(detail)
    assertPublicPost(detail.body.data.post, user.id)

    const missing = await getPost(harness.client(), crypto.randomUUID())
    assert.equal(missing.status, 404)
    assert.equal(missing.body.error.code, 'POST_NOT_FOUND')
    assertNoStore(missing)
  } finally {
    await harness.close()
  }
})

test('only the author can update or delete a post', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const owner = await createVerifiedClient(harness)
    const other = await createVerifiedClient(harness)
    const destination = await createDestination()
    const created = await createPost(owner.client, {
      content: 'Original',
    })
    const postId = created.body.data.post.id

    const forbiddenUpdate = await other.client.patch(`/api/posts/${postId}`, {
      content: 'Hacked',
    })
    assert.equal(forbiddenUpdate.status, 403)
    assert.equal(
      forbiddenUpdate.body.error.code,
      'POST_ACCESS_DENIED',
    )

    const forbiddenDelete = await other.client.delete(`/api/posts/${postId}`)
    assert.equal(forbiddenDelete.status, 403)
    assert.equal(
      forbiddenDelete.body.error.code,
      'POST_ACCESS_DENIED',
    )

    const updated = await owner.client.patch(`/api/posts/${postId}`, {
      content: 'Updated',
      destinationId: destination.id,
    })
    assert.equal(updated.status, 200)
    assertNoStore(updated)
    assert.equal(updated.body.data.post.content, 'Updated')
    assert.equal(
      updated.body.data.post.destination.id,
      destination.id,
    )
    assert.equal(updated.body.data.post.destination.status, undefined)
    assert.equal(updated.body.data.post.userId, undefined)

    const cleared = await owner.client.patch(`/api/posts/${postId}`, {
      destinationId: null,
    })
    assert.equal(cleared.status, 200)
    assert.equal(cleared.body.data.post.destination, null)

    const deleted = await owner.client.delete(`/api/posts/${postId}`)
    assert.equal(deleted.status, 204)
    assertNoStore(deleted)
    assert.equal(deleted.body, null)

    const afterDelete = await getPost(harness.client(), postId)
    assert.equal(afterDelete.status, 404)
    assert.equal(afterDelete.body.error.code, 'POST_NOT_FOUND')
  } finally {
    await harness.close()
  }
})

test('user post listings are public, scoped and reject missing or suspended users', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const owner = await createVerifiedClient(harness)
    const other = await createVerifiedClient(harness)

    const ownerPost = await createPost(owner.client, {
      content: 'Owner post',
    })
    await createPost(other.client, { content: 'Other post' })

    const listing = await listUserPosts(harness.client(), owner.user.id)
    assert.equal(listing.status, 200)
    assertNoStore(listing)
    assert.deepEqual(
      listing.body.data.posts.map((post) => post.content),
      ['Owner post'],
    )
    assert.equal(listing.body.data.pagination.total, 1)
    assertPublicPost(listing.body.data.posts[0], owner.user.id)
    assert.equal(
      listing.body.data.posts[0].id,
      ownerPost.body.data.post.id,
    )

    const missing = await listUserPosts(
      harness.client(),
      crypto.randomUUID(),
    )
    assert.equal(missing.status, 404)
    assert.equal(missing.body.error.code, 'PROFILE_NOT_FOUND')

    await other.user.update({ status: 'suspended' })
    const suspended = await listUserPosts(
      harness.client(),
      other.user.id,
    )
    assert.equal(suspended.status, 404)
    assert.equal(suspended.body.error.code, 'PROFILE_NOT_FOUND')
  } finally {
    await harness.close()
  }
})

test('the following feed returns only followed authors with safe post data', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const viewer = await createVerifiedClient(harness)
    const alice = await createVerifiedClient(harness)
    const bob = await createVerifiedClient(harness)
    const stranger = await createVerifiedClient(harness)

    await createFollow(viewer.user.id, alice.user.id)
    await createFollow(viewer.user.id, bob.user.id)

    const destination = await createDestination()
    const aliceFirst = await createPost(alice.client, {
      content: 'Alice first',
      destinationId: destination.id,
    })
    const bobPost = await createPost(bob.client, {
      content: 'Bob post',
    })
    const aliceSecond = await createPost(alice.client, {
      content: 'Alice second',
    })
    await createPost(stranger.client, {
      content: 'Stranger post',
    })
    await createPost(viewer.client, {
      content: 'Viewer post',
    })

    await Post.update(
      { createdAt: new Date('2026-03-01T00:00:00.000Z') },
      { where: { id: aliceFirst.body.data.post.id } },
    )
    await Post.update(
      { createdAt: new Date('2026-03-02T00:00:00.000Z') },
      { where: { id: bobPost.body.data.post.id } },
    )
    await Post.update(
      { createdAt: new Date('2026-03-03T00:00:00.000Z') },
      { where: { id: aliceSecond.body.data.post.id } },
    )

    const feed = await listFollowingPosts(viewer.client)
    assert.equal(feed.status, 200)
    assertNoStore(feed)
    assert.deepEqual(
      feed.body.data.posts.map((post) => post.content),
      ['Alice second', 'Bob post', 'Alice first'],
    )
    assert.deepEqual(feed.body.data.pagination, {
      page: 1,
      limit: 20,
      total: 3,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    })

    assertPublicPost(feed.body.data.posts[0], alice.user.id)
    assertPublicPost(feed.body.data.posts[1], bob.user.id)
    assertPublicPost(feed.body.data.posts[2], alice.user.id)

    const destinationPost = feed.body.data.posts[2]
    assert.equal(destinationPost.destination.id, destination.id)
    assert.deepEqual(
      Object.keys(destinationPost.destination).sort(),
      [...PUBLIC_DESTINATION_FIELDS, 'coverImage'].sort(),
    )
    assert.equal(destinationPost.destination.status, undefined)
    assert.equal(destinationPost.destination.createdBy, undefined)

    // Existing public feed and detail behavior remains unchanged.
    const publicFeed = await listPosts(harness.client())
    assert.equal(publicFeed.status, 200)
    assert.equal(publicFeed.body.data.pagination.total, 5)
    assert.equal(
      publicFeed.body.data.posts.some(
        (post) => post.content === 'Stranger post',
      ),
      true,
    )

    const detail = await getPost(
      harness.client(),
      aliceFirst.body.data.post.id,
    )
    assert.equal(detail.status, 200)
    assertPublicPost(detail.body.data.post, alice.user.id)
  } finally {
    await harness.close()
  }
})

test('the following feed requires authentication but not CSRF', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const anonymous = await listFollowingPosts(harness.client())
    assert.equal(anonymous.status, 401)
    assert.equal(anonymous.body.error.code, 'AUTH_REQUIRED')
    assertNoStore(anonymous)

    const viewer = await createVerifiedClient(harness)
    viewer.client.clearCsrf()

    const feed = await listFollowingPosts(viewer.client)
    assert.equal(feed.status, 200)
    assertNoStore(feed)
    assert.deepEqual(feed.body.data.posts, [])
    assert.deepEqual(feed.body.data.pagination, {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    })
  } finally {
    await harness.close()
  }
})

test('the following feed excludes suspended followed accounts and their posts', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const viewer = await createVerifiedClient(harness)
    const alice = await createVerifiedClient(harness)
    const bob = await createVerifiedClient(harness)

    await createFollow(viewer.user.id, alice.user.id)
    await createFollow(viewer.user.id, bob.user.id)

    await createPost(alice.client, { content: 'Alice post' })
    await createPost(bob.client, { content: 'Bob post' })

    await alice.user.update({ status: 'suspended' })

    const visible = await listFollowingPosts(viewer.client)
    assert.equal(visible.status, 200)
    assertNoStore(visible)
    assert.deepEqual(
      visible.body.data.posts.map((post) => post.content),
      ['Bob post'],
    )
    assert.equal(visible.body.data.pagination.total, 1)
    assert.equal(await Follow.count(), 2)

    await bob.user.update({ status: 'suspended' })

    const empty = await listFollowingPosts(viewer.client)
    assert.equal(empty.status, 200)
    assert.deepEqual(empty.body.data.posts, [])
    assert.equal(empty.body.data.pagination.total, 0)
  } finally {
    await harness.close()
  }
})

test('the following feed paginates deterministically and enforces the limit maximum', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const viewer = await createVerifiedClient(harness)
    const author = await createVerifiedClient(harness)

    await createFollow(viewer.user.id, author.user.id)

    const first = await createPost(author.client, {
      content: 'First',
    })
    const second = await createPost(author.client, {
      content: 'Second',
    })
    const third = await createPost(author.client, {
      content: 'Third',
    })

    await Post.update(
      { createdAt: new Date('2026-04-01T00:00:00.000Z') },
      { where: { id: first.body.data.post.id } },
    )
    await Post.update(
      { createdAt: new Date('2026-04-02T00:00:00.000Z') },
      { where: { id: second.body.data.post.id } },
    )
    await Post.update(
      { createdAt: new Date('2026-04-03T00:00:00.000Z') },
      { where: { id: third.body.data.post.id } },
    )

    const defaults = await listFollowingPosts(viewer.client)
    assert.equal(defaults.status, 200)
    assert.equal(defaults.body.data.pagination.limit, 20)
    assert.deepEqual(
      defaults.body.data.posts.map((post) => post.content),
      ['Third', 'Second', 'First'],
    )

    const pageOne = await listFollowingPosts(
      viewer.client,
      '?page=1&limit=2',
    )
    assert.equal(pageOne.status, 200)
    assert.deepEqual(
      pageOne.body.data.posts.map((post) => post.content),
      ['Third', 'Second'],
    )
    assert.deepEqual(pageOne.body.data.pagination, {
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
      hasNextPage: true,
      hasPreviousPage: false,
    })

    const pageTwo = await listFollowingPosts(
      viewer.client,
      '?page=2&limit=2',
    )
    assert.equal(pageTwo.status, 200)
    assert.deepEqual(
      pageTwo.body.data.posts.map((post) => post.content),
      ['First'],
    )
    assert.equal(pageTwo.body.data.pagination.hasPreviousPage, true)

    const maximum = await listFollowingPosts(
      viewer.client,
      '?limit=50',
    )
    assert.equal(maximum.status, 200)
    assert.equal(maximum.body.data.pagination.limit, 50)

    const tooLarge = await listFollowingPosts(
      viewer.client,
      '?limit=51',
    )
    assert.equal(tooLarge.status, 400)
    assert.equal(tooLarge.body.error.code, 'VALIDATION_ERROR')
    assertNoStore(tooLarge)
  } finally {
    await harness.close()
  }
})

test('the following feed returns an empty page when the viewer follows nobody', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const viewer = await createVerifiedClient(harness)
    await createPost(viewer.client, { content: 'Own post' })

    const feed = await listFollowingPosts(viewer.client)
    assert.equal(feed.status, 200)
    assertNoStore(feed)
    assert.deepEqual(feed.body.data.posts, [])
    assert.deepEqual(feed.body.data.pagination, {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    })
  } finally {
    await harness.close()
  }
})
