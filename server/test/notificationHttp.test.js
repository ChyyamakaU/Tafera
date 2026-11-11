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
const NotificationModel = require('../src/models/notification')
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
const {
  createNotificationsRouter,
} = require('../src/routes/notifications')
const {
  createNotificationService,
} = require('../src/services/notificationService')
const {
  PUBLIC_NOTIFICATION_FIELDS,
} = require('../src/utils/safeNotification')
const { PUBLIC_PROFILE_FIELDS } = require('../src/utils/safeUser')
const errorHandler = require('../src/middlewares/errorHandler')

const TEST_SECRET = 'test-only-session-secret-0123456789abcdef'
const SESSION_COOKIE = 'tafera.sid'
const PASSWORD = 'a sufficiently long passphrase'

let base = null
let scoped = null
let User = null
let Notification = null
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

    schema = `tafera_notifications_${process.pid}_${Date.now()}`
    await base.query(`CREATE SCHEMA "${schema}"`)
    await base.query(
      `CREATE TYPE "${schema}".enum_users_role AS ENUM ('user', 'admin')`,
    )
    await base.query(
      `CREATE TYPE "${schema}".enum_users_status AS ENUM ('active', 'suspended')`,
    )
    await base.query(
      `CREATE TYPE "${schema}".enum_notifications_type AS ENUM (
         'new_follower',
         'post_like',
         'post_comment',
         'trip_join_request',
         'trip_join_approved',
         'trip_join_rejected'
       )`,
    )
    await base.query(
      `CREATE TYPE "${schema}".enum_notifications_reference_type AS ENUM (
         'user',
         'post',
         'comment',
         'trip'
       )`,
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
      `CREATE TABLE "${schema}".notifications (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         user_id uuid NOT NULL REFERENCES "${schema}".users(id)
           ON DELETE CASCADE ON UPDATE CASCADE,
         actor_id uuid REFERENCES "${schema}".users(id)
           ON DELETE SET NULL ON UPDATE CASCADE,
         type "${schema}".enum_notifications_type NOT NULL,
         message text NOT NULL,
         reference_type "${schema}".enum_notifications_reference_type,
         reference_id uuid,
         is_read boolean NOT NULL DEFAULT false,
         read_at timestamptz,
         created_at timestamptz NOT NULL DEFAULT now(),
         updated_at timestamptz NOT NULL DEFAULT now(),
         CONSTRAINT notifications_reference_pair_check CHECK (
           ("reference_type" IS NULL AND "reference_id" IS NULL)
           OR ("reference_type" IS NOT NULL AND "reference_id" IS NOT NULL)
         )
       )`,
    )
    await base.query(
      `CREATE INDEX notifications_user_id_idx
       ON "${schema}".notifications (user_id)`,
    )
    await base.query(
      `CREATE INDEX notifications_user_id_is_read_created_at_idx
       ON "${schema}".notifications (user_id, is_read, created_at)`,
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
    Notification = NotificationModel(scoped, DataTypes)

    Notification.belongsTo(User, {
      foreignKey: 'userId',
      as: 'recipient',
    })
    Notification.belongsTo(User, {
      foreignKey: 'actorId',
      as: 'actor',
    })
    User.hasMany(Notification, {
      foreignKey: 'userId',
      as: 'notifications',
    })
    User.hasMany(Notification, {
      foreignKey: 'actorId',
      as: 'triggeredNotifications',
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
      `TRUNCATE TABLE "${schema}".notifications,
         "${schema}".users CASCADE`,
    )
  }
})

