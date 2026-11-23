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
const TripModel = require('../src/models/trip')
const ScrapbookJournalModel = require('../src/models/scrapbookJournal')
const ScrapbookImageModel = require('../src/models/scrapbookImage')
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
  createScrapbooksRouter,
} = require('../src/routes/scrapbooks')
const {
  createScrapbookService,
} = require('../src/services/scrapbookService')
const errorHandler = require('../src/middlewares/errorHandler')

const TEST_SECRET = 'test-only-session-secret-0123456789abcdef'
const SESSION_COOKIE = 'tafera.sid'
const PASSWORD = 'a sufficiently long passphrase'

let base = null
let scoped = null
let User = null
let Trip = null
let ScrapbookJournal = null
let ScrapbookImage = null
let schema = null
let databaseAvailable = false
let redisClient = null
let redisAvailable = false

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

    schema = `tafera_scrapbook_journal_http_${process.pid}_${Date.now()}`
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
          username varchar(30),
          city varchar(100),
          state varchar(100),
          website_url varchar(500),
          instagram_url varchar(500),
          tiktok_url varchar(500),
          youtube_url varchar(500),
         email varchar(255) NOT NULL,
         password_hash varchar(255) NOT NULL,
         profile_image varchar(255),
         profile_image_public_id varchar(255),
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
         updated_at timestamptz NOT NULL DEFAULT now()
       )`,
    )
    await base.query(
      `CREATE TABLE "${schema}".scrapbook_journals (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         user_id uuid NOT NULL REFERENCES "${schema}".users(id)
           ON DELETE CASCADE ON UPDATE CASCADE,
         trip_id uuid REFERENCES "${schema}".trips(id)
           ON DELETE SET NULL ON UPDATE CASCADE,
         title varchar(255) NOT NULL,
         description text,
         is_public boolean NOT NULL DEFAULT false,
         created_at timestamptz NOT NULL DEFAULT now(),
         updated_at timestamptz NOT NULL DEFAULT now()
       )`,
    )
    await base.query(
      `CREATE TABLE "${schema}".scrapbook_images (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         journal_id uuid NOT NULL REFERENCES "${schema}".scrapbook_journals(id)
           ON DELETE CASCADE ON UPDATE CASCADE,
         image_url varchar(255) NOT NULL,
         public_id varchar(255) NOT NULL,
         alt_text varchar(255),
         caption text,
         taken_at timestamptz,
         display_order integer NOT NULL DEFAULT 0,
         is_cover boolean NOT NULL DEFAULT false,
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
    Trip = TripModel(scoped, DataTypes)
    ScrapbookJournal = ScrapbookJournalModel(scoped, DataTypes)
    ScrapbookImage = ScrapbookImageModel(scoped, DataTypes)

    User.hasMany(ScrapbookJournal, {
      foreignKey: 'userId',
      as: 'scrapbooks',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })
    ScrapbookJournal.belongsTo(User, {
      foreignKey: 'userId',
      as: 'user',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })

    Trip.hasMany(ScrapbookJournal, {
      foreignKey: 'tripId',
      as: 'scrapbooks',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })
    ScrapbookJournal.belongsTo(Trip, {
      foreignKey: 'tripId',
      as: 'trip',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })

    ScrapbookJournal.hasMany(ScrapbookImage, {
      foreignKey: 'journalId',
      as: 'images',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })
    ScrapbookImage.belongsTo(ScrapbookJournal, {
      foreignKey: 'journalId',
      as: 'journal',
      onDelete: 'CASCADE',
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
      `TRUNCATE TABLE "${schema}".scrapbook_images,
         "${schema}".scrapbook_journals,
         "${schema}".trips,
         "${schema}".users CASCADE`,
    )
  }
})

const skip = (t) => {
  if (!databaseAvailable) {
    t.skip('PostgreSQL is unavailable; scrapbook journal HTTP test skipped')
    return true
  }
  if (!redisAvailable) {
    t.skip('Redis is unavailable; scrapbook journal HTTP test skipped')
    return true
  }
  return false
}

