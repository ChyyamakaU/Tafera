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
const CommentModel = require('../src/models/comment')
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
const { createPostService } = require('../src/services/postService')
const {
  createCommentService,
} = require('../src/services/commentService')
const { PUBLIC_PROFILE_FIELDS } = require('../src/utils/safeUser')
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
let Comment = null
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

    schema = `tafera_comments_${process.pid}_${Date.now()}`
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
      `CREATE TABLE "${schema}".comments (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         post_id uuid NOT NULL REFERENCES "${schema}".posts(id)
           ON DELETE CASCADE ON UPDATE CASCADE,
         user_id uuid NOT NULL REFERENCES "${schema}".users(id)
           ON DELETE CASCADE ON UPDATE CASCADE,
         content text NOT NULL,
         created_at timestamptz NOT NULL DEFAULT now(),
         updated_at timestamptz NOT NULL DEFAULT now()
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
    Comment = CommentModel(scoped, DataTypes)

    Post.belongsTo(User, { foreignKey: 'userId', as: 'author' })
    Post.belongsTo(Destination, {
      foreignKey: 'destinationId',
      as: 'destination',
    })
    Post.hasMany(Comment, { foreignKey: 'postId', as: 'comments' })
    Comment.belongsTo(Post, { foreignKey: 'postId', as: 'post' })
    Comment.belongsTo(User, { foreignKey: 'userId', as: 'author' })
    User.hasMany(Post, { foreignKey: 'userId', as: 'posts' })
    User.hasMany(Comment, { foreignKey: 'userId', as: 'comments' })
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
      `TRUNCATE TABLE "${schema}".comments,
         "${schema}".posts,
         "${schema}".destination_images,
         "${schema}".destinations,
         "${schema}".users CASCADE`,
    )
  }
})

const skip = (t) => {
  if (!databaseAvailable) {
    t.skip('PostgreSQL is unavailable; comment integration test skipped')
    return true
  }
  if (!redisAvailable) {
    t.skip('Redis is unavailable; comment integration test skipped')
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
  const namespace = `tafera-comment-test-${crypto.randomUUID()}`
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
  })
  const commentService = createCommentService({
    Comment,
    Post,
    User,
  })

  app.use(
    '/api/posts',
    createPostsRouter({
      postService,
      commentService,
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

const createPost = (client, overrides = {}) =>
  client.post('/api/posts', {
    content: 'Japan Spring 2027',
    ...overrides,
  })

const createComment = (client, postId, overrides = {}) =>
  client.post(`/api/posts/${postId}/comments`, {
    content: 'A comment',
    ...overrides,
  })

const listComments = (client, postId, query = '') =>
  client.get(`/api/posts/${postId}/comments${query}`)

const updateComment = (client, postId, commentId, body) =>
  client.patch(`/api/posts/${postId}/comments/${commentId}`, body)

const deleteComment = (client, postId, commentId) =>
  client.delete(`/api/posts/${postId}/comments/${commentId}`)

const assertNoStore = (response) => {
  assert.match(
    String(response.headers['cache-control'] || ''),
    /no-store/,
  )
}

const publicCommentKeys = [
  'author',
  'content',
  'createdAt',
  'id',
  'updatedAt',
]

const assertPublicComment = (comment, expectedAuthorId) => {
  assert.deepEqual(
    Object.keys(comment).sort(),
    publicCommentKeys,
  )
  assert.equal(comment.postId, undefined)
  assert.equal(comment.userId, undefined)
  assert.equal(comment.author.id, expectedAuthorId)
  assert.deepEqual(
    Object.keys(comment.author).sort(),
    [...PUBLIC_PROFILE_FIELDS].sort(),
  )
  assert.equal(comment.author.email, undefined)
  assert.equal(comment.author.role, undefined)
  assert.equal(comment.author.status, undefined)
  assert.equal(comment.author.emailVerifiedAt, undefined)
  assert.equal(comment.author.passwordHash, undefined)
}

test('verified users can create comments and protected fields are stripped', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { user, client } = await createVerifiedClient(harness)
    const other = await createUser()
    const post = await createPost(client, { content: 'A post' })
    const postId = post.body.data.post.id

    const response = await createComment(client, postId, {
      content: '  Hello commentary  ',
      userId: other.id,
      postId: crypto.randomUUID(),
      id: 'attacker-id',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
      status: 'active',
    })

    assert.equal(response.status, 201)
    assertNoStore(response)
    assertPublicComment(response.body.data.comment, user.id)
    assert.equal(
      response.body.data.comment.content,
      'Hello commentary',
    )
    assert.notEqual(
      response.body.data.comment.createdAt,
      '2020-01-01T00:00:00.000Z',
    )

    const stored = await Comment.findByPk(
      response.body.data.comment.id,
    )
    assert.equal(stored.postId, postId)
    assert.equal(stored.userId, user.id)
    assert.equal(stored.content, 'Hello commentary')
  } finally {
    await harness.close()
  }
})

test('comment creation validates content and the parent post', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const owner = await createVerifiedClient(harness)
    const commenter = await createVerifiedClient(harness)
    const client = owner.client
    const post = await createPost(client)
    const postId = post.body.data.post.id

    const empty = await createComment(client, postId, {
      content: '   ',
    })
    assert.equal(empty.status, 400)
    assert.equal(empty.body.error.code, 'VALIDATION_ERROR')
    assertNoStore(empty)

    const overlong = await createComment(client, postId, {
      content: 'a'.repeat(1001),
    })
    assert.equal(overlong.status, 400)
    assert.equal(overlong.body.error.code, 'VALIDATION_ERROR')
    assertNoStore(overlong)

    const maximum = await createComment(client, postId, {
      content: 'a'.repeat(1000),
    })
    assert.equal(maximum.status, 201)

    const missingPost = await createComment(
      client,
      crypto.randomUUID(),
      { content: 'Hello' },
    )
    assert.equal(missingPost.status, 404)
    assert.equal(missingPost.body.error.code, 'POST_NOT_FOUND')
    assertNoStore(missingPost)

    await User.update(
      { status: 'suspended' },
      { where: { id: post.body.data.post.author.id } },
    )

    const hiddenPost = await createComment(commenter.client, postId, {
      content: 'Hello',
    })
    assert.equal(hiddenPost.status, 404)
    assert.equal(hiddenPost.body.error.code, 'POST_NOT_FOUND')
  } finally {
    await harness.close()
  }
})

test('comment writes require authentication, CSRF and a verified email', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { client } = await createVerifiedClient(harness)
    const post = await createPost(client)
    const postId = post.body.data.post.id
    const comment = await createComment(client, postId)
    const commentId = comment.body.data.comment.id

    const anonymous = harness.client()
    const unauthorized = await createComment(anonymous, postId)
    assert.equal(unauthorized.status, 401)
    assert.equal(unauthorized.body.error.code, 'AUTH_REQUIRED')
    assertNoStore(unauthorized)

    const unverifiedUser = await createUser({ emailVerifiedAt: null })
    const unverified = harness.client()
    assert.equal(
      (await loginUser(unverified, unverifiedUser.email)).status,
      200,
    )
    const blocked = await createComment(unverified, postId)
    assert.equal(blocked.status, 403)
    assert.equal(
      blocked.body.error.code,
      'EMAIL_VERIFICATION_REQUIRED',
    )

    client.clearCsrf()
    const missingCsrf = await createComment(client, postId)
    assert.equal(missingCsrf.status, 403)
    assert.equal(missingCsrf.body.error.code, 'CSRF_TOKEN_INVALID')

    const csrfDelete = await deleteComment(client, postId, commentId)
    assert.equal(csrfDelete.status, 403)
    assert.equal(
      csrfDelete.body.error.code,
      'CSRF_TOKEN_INVALID',
    )
  } finally {
    await harness.close()
  }
})

test('comment listing is public, oldest first, paginated and hides suspended authors', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const owner = await createVerifiedClient(harness)
    const other = await createVerifiedClient(harness)
    const post = await createPost(owner.client)
    const postId = post.body.data.post.id

    const first = await createComment(owner.client, postId, {
      content: 'First',
    })
    const second = await createComment(other.client, postId, {
      content: 'Second',
    })
    const third = await createComment(owner.client, postId, {
      content: 'Third',
    })

    await Comment.update(
      { createdAt: new Date('2026-01-01T00:00:00.000Z') },
      { where: { id: first.body.data.comment.id } },
    )
    await Comment.update(
      { createdAt: new Date('2026-01-02T00:00:00.000Z') },
      { where: { id: second.body.data.comment.id } },
    )
    await Comment.update(
      { createdAt: new Date('2026-01-03T00:00:00.000Z') },
      { where: { id: third.body.data.comment.id } },
    )

    const pageOne = await listComments(
      harness.client(),
      postId,
      '?page=1&limit=2',
    )
    assert.equal(pageOne.status, 200)
    assertNoStore(pageOne)
    assert.deepEqual(
      pageOne.body.data.comments.map((comment) => comment.content),
      ['First', 'Second'],
    )
    assert.equal(
      pageOne.body.data.comments[0].author.id,
      owner.user.id,
    )
    assert.equal(
      pageOne.body.data.comments[1].author.id,
      other.user.id,
    )
    assertPublicComment(
      pageOne.body.data.comments[0],
      owner.user.id,
    )
    assert.deepEqual(pageOne.body.data.pagination, {
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
      hasNextPage: true,
      hasPreviousPage: false,
    })

    const pageTwo = await listComments(
      harness.client(),
      postId,
      '?page=2&limit=2',
    )
    assert.equal(pageTwo.status, 200)
    assert.deepEqual(
      pageTwo.body.data.comments.map((comment) => comment.content),
      ['Third'],
    )
    assert.deepEqual(pageTwo.body.data.pagination, {
      page: 2,
      limit: 2,
      total: 3,
      totalPages: 2,
      hasNextPage: false,
      hasPreviousPage: true,
    })

    await other.user.update({ status: 'suspended' })

    const hiddenAuthor = await listComments(harness.client(), postId)
    assert.equal(hiddenAuthor.status, 200)
    assert.deepEqual(
      hiddenAuthor.body.data.comments.map((comment) => comment.content),
      ['First', 'Third'],
    )
    assert.equal(hiddenAuthor.body.data.pagination.total, 2)

    await owner.user.update({ status: 'suspended' })

    const hiddenPost = await listComments(harness.client(), postId)
    assert.equal(hiddenPost.status, 404)
    assert.equal(hiddenPost.body.error.code, 'POST_NOT_FOUND')
    assertNoStore(hiddenPost)
  } finally {
    await harness.close()
  }
})

test('comment listing returns POST_NOT_FOUND for a missing post', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const response = await listComments(
      harness.client(),
      crypto.randomUUID(),
    )
    assert.equal(response.status, 404)
    assert.equal(response.body.error.code, 'POST_NOT_FOUND')
    assertNoStore(response)
  } finally {
    await harness.close()
  }
})

test('only the comment author can update or delete it', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const owner = await createVerifiedClient(harness)
    const other = await createVerifiedClient(harness)
    const post = await createPost(owner.client)
    const postId = post.body.data.post.id
    const created = await createComment(owner.client, postId, {
      content: 'Original',
    })
    const commentId = created.body.data.comment.id

    const forbiddenUpdate = await updateComment(
      other.client,
      postId,
      commentId,
      { content: 'Hacked' },
    )
    assert.equal(forbiddenUpdate.status, 403)
    assert.equal(
      forbiddenUpdate.body.error.code,
      'COMMENT_ACCESS_DENIED',
    )
    assertNoStore(forbiddenUpdate)

    const forbiddenDelete = await deleteComment(
      other.client,
      postId,
      commentId,
    )
    assert.equal(forbiddenDelete.status, 403)
    assert.equal(
      forbiddenDelete.body.error.code,
      'COMMENT_ACCESS_DENIED',
    )

    const updated = await updateComment(
      owner.client,
      postId,
      commentId,
      {
        content: '  Edited  ',
        userId: other.user.id,
        postId: crypto.randomUUID(),
      },
    )
    assert.equal(updated.status, 200)
    assertNoStore(updated)
    assertPublicComment(updated.body.data.comment, owner.user.id)
    assert.equal(updated.body.data.comment.content, 'Edited')

    const stored = await Comment.findByPk(commentId)
    assert.equal(stored.userId, owner.user.id)
    assert.equal(stored.postId, postId)

    const deleted = await deleteComment(
      owner.client,
      postId,
      commentId,
    )
    assert.equal(deleted.status, 204)
    assertNoStore(deleted)
    assert.equal(deleted.body, null)
    assert.equal(await Comment.findByPk(commentId), null)
  } finally {
    await harness.close()
  }
})

test('missing comments and comments from another post return COMMENT_NOT_FOUND', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { client } = await createVerifiedClient(harness)
    const firstPost = await createPost(client, {
      content: 'First post',
    })
    const secondPost = await createPost(client, {
      content: 'Second post',
    })
    const firstPostId = firstPost.body.data.post.id
    const secondPostId = secondPost.body.data.post.id

    const created = await createComment(client, firstPostId, {
      content: 'Belongs to the first post',
    })
    const commentId = created.body.data.comment.id

    const missing = await updateComment(
      client,
      firstPostId,
      crypto.randomUUID(),
      { content: 'Nope' },
    )
    assert.equal(missing.status, 404)
    assert.equal(missing.body.error.code, 'COMMENT_NOT_FOUND')

    const missingDelete = await deleteComment(
      client,
      firstPostId,
      crypto.randomUUID(),
    )
    assert.equal(missingDelete.status, 404)
    assert.equal(
      missingDelete.body.error.code,
      'COMMENT_NOT_FOUND',
    )

    const crossPostUpdate = await updateComment(
      client,
      secondPostId,
      commentId,
      { content: 'Wrong post' },
    )
    assert.equal(crossPostUpdate.status, 404)
    assert.equal(
      crossPostUpdate.body.error.code,
      'COMMENT_NOT_FOUND',
    )
    assertNoStore(crossPostUpdate)

    const crossPostDelete = await deleteComment(
      client,
      secondPostId,
      commentId,
    )
    assert.equal(crossPostDelete.status, 404)
    assert.equal(
      crossPostDelete.body.error.code,
      'COMMENT_NOT_FOUND',
    )

    const unchanged = await Comment.findByPk(commentId)
    assert.equal(unchanged.content, 'Belongs to the first post')

    const hiddenParent = await updateComment(
      client,
      crypto.randomUUID(),
      commentId,
      { content: 'Wrong post' },
    )
    assert.equal(hiddenParent.status, 404)
    assert.equal(hiddenParent.body.error.code, 'POST_NOT_FOUND')
  } finally {
    await harness.close()
  }
})

test('deleting a post cascades its comments', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { client } = await createVerifiedClient(harness)
    const post = await createPost(client)
    const postId = post.body.data.post.id
    const comment = await createComment(client, postId)
    const commentId = comment.body.data.comment.id

    const deleted = await client.delete(`/api/posts/${postId}`)
    assert.equal(deleted.status, 204)
    assert.equal(await Comment.findByPk(commentId), null)
  } finally {
    await harness.close()
  }
})