const skip = (t) => {
  if (!databaseAvailable) {
    t.skip(
      'PostgreSQL is unavailable; notification integration test skipped',
    )
    return true
  }
  if (!redisAvailable) {
    t.skip(
      'Redis is unavailable; notification integration test skipped',
    )
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
  const namespace = `tafera-notification-test-${crypto.randomUUID()}`
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

  const notificationService = createNotificationService({
    Notification,
    User,
  })
  app.use(
    '/api/notifications',
    createNotificationsRouter({
      notificationService,
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

const createAuthenticatedClient = async (harness, overrides = {}) => {
  const user = await createUser(overrides)
  const client = harness.client()
  const login = await loginUser(client, user.email)

  assert.equal(login.status, 200)

  return { user, client }
}

const createNotification = async ({
  userId,
  actorId = null,
  type = 'new_follower',
  message = 'Notification message.',
  referenceType = null,
  referenceId = null,
  isRead = false,
  readAt = null,
} = {}) =>
  Notification.create({
    userId,
    actorId,
    type,
    message,
    referenceType,
    referenceId,
    isRead,
    readAt,
  })

const setCreatedAt = async (notification, createdAt) => {
  await base.query(
    `UPDATE "${schema}".notifications
     SET created_at = :createdAt
     WHERE id = :id`,
    {
      replacements: {
        createdAt: new Date(createdAt),
        id: notification.id,
      },
    },
  )

  await notification.reload()

  return notification
}

const assertNoStore = (response) => {
  assert.match(
    String(response.headers['cache-control'] || ''),
    /no-store/,
  )
}

const PUBLIC_ACTOR_KEYS = [...PUBLIC_PROFILE_FIELDS].sort()

const assertPublicActor = (actor) => {
  assert.deepEqual(Object.keys(actor).sort(), PUBLIC_ACTOR_KEYS)
  assert.equal(actor.email, undefined)
  assert.equal(actor.role, undefined)
  assert.equal(actor.status, undefined)
  assert.equal(actor.authVersion, undefined)
  assert.equal(actor.emailVerifiedAt, undefined)
  assert.equal(actor.passwordHash, undefined)
}

const assertNotificationShape = (notification) => {
  assert.deepEqual(
    Object.keys(notification).sort(),
    [...PUBLIC_NOTIFICATION_FIELDS, 'actor'].sort(),
  )
  assert.equal(notification.userId, undefined)
  assert.equal(notification.actorId, undefined)
  assert.equal(notification.updatedAt, undefined)
  assert.equal(notification.recipient, undefined)
}

test('notification reads and writes require authentication', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const client = harness.client()

    for (const path of [
      '/api/notifications',
      '/api/notifications/unread-count',
    ]) {
      const response = await client.get(path)

      assert.equal(response.status, 401)
      assert.equal(response.body.error.code, 'AUTH_REQUIRED')
      assertNoStore(response)
    }

    const markOne = await client.patch(
      `/api/notifications/${crypto.randomUUID()}/read`,
    )
    assert.equal(markOne.status, 401)
    assert.equal(markOne.body.error.code, 'AUTH_REQUIRED')
    assertNoStore(markOne)

    const markAll = await client.patch('/api/notifications/read-all')
    assert.equal(markAll.status, 401)
    assert.equal(markAll.body.error.code, 'AUTH_REQUIRED')
    assertNoStore(markAll)
  } finally {
    await harness.close()
  }
})

test('notification list is paginated, ordered and scoped to the caller', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const actor = await createUser({
      fullName: 'Actor Person',
      bio: 'Travel writer',
    })
    const { user, client } = await createAuthenticatedClient(harness)
    const other = await createUser()

    const oldest = await createNotification({
      userId: user.id,
      actorId: actor.id,
      message: 'Oldest notification.',
    })
    const middle = await createNotification({
      userId: user.id,
      actorId: actor.id,
      message: 'Middle notification.',
    })
    const newest = await createNotification({
      userId: user.id,
      actorId: actor.id,
      message: 'Newest notification.',
    })
    await setCreatedAt(oldest, '2026-01-01T00:00:00.000Z')
    await setCreatedAt(middle, '2026-01-02T00:00:00.000Z')
    await setCreatedAt(newest, '2026-01-03T00:00:00.000Z')

    await createNotification({
      userId: other.id,
      actorId: actor.id,
      message: 'Not the caller notification.',
    })

    const response = await client.get(
      `/api/notifications?page=1&limit=2&userId=${other.id}`,
    )

    assert.equal(response.status, 200)
    assertNoStore(response)
    assert.deepEqual(response.body.data.pagination, {
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
      hasNextPage: true,
      hasPreviousPage: false,
    })
    assert.deepEqual(
      response.body.data.notifications.map(
        (notification) => notification.id,
      ),
      [newest.id, middle.id],
    )

    for (const notification of response.body.data.notifications) {
      assertNotificationShape(notification)
      assertPublicActor(notification.actor)
      assert.equal(notification.actor.id, actor.id)
    }

    const secondPage = await client.get(
      '/api/notifications?page=2&limit=2',
    )

    assert.equal(secondPage.status, 200)
    assertNoStore(secondPage)
    assert.deepEqual(
      secondPage.body.data.notifications.map(
        (notification) => notification.id,
      ),
      [oldest.id],
    )
    assert.deepEqual(secondPage.body.data.pagination, {
      page: 2,
      limit: 2,
      total: 3,
      totalPages: 2,
      hasNextPage: false,
      hasPreviousPage: true,
    })
  } finally {
    await harness.close()
  }
})

test('unreadOnly parses true and false query-string values', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { user, client } = await createAuthenticatedClient(harness)
    const unread = await createNotification({
      userId: user.id,
      message: 'Unread notification.',
    })
    const read = await createNotification({
      userId: user.id,
      message: 'Read notification.',
      isRead: true,
      readAt: new Date('2026-01-01T00:00:00.000Z'),
    })

    const unreadOnly = await client.get(
      '/api/notifications?unreadOnly=true',
    )

    assert.equal(unreadOnly.status, 200)
    assertNoStore(unreadOnly)
    assert.deepEqual(
      unreadOnly.body.data.notifications.map(
        (notification) => notification.id,
      ),
      [unread.id],
    )

    const all = await client.get('/api/notifications?unreadOnly=false')

    assert.equal(all.status, 200)
    assertNoStore(all)
    assert.deepEqual(
      all.body.data.notifications.map(
        (notification) => notification.id,
      ).sort(),
      [unread.id, read.id].sort(),
    )
  } finally {
    await harness.close()
  }
})