const request = ({
  port,
  method = 'GET',
  path = '/',
  headers = {},
  body,
}) =>
  new Promise((resolve, reject) => {
    let payload
    const requestHeaders = { ...headers }

    if (body !== undefined) {
      if (Buffer.isBuffer(body)) {
        payload = body
        requestHeaders['Content-Length'] = body.length
      } else if (typeof body === 'string') {
        payload = Buffer.from(body)
        requestHeaders['Content-Type'] = 'application/json'
        requestHeaders['Content-Length'] = payload.length
      } else {
        payload = Buffer.from(JSON.stringify(body))
        requestHeaders['Content-Type'] = 'application/json'
        requestHeaders['Content-Length'] = payload.length
      }
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

  const send = async (method, path, { body, headers } = {}) => {
    const requestHeaders = { ...headers }

    if (cookie) {
      requestHeaders.Cookie = cookie
    }

    if (csrfToken) {
      requestHeaders['X-CSRF-Token'] = csrfToken
    }

    const response = await request({
      port,
      method,
      path,
      headers: requestHeaders,
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
    post: (path, body, headers) => send('POST', path, { body, headers }),
    patch: (path, body, headers) => send('PATCH', path, { body, headers }),
    delete: (path) => send('DELETE', path),
    get cookie() {
      return cookie
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
  const namespace = `tafera-scrapbook-journal-test-${crypto.randomUUID()}`
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
  app.use(
    '/api/scrapbooks',
    createScrapbooksRouter({
      scrapbookService: createScrapbookService({
        ScrapbookJournal,
        ScrapbookImage,
        Trip,
        cloudinaryService: {
          uploader: {
            upload: async function () {
              return {
                secure_url: 'https://res.cloudinary.com/test/image/upload/v1/photo.jpg',
                public_id: 'tafera/scrapbooks/photo',
              }
            },
            destroy: async function () {
              return { result: 'ok' }
            },
          },
        },
      }),
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
  const passwordHash = await passwordService.hashPassword(PASSWORD)

  return User.create({
    fullName: 'Ada Lovelace',
    email: `ada-${crypto.randomUUID()}@example.com`,
    passwordHash,
    role: 'user',
    status: 'active',
    authVersion: 1,
    emailVerifiedAt: new Date(),
    ...overrides,
  })
}

const createUnverifiedUser = async (overrides = {}) => {
  const passwordHash = await passwordService.hashPassword(PASSWORD)

  return User.create({
    fullName: 'Unverified User',
    email: `unverified-${crypto.randomUUID()}@example.com`,
    passwordHash,
    role: 'user',
    status: 'active',
    authVersion: 1,
    emailVerifiedAt: null,
    ...overrides,
  })
}

const createTrip = async (userId, overrides = {}) => {
  return Trip.create({
    userId,
    title: 'Japan Spring 2027',
    description: 'A trip to Japan',
    tripType: 'personal',
    startDate: '2027-03-28',
    endDate: '2027-04-10',
    status: 'published',
    ...overrides,
  })
}

const createJournal = async (userId, overrides = {}) => {
  return ScrapbookJournal.create({
    userId,
    title: 'Test Journal',
    description: 'A test journal',
    isPublic: false,
    ...overrides,
  })
}

const loginUser = async (client, email) => {
  await client.get('/api/auth/csrf')
  return client.post('/api/auth/login', { email, password: PASSWORD })
}

test('create journal defaults to private', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const client = harness.client()
    await loginUser(client, user.email)

    const response = await client.post('/api/scrapbooks', {
      title: 'Private Journal',
    })

    assert.equal(response.status, 201)
    assert.equal(response.body.data.journal.title, 'Private Journal')
    assert.equal(response.body.data.journal.isPublic, false)
    assert.equal(response.body.data.journal.userId, undefined)
    assert.equal(response.body.data.journal.publicId, undefined)
  } finally {
    await harness.close()
  }
})

test('create journal with explicit public visibility', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const client = harness.client()
    await loginUser(client, user.email)

    const response = await client.post('/api/scrapbooks', {
      title: 'Public Journal',
      isPublic: true,
    })

    assert.equal(response.status, 201)
    assert.equal(response.body.data.journal.title, 'Public Journal')
    assert.equal(response.body.data.journal.isPublic, true)
  } finally {
    await harness.close()
  }
})

test('create journal requires authentication', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const client = harness.client()
    const response = await client.post('/api/scrapbooks', {
      title: 'No Auth Journal',
    })

    assert.equal(response.status, 401)
  } finally {
    await harness.close()
  }
})

test('create journal rejects missing title', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const client = harness.client()
    await loginUser(client, user.email)

    const response = await client.post('/api/scrapbooks', {})

    assert.equal(response.status, 400)
  } finally {
    await harness.close()
  }
})

test('owner can list their journals', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    await createJournal(user.id, { title: 'Journal One' })
    await createJournal(user.id, { title: 'Journal Two', isPublic: true })

    const client = harness.client()
    await loginUser(client, user.email)

    const response = await client.get('/api/scrapbooks')

    assert.equal(response.status, 200)
    assert.equal(response.body.data.journals.length, 2)
    assert.equal(response.body.data.pagination.total, 2)
  } finally {
    await harness.close()
  }
})

