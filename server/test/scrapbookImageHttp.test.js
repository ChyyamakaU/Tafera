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

const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0])
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const WEBP_HEADER = Buffer.from(
  [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50],
)
const GIF_HEADER = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])

let base = null
let scoped = null
let User = null
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

    schema = `tafera_scrapbook_image_http_${process.pid}_${Date.now()}`
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
      `CREATE TABLE "${schema}".scrapbook_journals (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         user_id uuid NOT NULL REFERENCES "${schema}".users(id)
           ON DELETE CASCADE ON UPDATE CASCADE,
         trip_id uuid,
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
    ScrapbookJournal = ScrapbookJournalModel(scoped, DataTypes)
    ScrapbookImage = ScrapbookImageModel(scoped, DataTypes)

    ScrapbookJournal.hasMany(ScrapbookImage, {
      foreignKey: 'journalId',
      as: 'images',
    })
    ScrapbookImage.belongsTo(ScrapbookJournal, {
      foreignKey: 'journalId',
      as: 'journal',
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
         "${schema}".users CASCADE`,
    )
  }
})

const skip = (t) => {
  if (!databaseAvailable) {
    t.skip('PostgreSQL is unavailable; scrapbook image HTTP test skipped')
    return true
  }
  if (!redisAvailable) {
    t.skip('Redis is unavailable; scrapbook image HTTP test skipped')
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

const createMultipartBody = (fields, fileField, fileBuffer, fileMimetype, fileName, boundary) => {
  const parts = []

  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    )
  }

  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${fileName}"\r\nContent-Type: ${fileMimetype}\r\n\r\n`,
  )

  const headerBuffer = Buffer.from(parts.join(''), 'utf8')
  const footerBuffer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8')

  return Buffer.concat([headerBuffer, fileBuffer, footerBuffer])
}

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
  const namespace = `tafera-scrapbook-image-test-${crypto.randomUUID()}`
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
    passwordHash,
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

test('owner can upload a valid JPEG image to their journal', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const journal = await createJournal(user.id)

    const client = harness.client()
    await loginUser(client, user.email)

    const boundary = `----WebKitFormBoundary${crypto.randomBytes(16).toString('hex')}`
    const body = createMultipartBody(
      { altText: 'A scenic view', isCover: 'false' },
      'image',
      JPEG_HEADER,
      'image/jpeg',
      'test.jpg',
      boundary,
    )
    const response = await client.post(
      `/api/scrapbooks/${journal.id}/images`,
      body,
      { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    )

    assert.equal(response.status, 201)
    assert.equal(response.headers['cache-control'], 'no-store')
    assert.equal(response.body.data.image.altText, 'A scenic view')
    // First image in a journal auto-becomes the cover regardless of isCover input.
    assert.equal(response.body.data.image.isCover, true)
    assert.equal(response.body.data.image.publicId, undefined)
    assert.equal(response.body.data.image.imageUrl, 'https://res.cloudinary.com/test/image/upload/v1/photo.jpg')
  } finally {
    await harness.close()
  }
})

test('owner uploads image with isCover:false and it is respected when a cover already exists', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const journal = await createJournal(user.id)

    // Seed an existing cover image so the new upload does not auto-become cover.
    await ScrapbookImage.create({
      id: crypto.randomUUID(),
      journalId: journal.id,
      imageUrl: 'https://res.cloudinary.com/test/image/upload/v1/existing.jpg',
      publicId: 'tafera/scrapbooks/existing',
      altText: 'Existing cover',
      displayOrder: 1,
      isCover: true,
    })

    const client = harness.client()
    await loginUser(client, user.email)

    const boundary = `----WebKitFormBoundary${crypto.randomBytes(16).toString('hex')}`
    const body = createMultipartBody(
      { altText: 'A non-cover image', isCover: 'false' },
      'image',
      JPEG_HEADER,
      'image/jpeg',
      'test.jpg',
      boundary,
    )
    const response = await client.post(
      `/api/scrapbooks/${journal.id}/images`,
      body,
      { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    )

    assert.equal(response.status, 201)
    assert.equal(response.headers['cache-control'], 'no-store')
    assert.equal(response.body.data.image.altText, 'A non-cover image')
    // isCover: 'false' is respected because a cover already exists.
    assert.equal(response.body.data.image.isCover, false)
    assert.equal(response.body.data.image.publicId, undefined)
  } finally {
    await harness.close()
  }
})

