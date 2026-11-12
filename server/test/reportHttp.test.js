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
const PostModel = require('../src/models/post')
const CommentModel = require('../src/models/comment')
const TripModel = require('../src/models/trip')
const ReportModel = require('../src/models/report')
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
const { createReportsRouter } = require('../src/routes/reports')
const { createReportService } = require('../src/services/reportService')
const errorHandler = require('../src/middlewares/errorHandler')

const TEST_SECRET = 'test-only-session-secret-0123456789abcdef'
const SESSION_COOKIE = 'tafera.sid'
const PASSWORD = 'a sufficiently long passphrase'

let base = null
let scoped = null
let User = null
let Post = null
let Comment = null
let Trip = null
let Report = null
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

    schema = `tafera_report_http_${process.pid}_${Date.now()}`
    await base.query(`CREATE SCHEMA "${schema}"`)
    await base.query(
      `CREATE TYPE "${schema}".enum_users_role AS ENUM ('user', 'admin')`,
    )
    await base.query(
      `CREATE TYPE "${schema}".enum_users_status AS ENUM ('active', 'suspended')`,
    )
    await base.query(
      `CREATE TYPE "${schema}".enum_trips_trip_type AS ENUM ('personal', 'group')`,
    )
    await base.query(
      `CREATE TYPE "${schema}".enum_trips_status AS ENUM ('draft', 'published', 'cancelled', 'completed')`,
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
      `CREATE TABLE "${schema}".posts (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         user_id uuid NOT NULL REFERENCES "${schema}".users(id)
           ON DELETE CASCADE ON UPDATE CASCADE,
         destination_id uuid,
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
    await base.query(
      `CREATE TABLE "${schema}".trips (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         user_id uuid NOT NULL REFERENCES "${schema}".users(id)
           ON DELETE CASCADE ON UPDATE CASCADE,
         title varchar(255) NOT NULL,
         description text,
         trip_type "${schema}".enum_trips_trip_type NOT NULL DEFAULT 'personal',
         start_date date NOT NULL,
         end_date date NOT NULL,
         max_participants integer,
         status "${schema}".enum_trips_status NOT NULL DEFAULT 'draft',
         created_at timestamptz NOT NULL DEFAULT now(),
         updated_at timestamptz NOT NULL DEFAULT now(),
         CONSTRAINT trips_end_date_check CHECK (end_date >= start_date),
         CONSTRAINT trips_max_participants_check
           CHECK (max_participants IS NULL OR max_participants > 0)
       )`,
    )
    await base.query(
      `CREATE TYPE "${schema}".enum_reports_target_type AS ENUM (
         'user',
         'post',
         'comment',
         'trip'
       )`,
    )
    await base.query(
      `CREATE TYPE "${schema}".enum_reports_status AS ENUM (
         'pending',
         'under_review',
         'resolved',
         'dismissed'
       )`,
    )
    await base.query(
      `CREATE TYPE "${schema}".enum_reports_reason AS ENUM (
         'spam',
         'harassment',
         'inappropriate_content',
         'impersonation',
         'misinformation',
         'other'
       )`,
    )
    await base.query(
      `CREATE TABLE "${schema}".reports (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         reporter_id uuid NOT NULL REFERENCES "${schema}".users(id)
           ON DELETE SET NULL ON UPDATE CASCADE,
         target_type "${schema}".enum_reports_target_type NOT NULL,
         target_id uuid NOT NULL,
         reason "${schema}".enum_reports_reason NOT NULL,
         description text,
         status "${schema}".enum_reports_status NOT NULL DEFAULT 'pending',
         reviewed_by uuid REFERENCES "${schema}".users(id)
           ON DELETE SET NULL ON UPDATE CASCADE,
         reviewed_at timestamptz,
         resolution_note text,
         created_at timestamptz NOT NULL DEFAULT now(),
         updated_at timestamptz NOT NULL DEFAULT now()
       )`,
    )
    await base.query(
      `CREATE UNIQUE INDEX "reports_reporter_target_active_idx"
       ON "${schema}".reports ("reporter_id", "target_type", "target_id")
       WHERE "reporter_id" IS NOT NULL
         AND "status" IN ('pending', 'under_review')`,
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
    Post = PostModel(scoped, DataTypes)
    Comment = CommentModel(scoped, DataTypes)
    Trip = TripModel(scoped, DataTypes)
    Report = ReportModel(scoped, DataTypes)

    User.hasMany(Report, {
      foreignKey: 'reporterId',
      as: 'submittedReports',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })
    Report.belongsTo(User, {
      foreignKey: 'reporterId',
      as: 'reporter',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
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
      await redisClient.destroy()
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
      `TRUNCATE TABLE "${schema}".reports,
         "${schema}".trips,
         "${schema}".comments,
         "${schema}".posts,
         "${schema}".users CASCADE`,
    )
  }
})

const skip = (t) => {
  if (!databaseAvailable) {
    t.skip('PostgreSQL is unavailable; report integration test skipped')
    return true
  }
  if (!redisAvailable) {
    t.skip('Redis is unavailable; report integration test skipped')
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
  const namespace = `tafera-report-http-test-${crypto.randomUUID()}`
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

  const reportService = createReportService({
    Report,
    Post,
    Comment,
    Trip,
    User,
    sequelize: scoped,
  })

  app.use(
    '/api/reports',
    createReportsRouter({
      reportService,
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

const createPost = async (userId, overrides = {}) => {
  return await Post.create({
    userId,
    content: 'Test post content',
    ...overrides,
  })
}

const assertNoStore = (response) => {
  assert.match(
    String(response.headers['cache-control'] || ''),
    /no-store/,
  )
}

const assertReportShape = (report) => {
  assert.deepEqual(
    Object.keys(report).sort(),
    [
      'createdAt',
      'description',
      'id',
      'reason',
      'status',
      'targetId',
      'targetType',
      'updatedAt',
    ].sort(),
  )
  assert.equal(report.reporterId, undefined)
  assert.equal(report.reviewedBy, undefined)
  assert.equal(report.reviewedAt, undefined)
  assert.equal(report.resolutionNote, undefined)
}

const assertAdminReportShape = (report) => {
  assert.deepEqual(
    Object.keys(report).sort(),
    [
      'createdAt',
      'description',
      'id',
      'reason',
      'reporterId',
      'resolutionNote',
      'reviewedAt',
      'reviewedBy',
      'status',
      'targetId',
      'targetType',
      'updatedAt',
    ].sort(),
  )
}

test('report endpoints require authentication', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const client = harness.client()

    for (const [method, path] of [
      ['GET', '/api/reports'],
      ['GET', '/api/reports/mine'],
      ['GET', '/api/reports/00000000-0000-4000-8000-000000000000'],
      ['PATCH', '/api/reports/00000000-0000-4000-8000-000000000000'],
    ]) {
      const response = await request({
        port: harness.port,
        method,
        path,
      })

      assert.equal(response.status, 401, `${method} ${path}`)
      assert.equal(response.body.error.code, 'AUTH_REQUIRED')
      assertNoStore(response)
    }

    const postResponse = await request({
      port: harness.port,
      method: 'POST',
      path: '/api/reports',
      body: {},
    })

    assert.equal(postResponse.status, 401)
    assert.equal(postResponse.body.error.code, 'AUTH_REQUIRED')
    assertNoStore(postResponse)
  } finally {
    await harness.close()
  }
})

test('verified users can create reports', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { user: reporter, client: reporterClient } =
      await createVerifiedClient(harness)
    const targetUser = await createUser()
    const post = await createPost(targetUser.id)
    const postId = post.id

    const response = await reporterClient.post('/api/reports', {
      targetType: 'post',
      targetId: postId,
      reason: 'spam',
      description: 'This is spam.',
    })

    assert.equal(response.status, 201)
    assertNoStore(response)
    assertReportShape(response.body.data.report)
    assert.equal(response.body.data.report.targetType, 'post')
    assert.equal(response.body.data.report.targetId, postId)
    assert.equal(response.body.data.report.status, 'pending')
    assert.equal(response.body.data.report.reason, 'spam')
    assert.equal(response.body.data.report.description, 'This is spam.')
    assert.equal(response.body.data.report.reporterId, undefined)
    assert.equal(response.body.data.report.reviewedBy, undefined)
    assert.equal(response.body.data.report.reviewedAt, undefined)
    assert.equal(response.body.data.report.resolutionNote, undefined)
  } finally {
    await harness.close()
  }
})

test('report submission requires CSRF protection', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { user, client } = await createVerifiedClient(harness)
    const targetUser = await createUser()
    const post = await createPost(targetUser.id)
    const postId = post.id

    client.clearCsrf()

    const response = await client.post('/api/reports', {
      targetType: 'post',
      targetId: postId,
      reason: 'spam',
    })

    assert.equal(response.status, 403)
    assert.equal(response.body.error.code, 'CSRF_TOKEN_INVALID')
    assertNoStore(response)
  } finally {
    await harness.close()
  }
})

test('report submission requires a verified email', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser({ emailVerifiedAt: null })
    const targetUser = await createUser()
    const post = await createPost(targetUser.id)
    const postId = post.id

    const client = harness.client()
    const login = await loginUser(client, user.email)
    assert.equal(login.status, 200)

    const response = await client.post('/api/reports', {
      targetType: 'post',
      targetId: postId,
      reason: 'spam',
    })

    assert.equal(response.status, 403)
    assert.equal(response.body.error.code, 'EMAIL_VERIFICATION_REQUIRED')
    assertNoStore(response)
  } finally {
    await harness.close()
  }
})

test('ordinary users cannot access the admin moderation queue', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { user, client } = await createVerifiedClient(harness)

    const response = await client.get('/api/reports')

    assert.equal(response.status, 403)
    assert.equal(response.body.error.code, 'REPORT_ADMIN_REQUIRED')
    assertNoStore(response)
  } finally {
    await harness.close()
  }
})

test('ordinary users cannot update report status', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { user: reporter, client: reporterClient } =
      await createVerifiedClient(harness)
    const targetUser = await createUser()
    const post = await createPost(targetUser.id)
    const postId = post.id

    const created = await reporterClient.post('/api/reports', {
      targetType: 'post',
      targetId: postId,
      reason: 'spam',
    })
    assert.equal(created.status, 201)
    const reportId = created.body.data.report.id

    const response = await reporterClient.patch(`/api/reports/${reportId}`, {
      status: 'resolved',
    })

    assert.equal(response.status, 403)
    assert.equal(response.body.error.code, 'REPORT_ADMIN_REQUIRED')
    assertNoStore(response)
  } finally {
    await harness.close()
  }
})

test('admins can access the moderation queue', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { user: admin, client: adminClient } =
      await createVerifiedClient(harness, { role: 'admin' })

    const response = await adminClient.get('/api/reports')

    assert.equal(response.status, 200)
    assertNoStore(response)
    assert.equal(response.body.data.reports.length, 0)
    assert.equal(response.body.data.pagination.total, 0)
  } finally {
    await harness.close()
  }
})

test('admins can update report status', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { user: reporter, client: reporterClient } =
      await createVerifiedClient(harness)
    const { user: admin, client: adminClient } =
      await createVerifiedClient(harness, { role: 'admin' })
    const targetUser = await createUser()
    const post = await createPost(targetUser.id)
    const postId = post.id

    const created = await reporterClient.post('/api/reports', {
      targetType: 'post',
      targetId: postId,
      reason: 'spam',
    })
    assert.equal(created.status, 201)
    const reportId = created.body.data.report.id

    const response = await adminClient.patch(`/api/reports/${reportId}`, {
      status: 'resolved',
      resolutionNote: 'Verified as spam.',
    })

    assert.equal(response.status, 200)
    assertNoStore(response)
    assert.equal(response.body.data.report.status, 'resolved')
    assert.equal(response.body.data.report.reviewedBy, admin.id)
    assert.equal(response.body.data.report.resolutionNote, 'Verified as spam.')
    assert.ok(response.body.data.report.reviewedAt)
  } finally {
    await harness.close()
  }
})

test('reporters can retrieve their own reports but not another user report', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { user: reporterA, client: clientA } =
      await createVerifiedClient(harness)
    const { user: reporterB, client: clientB } =
      await createVerifiedClient(harness)
    const targetUser = await createUser()
    const post = await createPost(targetUser.id)
    const postId = post.id

    const created = await clientA.post('/api/reports', {
      targetType: 'post',
      targetId: postId,
      reason: 'spam',
    })
    assert.equal(created.status, 201)
    const reportId = created.body.data.report.id

    // Reporter A can retrieve their own report
    const own = await clientA.get(`/api/reports/${reportId}`)
    assert.equal(own.status, 200)
    assertNoStore(own)
    assert.equal(own.body.data.report.id, reportId)
    assert.equal(own.body.data.report.status, 'pending')

    // Reporter B cannot retrieve reporter A's report
    const other = await clientB.get(`/api/reports/${reportId}`)
    assert.equal(other.status, 404)
    assert.equal(other.body.error.code, 'REPORT_NOT_FOUND')
    assertNoStore(other)
  } finally {
    await harness.close()
  }
})

test('GET /api/reports/mine resolves correctly and is not treated as /:reportId', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { user, client } = await createVerifiedClient(harness)

    const response = await client.get('/api/reports/mine')

    assert.equal(response.status, 200)
    assertNoStore(response)
    assert.equal(response.body.data.reports.length, 0)
    assert.equal(response.body.data.pagination.total, 0)
  } finally {
    await harness.close()
  }
})

test('reporters can list their own reports with pagination', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { user: reporter, client: reporterClient } =
      await createVerifiedClient(harness)
    const targetUser = await createUser()
    const post1 = await createPost(targetUser.id)
    const post2 = await createPost(targetUser.id)

    await reporterClient.post('/api/reports', {
      targetType: 'post',
      targetId: post1.id,
      reason: 'spam',
    })
    await reporterClient.post('/api/reports', {
      targetType: 'post',
      targetId: post2.id,
      reason: 'harassment',
    })

    const response = await reporterClient.get('/api/reports/mine')

    assert.equal(response.status, 200)
    assertNoStore(response)
    assert.equal(response.body.data.reports.length, 2)
    assert.equal(response.body.data.pagination.total, 2)
    assert.equal(response.body.data.reports[0].status, 'pending')
    assert.equal(response.body.data.reports[1].status, 'pending')
  } finally {
    await harness.close()
  }
})

test('admin can list reports with status and targetType filters', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { user: admin, client: adminClient } =
      await createVerifiedClient(harness, { role: 'admin' })
    const { user: reporter, client: reporterClient } =
      await createVerifiedClient(harness)
    const targetUser = await createUser()
    const post = await createPost(targetUser.id)
    const postId = post.id

    await reporterClient.post('/api/reports', {
      targetType: 'post',
      targetId: postId,
      reason: 'spam',
    })

    const response = await adminClient.get(
      '/api/reports?status=pending&targetType=post',
    )

    assert.equal(response.status, 200)
    assertNoStore(response)
    assert.equal(response.body.data.reports.length, 1)
    assert.equal(response.body.data.reports[0].status, 'pending')
    assert.equal(response.body.data.reports[0].targetType, 'post')
  } finally {
    await harness.close()
  }
})