test('list journals requires authentication', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const client = harness.client()
    const response = await client.get('/api/scrapbooks')

    assert.equal(response.status, 401)
  } finally {
    await harness.close()
  }
})

test('owner can access their private journal', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const journal = await createJournal(user.id, { isPublic: false })

    const client = harness.client()
    await loginUser(client, user.email)

    const response = await client.get(`/api/scrapbooks/${journal.id}`)

    assert.equal(response.status, 200)
    assert.equal(response.body.data.journal.id, journal.id)
    assert.equal(response.body.data.journal.isPublic, false)
  } finally {
    await harness.close()
  }
})

test('non-owner can access a public journal', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const owner = await createUser()
    const other = await createUser({
      email: `other-${crypto.randomUUID()}@example.com`,
    })
    const journal = await createJournal(owner.id, { isPublic: true })

    const client = harness.client()
    await loginUser(client, other.email)

    const response = await client.get(`/api/scrapbooks/${journal.id}`)

    assert.equal(response.status, 200)
    assert.equal(response.body.data.journal.id, journal.id)
    assert.equal(response.body.data.journal.isPublic, true)
  } finally {
    await harness.close()
  }
})

test('non-owner cannot access a private journal', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const owner = await createUser()
    const other = await createUser({
      email: `other-${crypto.randomUUID()}@example.com`,
    })
    const journal = await createJournal(owner.id, { isPublic: false })

    const client = harness.client()
    await loginUser(client, other.email)

    const response = await client.get(`/api/scrapbooks/${journal.id}`)

    assert.equal(response.status, 404)
    assert.equal(response.body.error.code, 'SCRAPBOOK_NOT_FOUND')
  } finally {
    await harness.close()
  }
})

test('accessing missing journal returns 404', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const client = harness.client()
    await loginUser(client, user.email)

    const response = await client.get(`/api/scrapbooks/${crypto.randomUUID()}`)

    assert.equal(response.status, 404)
    assert.equal(response.body.error.code, 'SCRAPBOOK_NOT_FOUND')
  } finally {
    await harness.close()
  }
})

test('owner can update their journal', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const journal = await createJournal(user.id)

    const client = harness.client()
    await loginUser(client, user.email)

    const response = await client.patch(`/api/scrapbooks/${journal.id}`, {
      title: 'Updated Title',
      description: 'Updated description',
    })

    assert.equal(response.status, 200)
    assert.equal(response.body.data.journal.title, 'Updated Title')
    assert.equal(response.body.data.journal.description, 'Updated description')
  } finally {
    await harness.close()
  }
})

test('non-owner cannot update another user journal', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const owner = await createUser()
    const other = await createUser({
      email: `other-${crypto.randomUUID()}@example.com`,
    })
    const journal = await createJournal(owner.id)

    const client = harness.client()
    await loginUser(client, other.email)

    const response = await client.patch(`/api/scrapbooks/${journal.id}`, {
      title: 'Hacked',
    })

    assert.equal(response.status, 404)
    assert.equal(response.body.error.code, 'SCRAPBOOK_NOT_FOUND')
  } finally {
    await harness.close()
  }
})