test('owner uploads image with omitted isCover and it auto-becomes cover for first image', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const journal = await createJournal(user.id)

    const client = harness.client()
    await loginUser(client, user.email)

    const boundary = `----WebKitFormBoundary${crypto.randomBytes(16).toString('hex')}`
    const body = createMultipartBody(
      { altText: 'First image, no isCover field' },
      'image',
      JPEG_HEADER,
      'image/jpeg',
      'test.jpg',
      boundary,
    )
    const response = await client.post(
      `/api/scrapbooks/${journal.id}/images`,
      body,
      { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    )

    assert.equal(response.status, 201)
    assert.equal(response.headers['cache-control'], 'no-store')
    assert.equal(response.body.data.image.altText, 'First image, no isCover field')
    // First image with no isCover auto-becomes cover.
    assert.equal(response.body.data.image.isCover, true)
    assert.equal(response.body.data.image.publicId, undefined)
  } finally {
    await harness.close()
  }
})

test('owner can upload a valid PNG image', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const journal = await createJournal(user.id)

    const client = harness.client()
    await loginUser(client, user.email)

    const boundary = `----WebKitFormBoundary${crypto.randomBytes(16).toString('hex')}`
    const body = createMultipartBody(
      {},
      'image',
      PNG_HEADER,
      'image/png',
      'test.png',
      boundary,
    )
    const response = await client.post(
      `/api/scrapbooks/${journal.id}/images`,
      body,
      { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    )

    assert.equal(response.status, 201)
  } finally {
    await harness.close()
  }
})

test('owner can upload a valid WebP image', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const journal = await createJournal(user.id)

    const client = harness.client()
    await loginUser(client, user.email)

    const boundary = `----WebKitFormBoundary${crypto.randomBytes(16).toString('hex')}`
    const body = createMultipartBody(
      {},
      'image',
      WEBP_HEADER,
      'image/webp',
      'test.webp',
      boundary,
    )
    const response = await client.post(
      `/api/scrapbooks/${journal.id}/images`,
      body,
      { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    )

    assert.equal(response.status, 201)
  } finally {
    await harness.close()
  }
})

test('upload rejects missing file', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const journal = await createJournal(user.id)

    const client = harness.client()
    await loginUser(client, user.email)

    const boundary = `----WebKitFormBoundary${crypto.randomBytes(16).toString('hex')}`
    const body = createMultipartBody(
      { altText: 'No file' },
      'image',
      Buffer.alloc(0),
      'application/octet-stream',
      '',
      boundary,
    )
    const response = await client.post(
      `/api/scrapbooks/${journal.id}/images`,
      body,
      { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    )

    assert.equal(response.status, 400)
    assert.equal(response.body.error.code, 'INVALID_IMAGE_FILE')
  } finally {
    await harness.close()
  }
})

test('upload rejects unsupported file type (GIF)', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const journal = await createJournal(user.id)

    const client = harness.client()
    await loginUser(client, user.email)

    const boundary = `----WebKitFormBoundary${crypto.randomBytes(16).toString('hex')}`
    const body = createMultipartBody(
      {},
      'image',
      GIF_HEADER,
      'image/gif',
      'test.gif',
      boundary,
    )
    const response = await client.post(
      `/api/scrapbooks/${journal.id}/images`,
      body,
      { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    )

    assert.equal(response.status, 400)
    assert.equal(response.body.error.code, 'INVALID_IMAGE_FILE')
  } finally {
    await harness.close()
  }
})

test('upload rejects mismatched magic bytes', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const journal = await createJournal(user.id)

    const client = harness.client()
    await loginUser(client, user.email)

    const boundary = `----WebKitFormBoundary${crypto.randomBytes(16).toString('hex')}`
    const body = createMultipartBody(
      {},
      'image',
      PNG_HEADER,
      'image/jpeg',
      'fake.jpg',
      boundary,
    )
    const response = await client.post(
      `/api/scrapbooks/${journal.id}/images`,
      body,
      { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    )

    assert.equal(response.status, 400)
    assert.equal(response.body.error.code, 'INVALID_IMAGE_FILE')
  } finally {
    await harness.close()
  }
})

test('upload rejects oversized file', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const journal = await createJournal(user.id)

    const client = harness.client()
    await loginUser(client, user.email)

    const largeBuffer = Buffer.alloc(5 * 1024 * 1024 + 1)
    largeBuffer[0] = 0xff
    largeBuffer[1] = 0xd8
    largeBuffer[2] = 0xff

    const boundary = `----WebKitFormBoundary${crypto.randomBytes(16).toString('hex')}`
    const body = createMultipartBody(
      {},
      'image',
      largeBuffer,
      'image/jpeg',
      'large.jpg',
      boundary,
    )
    const response = await client.post(
      `/api/scrapbooks/${journal.id}/images`,
      body,
      { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    )

    assert.equal(response.status, 400)
    assert.equal(response.body.error.code, 'INVALID_IMAGE_FILE')
  } finally {
    await harness.close()
  }
})