test('unread count is scoped to the authenticated user', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { user, client } = await createAuthenticatedClient(harness)
    const other = await createUser()

    await createNotification({ userId: user.id })
    await createNotification({
      userId: user.id,
      isRead: true,
      readAt: new Date('2026-01-01T00:00:00.000Z'),
    })
    await createNotification({ userId: other.id })

    const response = await client.get(
      '/api/notifications/unread-count',
    )

    assert.equal(response.status, 200)
    assertNoStore(response)
    assert.deepEqual(response.body, { data: { unreadCount: 1 } })
  } finally {
    await harness.close()
  }
})

test('mark-one updates read state and preserves the original readAt', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { user, client } = await createAuthenticatedClient(harness)
    const notification = await createNotification({
      userId: user.id,
      message: 'Mark me as read.',
    })

    const response = await client.patch(
      `/api/notifications/${notification.id}/read`,
    )

    assert.equal(response.status, 200)
    assertNoStore(response)
    assert.equal(response.body.data.notification.id, notification.id)
    assert.equal(response.body.data.notification.isRead, true)
    assert.ok(response.body.data.notification.readAt)
    assertNotificationShape(response.body.data.notification)

    const stored = await Notification.findByPk(notification.id)
    assert.equal(stored.isRead, true)
    assert.ok(stored.readAt)

    const firstReadAt = response.body.data.notification.readAt
    const repeated = await client.patch(
      `/api/notifications/${notification.id}/read`,
    )

    assert.equal(repeated.status, 200)
    assertNoStore(repeated)
    assert.equal(
      repeated.body.data.notification.readAt,
      firstReadAt,
    )
  } finally {
    await harness.close()
  }
})