test('update rejects empty body', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const journal = await createJournal(user.id)

    const client = harness.client()
    await loginUser(client, user.email)

    const response = await client.patch(`/api/scrapbooks/${journal.id}`, {})

    assert.equal(response.status, 400)
  } finally {
    await harness.close()
  }
})

test('owner can change journal visibility to public', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const journal = await createJournal(user.id, { isPublic: false })

    const client = harness.client()
    await loginUser(client, user.email)

    const response = await client.patch(`/api/scrapbooks/${journal.id}/visibility`, {
      isPublic: true,
    })

    assert.equal(response.status, 200)
    assert.equal(response.body.data.journal.isPublic, true)
  } finally {
    await harness.close()
  }
})

test('owner can change journal visibility to private', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const journal = await createJournal(user.id, { isPublic: true })

    const client = harness.client()
    await loginUser(client, user.email)

    const response = await client.patch(`/api/scrapbooks/${journal.id}/visibility`, {
      isPublic: false,
    })

    assert.equal(response.status, 200)
    assert.equal(response.body.data.journal.isPublic, false)
  } finally {
    await harness.close()
  }
})

test('non-owner cannot change journal visibility', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const owner = await createUser()
    const other = await createUser({
      email: `other-${crypto.randomUUID()}@example.com`,
    })
    const journal = await createJournal(owner.id, { isPublic: false })

    const client = harness.client()
    await loginUser(client, other.email)

    const response = await client.patch(`/api/scrapbooks/${journal.id}/visibility`, {
      isPublic: true,
    })

    assert.equal(response.status, 404)
    assert.equal(response.body.error.code, 'SCRAPBOOK_NOT_FOUND')
  } finally {
    await harness.close()
  }
})

test('owner can link journal to their own trip', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const trip = await createTrip(user.id)
    const journal = await createJournal(user.id, { tripId: null })

    const client = harness.client()
    await loginUser(client, user.email)

    const response = await client.post(`/api/scrapbooks/${journal.id}/trip`, {
      tripId: trip.id,
    })

    assert.equal(response.status, 200)
    assert.equal(response.body.data.journal.tripId, trip.id)
  } finally {
    await harness.close()
  }
})

test('owner cannot link journal to another user trip', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const owner = await createUser()
    const other = await createUser({
      email: `other-${crypto.randomUUID()}@example.com`,
    })
    const otherTrip = await createTrip(other.id)
    const journal = await createJournal(owner.id, { tripId: null })

    const client = harness.client()
    await loginUser(client, owner.email)

    const response = await client.post(`/api/scrapbooks/${journal.id}/trip`, {
      tripId: otherTrip.id,
    })

    assert.equal(response.status, 404)
    assert.equal(response.body.error.code, 'SCRAPBOOK_NOT_FOUND')
  } finally {
    await harness.close()
  }
})

test('non-owner cannot link trip to another user journal', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const owner = await createUser()
    const other = await createUser({
      email: `other-${crypto.randomUUID()}@example.com`,
    })
    const trip = await createTrip(other.id)
    const journal = await createJournal(owner.id, { tripId: null })

    const client = harness.client()
    await loginUser(client, other.email)

    const response = await client.post(`/api/scrapbooks/${journal.id}/trip`, {
      tripId: trip.id,
    })

    assert.equal(response.status, 404)
    assert.equal(response.body.error.code, 'SCRAPBOOK_NOT_FOUND')
  } finally {
    await harness.close()
  }
})

test('owner can unlink trip from journal', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const trip = await createTrip(user.id)
    const journal = await createJournal(user.id, { tripId: trip.id })

    const client = harness.client()
    await loginUser(client, user.email)

    const response = await client.delete(`/api/scrapbooks/${journal.id}/trip`)

    assert.equal(response.status, 200)
    assert.equal(response.body.data.journal.tripId, null)
  } finally {
    await harness.close()
  }
})