test('CSRF protection rejects upload without token', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const journal = await createJournal(user.id)

    const client = harness.client()
    await loginUser(client, user.email)
    const cookie = client.cookie

    const boundary = `----WebKitFormBoundary${crypto.randomBytes(16).toString('hex')}`
    const body = createMultipartBody(
      {},
      'image',
      JPEG_HEADER,
      'image/jpeg',
      'test.jpg',
      boundary,
    )

    const response = await request({
      port: harness.port,
      method: 'POST',
      path: `/api/scrapbooks/${journal.id}/images`,
      headers: {
        Cookie: cookie,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
      body,
    })

    assert.equal(response.status, 403)
  } finally {
    await harness.close()
  }
})

test('unauthenticated upload is rejected', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const journal = await createJournal(user.id)

    const client = harness.client()
    const boundary = `----WebKitFormBoundary${crypto.randomBytes(16).toString('hex')}`
    const body = createMultipartBody(
      {},
      'image',
      JPEG_HEADER,
      'image/jpeg',
      'test.jpg',
      boundary,
    )
    const response = await client.post(
      `/api/scrapbooks/${journal.id}/images`,
      body,
      { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    )

    assert.equal(response.status, 401)
  } finally {
    await harness.close()
  }
})

test('owner can list images for their journal', async (t) => {
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
      altText: 'First image',
      displayOrder: 1,
      isCover: true,
    })
    await ScrapbookImage.create({
      id: crypto.randomUUID(),
      journalId: journal.id,
      imageUrl: 'https://res.cloudinary.com/test/image/upload/v1/photo2.jpg',
      publicId: 'tafera/scrapbooks/photo2',
      altText: 'Second image',
      displayOrder: 2,
      isCover: false,
    })

    const client = harness.client()
    await loginUser(client, user.email)

    const response = await client.get(`/api/scrapbooks/${journal.id}/images`)

    assert.equal(response.status, 200)
    assert.equal(response.headers['cache-control'], 'no-store')
    assert.equal(response.body.data.images.length, 2)
    const serialized = JSON.stringify(response.body)
    assert.equal(serialized.includes('publicId'), false)
    assert.equal(serialized.includes('public_id'), false)
  } finally {
    await harness.close()
  }
})

test('unauthenticated list is rejected', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const journal = await createJournal(user.id)

    const client = harness.client()
    const response = await client.get(`/api/scrapbooks/${journal.id}/images`)

    assert.equal(response.status, 401)
  } finally {
    await harness.close()
  }
})

test('non-owner cannot list another user journal images', async (t) => {
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

    const response = await client.get(`/api/scrapbooks/${journal.id}/images`)

    assert.equal(response.status, 404)
  } finally {
    await harness.close()
  }
})

test('upload to missing journal returns 404', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const missingJournalId = crypto.randomUUID()

    const client = harness.client()
    await loginUser(client, user.email)

    const boundary = `----WebKitFormBoundary${crypto.randomBytes(16).toString('hex')}`
    const body = createMultipartBody(
      {},
      'image',
      JPEG_HEADER,
      'image/jpeg',
      'test.jpg',
      boundary,
    )
    const response = await client.post(
      `/api/scrapbooks/${missingJournalId}/images`,
      body,
      { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    )

    assert.equal(response.status, 404)
    assert.equal(response.body.error.code, 'SCRAPBOOK_NOT_FOUND')
  } finally {
    await harness.close()
  }
})

test('upload rejects invalid journal ID', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()

    const client = harness.client()
    await loginUser(client, user.email)

    const boundary = `----WebKitFormBoundary${crypto.randomBytes(16).toString('hex')}`
    const body = createMultipartBody(
      {},
      'image',
      JPEG_HEADER,
      'image/jpeg',
      'test.jpg',
      boundary,
    )
    const response = await client.post(
      '/api/scrapbooks/not-a-uuid/images',
      body,
      { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    )

    assert.equal(response.status, 400)
  } finally {
    await harness.close()
  }
})

test('owner can update image metadata', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const journal = await createJournal(user.id)
    const image = await ScrapbookImage.create({
      id: crypto.randomUUID(),
      journalId: journal.id,
      imageUrl: 'https://res.cloudinary.com/test/image/upload/v1/photo.jpg',
      publicId: 'tafera/scrapbooks/photo',
      altText: 'Original',
      caption: 'Original caption',
      displayOrder: 1,
      isCover: false,
    })

    const client = harness.client()
    await loginUser(client, user.email)

    const response = await client.patch(
      `/api/scrapbooks/${journal.id}/images/${image.id}`,
      { altText: 'Updated alt text', caption: 'Updated caption', takenAt: '2026-01-15' },
    )

    assert.equal(response.status, 200)
    assert.equal(response.body.data.image.id, image.id)
    assert.equal(response.body.data.image.altText, 'Updated alt text')
    assert.equal(response.body.data.image.caption, 'Updated caption')
    assert.equal(response.body.data.image.publicId, undefined)
  } finally {
    await harness.close()
  }
})