test('mark-all updates only the authenticated user unread notifications', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { user, client } = await createAuthenticatedClient(harness)
    const other = await createUser()

    const first = await createNotification({ userId: user.id })
    const second = await createNotification({ userId: user.id })
    const alreadyRead = await createNotification({
      userId: user.id,
      isRead: true,
      readAt: new Date('2026-01-01T00:00:00.000Z'),
    })
    const otherFirst = await createNotification({ userId: other.id })
    const otherSecond = await createNotification({ userId: other.id })

    const response = await client.patch('/api/notifications/read-all')

    assert.equal(response.status, 200)
    assertNoStore(response)
    assert.deepEqual(response.body, { data: { updatedCount: 2 } })

    for (const id of [first.id, second.id, alreadyRead.id]) {
      const stored = await Notification.findByPk(id)
      assert.equal(stored.isRead, true)
      assert.ok(stored.readAt)
    }

    for (const id of [otherFirst.id, otherSecond.id]) {
      const stored = await Notification.findByPk(id)
      assert.equal(stored.isRead, false)
      assert.equal(stored.readAt, null)
    }
  } finally {
    await harness.close()
  }
})

test('both read PATCH routes enforce CSRF', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { user, client } = await createAuthenticatedClient(harness)
    const notification = await createNotification({ userId: user.id })

    client.clearCsrf()

    const markOne = await client.patch(
      `/api/notifications/${notification.id}/read`,
    )

    assert.equal(markOne.status, 403)
    assert.equal(markOne.body.error.code, 'CSRF_TOKEN_INVALID')
    assertNoStore(markOne)

    const markAll = await client.patch('/api/notifications/read-all')

    assert.equal(markAll.status, 403)
    assert.equal(markAll.body.error.code, 'CSRF_TOKEN_INVALID')
    assertNoStore(markAll)

    const stored = await Notification.findByPk(notification.id)
    assert.equal(stored.isRead, false)
    assert.equal(stored.readAt, null)
  } finally {
    await harness.close()
  }
})

test('foreign and missing notifications return the same not-found error', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { client } = await createAuthenticatedClient(harness)
    const other = await createUser()
    const foreignNotification = await createNotification({
      userId: other.id,
      message: 'Another user notification.',
    })

    const foreign = await client.patch(
      `/api/notifications/${foreignNotification.id}/read`,
    )
    const missing = await client.patch(
      `/api/notifications/${crypto.randomUUID()}/read`,
    )

    for (const response of [foreign, missing]) {
      assert.equal(response.status, 404)
      assert.equal(
        response.body.error.code,
        'NOTIFICATION_NOT_FOUND',
      )
      assert.equal(
        response.body.error.message,
        'Notification not found.',
      )
      assertNoStore(response)
    }

    const stored = await Notification.findByPk(foreignNotification.id)
    assert.equal(stored.isRead, false)
    assert.equal(stored.readAt, null)
  } finally {
    await harness.close()
  }
})

test('notification query and route validation returns safe 400 responses', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { client } = await createAuthenticatedClient(harness)

    for (const path of [
      '/api/notifications?page=0',
      '/api/notifications?limit=51',
      '/api/notifications?unreadOnly=yes',
    ]) {
      const response = await client.get(path)

      assert.equal(response.status, 400)
      assert.equal(response.body.error.code, 'VALIDATION_ERROR')
      assertNoStore(response)
    }

    const malformedId = await client.patch(
      '/api/notifications/not-a-uuid/read',
    )

    assert.equal(malformedId.status, 400)
    assert.equal(
      malformedId.body.error.code,
      'VALIDATION_ERROR',
    )
    assertNoStore(malformedId)

    const maximum = await client.get(
      '/api/notifications?page=1&limit=50',
    )

    assert.equal(maximum.status, 200)
    assertNoStore(maximum)
  } finally {
    await harness.close()
  }
})