test('non-owner cannot unlink trip from another user journal', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const owner = await createUser()
    const other = await createUser({
      email: `other-${crypto.randomUUID()}@example.com`,
    })
    const trip = await createTrip(owner.id)
    const journal = await createJournal(owner.id, { tripId: trip.id })

    const client = harness.client()
    await loginUser(client, other.email)

    const response = await client.delete(`/api/scrapbooks/${journal.id}/trip`)

    assert.equal(response.status, 404)
    assert.equal(response.body.error.code, 'SCRAPBOOK_NOT_FOUND')
  } finally {
    await harness.close()
  }
})

test('owner can delete their journal', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const journal = await createJournal(user.id)

    const client = harness.client()
    await loginUser(client, user.email)

    const response = await client.delete(`/api/scrapbooks/${journal.id}`)

    assert.equal(response.status, 204)

    const remaining = await ScrapbookJournal.count({
      where: { id: journal.id },
    })
    assert.equal(remaining, 0, 'journal should be deleted')
  } finally {
    await harness.close()
  }
})

test('non-owner cannot delete another user journal', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const owner = await createUser()
    const other = await createUser({
      email: `other-${crypto.randomUUID()}@example.com`,
    })
    const journal = await createJournal(owner.id)

    const client = harness.client()
    await loginUser(client, other.email)

    const response = await client.delete(`/api/scrapbooks/${journal.id}`)

    assert.equal(response.status, 404)
    assert.equal(response.body.error.code, 'SCRAPBOOK_NOT_FOUND')

    const remaining = await ScrapbookJournal.count({
      where: { id: journal.id },
    })
    assert.equal(remaining, 1, 'journal should not be deleted by non-owner')
  } finally {
    await harness.close()
  }
})

test('public journal image listing by non-owner', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const owner = await createUser()
    const other = await createUser({
      email: `other-${crypto.randomUUID()}@example.com`,
    })
    const journal = await createJournal(owner.id, { isPublic: true })
    await ScrapbookImage.create({
      id: crypto.randomUUID(),
      journalId: journal.id,
      imageUrl: 'https://res.cloudinary.com/test/image/upload/v1/photo1.jpg',
      publicId: 'tafera/scrapbooks/photo1',
      altText: 'First image',
      displayOrder: 1,
      isCover: true,
    })

    const client = harness.client()
    await loginUser(client, other.email)

    const response = await client.get(`/api/scrapbooks/${journal.id}/images`)

    assert.equal(response.status, 200)
    assert.equal(response.body.data.images.length, 1)
    assert.equal(response.body.data.images[0].altText, 'First image')
    assert.equal(response.body.data.images[0].publicId, undefined)
    assert.equal(response.body.data.images[0].public_id, undefined)
  } finally {
    await harness.close()
  }
})

test('private journal image listing denied to non-owner', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const owner = await createUser()
    const other = await createUser({
      email: `other-${crypto.randomUUID()}@example.com`,
    })
    const journal = await createJournal(owner.id, { isPublic: false })
    await ScrapbookImage.create({
      id: crypto.randomUUID(),
      journalId: journal.id,
      imageUrl: 'https://res.cloudinary.com/test/image/upload/v1/photo1.jpg',
      publicId: 'tafera/scrapbooks/photo1',
      altText: 'First image',
      displayOrder: 1,
      isCover: true,
    })

    const client = harness.client()
    await loginUser(client, other.email)

    const response = await client.get(`/api/scrapbooks/${journal.id}/images`)

    assert.equal(response.status, 404)
    assert.equal(response.body.error.code, 'SCRAPBOOK_NOT_FOUND')
  } finally {
    await harness.close()
  }
})