test('update rejects invalid image ID', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const journal = await createJournal(user.id)

    const client = harness.client()
    await loginUser(client, user.email)

    const response = await client.patch(
      `/api/scrapbooks/${journal.id}/images/not-a-uuid`,
      { altText: 'New alt' },
    )

    assert.equal(response.status, 400)
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
    await loginUser(client, user.email)

    const response = await client.patch(
      `/api/scrapbooks/${journal.id}/images/${image.id}`,
      {},
    )

    assert.equal(response.status, 400)
  } finally {
    await harness.close()
  }
})

test('non-owner cannot update another user image', async (t) => {
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
  } finally {
    await harness.close()
  }
})

test('owner can delete an image', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const journal = await createJournal(user.id)
    const image = await ScrapbookImage.create({
      id: crypto.randomUUID(),
      journalId: journal.id,
      imageUrl: 'https://res.cloudinary.com/test/image/upload/v1/photo.jpg',
      publicId: 'tafera/scrapbooks/photo',
      altText: 'To delete',
      displayOrder: 1,
      isCover: false,
    })

    const client = harness.client()
    await loginUser(client, user.email)

    const response = await client.delete(
      `/api/scrapbooks/${journal.id}/images/${image.id}`,
    )

    assert.equal(response.status, 204)

    const remaining = await ScrapbookImage.count({
      where: { journalId: journal.id },
    })
    assert.equal(remaining, 0, 'image record should be deleted')
  } finally {
    await harness.close()
  }
})

test('non-owner cannot delete another user image', async (t) => {
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
      altText: 'To delete',
      displayOrder: 1,
      isCover: false,
    })

    const client = harness.client()
    await loginUser(client, other.email)

    const response = await client.delete(
      `/api/scrapbooks/${journal.id}/images/${image.id}`,
    )

    assert.equal(response.status, 404)

    const remaining = await ScrapbookImage.count({
      where: { journalId: journal.id },
    })
    assert.equal(remaining, 1, 'image should not be deleted by non-owner')
  } finally {
    await harness.close()
  }
})

test('owner can reorder images', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const journal = await createJournal(user.id)
    const image1 = await ScrapbookImage.create({
      id: crypto.randomUUID(),
      journalId: journal.id,
      imageUrl: 'https://res.cloudinary.com/test/image/upload/v1/photo1.jpg',
      publicId: 'tafera/scrapbooks/photo1',
      altText: 'First',
      displayOrder: 1,
      isCover: true,
    })
    const image2 = await ScrapbookImage.create({
      id: crypto.randomUUID(),
      journalId: journal.id,
      imageUrl: 'https://res.cloudinary.com/test/image/upload/v1/photo2.jpg',
      publicId: 'tafera/scrapbooks/photo2',
      altText: 'Second',
      displayOrder: 2,
      isCover: false,
    })

    const client = harness.client()
    await loginUser(client, user.email)

    const response = await client.patch(
      `/api/scrapbooks/${journal.id}/images/reorder`,
      [image2.id, image1.id],
    )

    assert.equal(response.status, 200)
    assert.equal(response.body.data.images.length, 2)
    assert.equal(response.body.data.images[0].id, image2.id)
    assert.equal(response.body.data.images[1].id, image1.id)
    assert.equal(response.body.data.images[0].displayOrder, 1)
    assert.equal(response.body.data.images[1].displayOrder, 2)
  } finally {
    await harness.close()
  }
})

test('reorder rejects image that does not belong to journal', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const journal = await createJournal(user.id)
    const image1 = await ScrapbookImage.create({
      id: crypto.randomUUID(),
      journalId: journal.id,
      imageUrl: 'https://res.cloudinary.com/test/image/upload/v1/photo1.jpg',
      publicId: 'tafera/scrapbooks/photo1',
      altText: 'First',
      displayOrder: 1,
      isCover: false,
    })

    const client = harness.client()
    await loginUser(client, user.email)

    const response = await client.patch(
      `/api/scrapbooks/${journal.id}/images/reorder`,
      [image1.id, crypto.randomUUID()],
    )

    assert.equal(response.status, 404)
  } finally {
    await harness.close()
  }
})