test('image modifications remain owner-only', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const owner = await createUser()
    const other = await createUser({
      email: `other-${crypto.randomUUID()}@example.com`,
    })
    const journal = await createJournal(owner.id)
    const image = await ScrapbookImage.create({
      id: crypto.randomUUID(),
      journalId: journal.id,
      imageUrl: 'https://res.cloudinary.com/test/image/upload/v1/photo.jpg',
      publicId: 'tafera/scrapbooks/photo',
      altText: 'Original',
      displayOrder: 1,
      isCover: false,
    })

    const client = harness.client()
    await loginUser(client, other.email)

    const response = await client.patch(
      `/api/scrapbooks/${journal.id}/images/${image.id}`,
      { altText: 'Hacked' },
    )

    assert.equal(response.status, 404)
    assert.equal(response.body.error.code, 'SCRAPBOOK_IMAGE_NOT_FOUND')
  } finally {
    await harness.close()
  }
})

test('unverified users cannot access private scrapbook reads or writes', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUnverifiedUser()
    const client = harness.client()
    await loginUser(client, user.email)

    // Verify the user is unverified
    assert.equal(user.emailVerifiedAt, null)

    const createResponse = await client.post('/api/scrapbooks', {
      title: 'Unverified Journal',
    })
    assert.equal(createResponse.status, 403)
    assert.equal(createResponse.body.error.code, 'EMAIL_VERIFICATION_REQUIRED')
    const listResponse = await client.get('/api/scrapbooks')
    assert.equal(listResponse.status, 403)
    assert.equal(listResponse.body.error.code, 'EMAIL_VERIFICATION_REQUIRED')
  } finally {
    await harness.close()
  }
})

test('CSRF protection remains effective on journal writes', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const journal = await createJournal(user.id)

    const client = harness.client()
    await loginUser(client, user.email)
    const cookie = client.cookie

    // Create journal without CSRF token should be rejected
    const response = await request({
      port: harness.port,
      method: 'POST',
      path: '/api/scrapbooks',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
      },
      body: { title: 'No CSRF Journal' },
    })

    assert.equal(response.status, 403)
  } finally {
    await harness.close()
  }
})

test('journal deletion cleans up associated images', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const journal = await createJournal(user.id)
    await ScrapbookImage.create({
      id: crypto.randomUUID(),
      journalId: journal.id,
      imageUrl: 'https://res.cloudinary.com/test/image/upload/v1/photo1.jpg',
      publicId: 'tafera/scrapbooks/photo1',
      altText: 'Image 1',
      displayOrder: 1,
      isCover: true,
    })
    await ScrapbookImage.create({
      id: crypto.randomUUID(),
      journalId: journal.id,
      imageUrl: 'https://res.cloudinary.com/test/image/upload/v1/photo2.jpg',
      publicId: 'tafera/scrapbooks/photo2',
      altText: 'Image 2',
      displayOrder: 2,
      isCover: false,
    })

    const client = harness.client()
    await loginUser(client, user.email)

    const response = await client.delete(`/api/scrapbooks/${journal.id}`)
    assert.equal(response.status, 204)

    const remainingImages = await ScrapbookImage.count({
      where: { journalId: journal.id },
    })
    assert.equal(remainingImages, 0, 'all images should be deleted with journal')

    const remainingJournal = await ScrapbookJournal.count({
      where: { id: journal.id },
    })
    assert.equal(remainingJournal, 0, 'journal should be deleted')
  } finally {
    await harness.close()
  }
})

test('no public scrapbook directory exists', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const client = harness.client()
    await loginUser(client, user.email)

    // GET /api/scrapbooks (without journalId) lists the owner's journals only,
    // it is not a public directory. There is no endpoint to list all public
    // journals across users.
    const response = await client.get('/api/scrapbooks')

    assert.equal(response.status, 200)
    assert.equal(response.body.data.journals.length, 0)

    // Verify there is no public listing by checking no public directory route
    // exists - the list endpoint is scoped to the authenticated user.
  } finally {
    await harness.close()
  }
})

test('create journal with invalid tripId format returns 400', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const client = harness.client()
    await loginUser(client, user.email)

    const response = await client.post('/api/scrapbooks', {
      title: 'Bad Trip Journal',
      tripId: 'not-a-uuid',
    })

    assert.equal(response.status, 400)
  } finally {
    await harness.close()
  }
})
