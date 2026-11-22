'use strict'

process.env.NODE_ENV = 'development'
process.env.SESSION_SECRET =
  'test-only-session-secret-0123456789abcdef'
process.env.DB_NAME = process.env.DB_NAME || 'tafera'
process.env.DB_USER = process.env.DB_USER || 'tafera_user'
process.env.ARGON2_MAX_QUEUE = '50'

const { test, before, after, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const crypto = require('node:crypto')
const express = require('express')
const cookieParser = require('cookie-parser')
const { Sequelize, DataTypes } = require('sequelize')
const { createClient } = require('redis')

const { runtimeConfig } = require('../src/config/database')
const UserModel = require('../src/models/user')
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
  createAuthenticate,
} = require('../src/middlewares/authenticate')
const {
  createCsrfProtection,
} = require('../src/middlewares/csrfProtection')
const {
  createAuthRouter,
} = require('../src/routes/auth')
const errorHandler = require('../src/middlewares/errorHandler')
const {
  createLoginLimiter,
  createRegistrationLimiter,
} = require('../src/config/rateLimiter')

const TEST_SECRET = 'test-only-session-secret-0123456789abcdef'
const SESSION_COOKIE = 'tafera.sid'
const PASSWORD = 'a sufficiently long passphrase'

let base = null
let scoped = null
let User = null
let schema = null
let databaseAvailable = false
let redisClient = null
let redisAvailable = false

before(async () => {
  const config = runtimeConfig()
  base = new Sequelize(
    config.database,
    config.username,
    config.password,
    {
      ...config.options,
      host: config.host,
      port: config.port,
      logging: false,
    },
  )

  try {
    await base.authenticate()

    schema = `tafera_ratelimit_${process.pid}_${Date.now()}`
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

    scoped = new Sequelize(
      config.database,
      config.username,
      config.password,
      {
        ...config.options,
        host: config.host,
        port: config.port,
        logging: false,
        searchPath: schema,
        dialectOptions: {
          ...(config.options.dialectOptions || {}),
          prependSearchPath: true,
        },
      },
    )

    await scoped.authenticate()
    User = UserModel(scoped, DataTypes)
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
    await base.query(`TRUNCATE TABLE "${schema}".users CASCADE`)
  }
  if (redisClient && redisClient.isOpen) {
    const keys = await redisClient.keys('tafera-ratelimit-test:*')
    if (keys.length > 0) {
      await redisClient.del(keys)
    }
  }
})

const skip = (t) => {
  if (!databaseAvailable) {
    t.skip('PostgreSQL is unavailable; rate limiter test skipped')
    return true
  }
  if (!redisAvailable) {
    t.skip('Redis is unavailable; rate limiter test skipped')
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

  const send = async (method, path, { body, headers } = {}) => {
    const requestHeaders = { ...headers }
    if (cookie) {
      requestHeaders.Cookie = cookie
    }
    if (csrfToken) {
      requestHeaders['X-CSRF-Token'] = csrfToken
    }

    const response = await request({ port, method, path, headers: requestHeaders, body })

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

const createHarness = async ({
  loginRateLimit = {},
  registrationRateLimit = {},
} = {}) => {
  const namespace = `tafera-ratelimit-test-${crypto.randomUUID()}`
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

  const authenticate = createAuthenticate({ User, sessions, nodeEnv })
  const csrfProtection = createCsrfProtection()

  const authService = createAuthService({
    User,
    sessions,
    nodeEnv,
    verifications: {},
  })
  const controller = createAuthController({
    authService,
    sessions,
    verifications: {},
    nodeEnv,
  })

  app.use(
    '/api/auth',
    createAuthRouter({
      authService,
      sessions,
      nodeEnv,
      User,
      redisClient,
      rateLimitPrefix: `${namespace}:email-verification:`,
      loginRateLimit: { prefix: `${namespace}:login:`, ...loginRateLimit },
      registrationRateLimit: {
        prefix: `${namespace}:registration:`,
        ...registrationRateLimit,
      },
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
      const keys = await redisClient.keys(`${namespace}:*`)
      if (keys.length > 0) {
        await redisClient.del(keys)
      }
    },
  }
}

const getCsrf = async (client) => {
  const response = await client.get('/api/auth/csrf')
  assert.equal(response.status, 200)
  assert.equal(typeof response.body.data.csrfToken, 'string')
  return response
}

// ---------------------------------------------------------------------------
// Unit tests: factory functions
// ---------------------------------------------------------------------------

test('createLoginLimiter does not throw at creation; fail-closed happens at request time', () => {
  // Creation is lenient (matching createEmailVerificationLimiter). If Redis is
  // unavailable at request time, passOnStoreError: false causes the limiter to
  // reject the request instead of falling back to in-memory storage.
  const closedClient = { isOpen: false }
  const limiter = createLoginLimiter({ client: closedClient })
  assert.ok(limiter)
  assert.equal(typeof limiter, 'function')
})

test('createRegistrationLimiter does not throw at creation; fail-closed happens at request time', () => {
  const closedClient = { isOpen: false }
  const limiter = createRegistrationLimiter({ client: closedClient })
  assert.ok(limiter)
  assert.equal(typeof limiter, 'function')
})

test('createLoginLimiter accepts injectable prefix, windowMs and limit', () => {
  const limiter = createLoginLimiter({
    client: redisClient,
    prefix: 'test:login:',
    windowMs: 60 * 1000,
    limit: 3,
  })
  assert.ok(limiter)
  assert.equal(typeof limiter, 'function')
})

test('createRegistrationLimiter accepts injectable prefix, windowMs and limit', () => {
  const limiter = createRegistrationLimiter({
    client: redisClient,
    prefix: 'test:registration:',
    windowMs: 60 * 1000,
    limit: 3,
  })
  assert.ok(limiter)
  assert.equal(typeof limiter, 'function')
})

// ---------------------------------------------------------------------------
// Integration tests: route-level rate limiting
// ---------------------------------------------------------------------------

test('login allows requests up to the limit then returns 429', async (t) => {
  if (skip(t)) return
  const harness = await createHarness({
    loginRateLimit: { limit: 3 },
  })

  try {
    const client = harness.client()

    // 3 login attempts are allowed (they fail with 401 INVALID_CREDENTIALS
    // because no such user exists, but they are not rate limited).
    for (let i = 0; i < 3; i += 1) {
      await getCsrf(client)
      const response = await client.post('/api/auth/login', {
        email: 'nonexistent@example.com',
        password: PASSWORD,
      })
      assert.equal(response.status, 401, `login attempt ${i + 1} should not be rate limited`)
    }

    // The 4th attempt is rate limited.
    await getCsrf(client)
    const limited = await client.post('/api/auth/login', {
      email: 'nonexistent@example.com',
      password: PASSWORD,
    })

    assert.equal(limited.status, 429)
    assert.equal(limited.body.error.code, 'LOGIN_RATE_LIMITED')
    assert.equal(typeof limited.headers['retry-after'], 'string')
    assert.equal(limited.headers['cache-control'], 'no-store')
  } finally {
    await harness.close()
  }
})

test('registration allows requests up to the limit then returns 429', async (t) => {
  if (skip(t)) return
  const harness = await createHarness({
    registrationRateLimit: { limit: 3 },
  })

  try {
    const client = harness.client()

    // 3 registration attempts are allowed (they fail with 400 VALIDATION_ERROR
    // because the body is invalid, but they are not rate limited).
    for (let i = 0; i < 3; i += 1) {
      await getCsrf(client)
      const response = await client.post('/api/auth/register', {})
      assert.equal(response.status, 400, `registration attempt ${i + 1} should not be rate limited`)
    }

    // The 4th attempt is rate limited.
    await getCsrf(client)
    const limited = await client.post('/api/auth/register', {})

    assert.equal(limited.status, 429)
    assert.equal(limited.body.error.code, 'REGISTRATION_RATE_LIMITED')
    assert.equal(typeof limited.headers['retry-after'], 'string')
    assert.equal(limited.headers['cache-control'], 'no-store')
  } finally {
    await harness.close()
  }
})

test('login and registration have separate rate limits', async (t) => {
  if (skip(t)) return
  const harness = await createHarness({
    loginRateLimit: { limit: 2 },
    registrationRateLimit: { limit: 2 },
  })

  try {
    const client = harness.client()

    // Exhaust the login limit.
    await getCsrf(client)
    await client.post('/api/auth/login', {
      email: 'nonexistent@example.com',
      password: PASSWORD,
    })
    await getCsrf(client)
    await client.post('/api/auth/login', {
      email: 'nonexistent@example.com',
      password: PASSWORD,
    })
    const loginLimited = await client.post('/api/auth/login', {
      email: 'nonexistent@example.com',
      password: PASSWORD,
    })
    assert.equal(loginLimited.status, 429)
    assert.equal(loginLimited.body.error.code, 'LOGIN_RATE_LIMITED')

    // Registration should still work (separate limit).
    await getCsrf(client)
    const registration = await client.post('/api/auth/register', {})
    assert.equal(registration.status, 400) // validation error, not rate limited
  } finally {
    await harness.close()
  }
})

test('login is keyed by IP and email: different emails have separate counters', async (t) => {
  if (skip(t)) return
  const harness = await createHarness({
    loginRateLimit: { limit: 2 },
  })

  try {
    const client = harness.client()

    // Exhaust the limit for email-a.
    await getCsrf(client)
    await client.post('/api/auth/login', {
      email: 'email-a@example.com',
      password: PASSWORD,
    })
    await getCsrf(client)
    await client.post('/api/auth/login', {
      email: 'email-a@example.com',
      password: PASSWORD,
    })
    const limitedForA = await client.post('/api/auth/login', {
      email: 'email-a@example.com',
      password: PASSWORD,
    })
    assert.equal(limitedForA.status, 429)
    assert.equal(limitedForA.body.error.code, 'LOGIN_RATE_LIMITED')

    // email-b from the same IP should still be allowed (separate counter).
    await getCsrf(client)
    const allowedForB = await client.post('/api/auth/login', {
      email: 'email-b@example.com',
      password: PASSWORD,
    })
    assert.equal(allowedForB.status, 401) // invalid credentials, not rate limited
  } finally {
    await harness.close()
  }
})

test('registration is keyed by IP only', async (t) => {
  if (skip(t)) return
  const harness = await createHarness({
    registrationRateLimit: { limit: 2 },
  })

  try {
    const client = harness.client()

    // Exhaust the IP-based registration limit with invalid bodies.
    await getCsrf(client)
    await client.post('/api/auth/register', {})
    await getCsrf(client)
    await client.post('/api/auth/register', {})
    const limited = await client.post('/api/auth/register', {})

    assert.equal(limited.status, 429)
    assert.equal(limited.body.error.code, 'REGISTRATION_RATE_LIMITED')
  } finally {
    await harness.close()
  }
})

test('429 response includes Retry-After and Cache-Control: no-store', async (t) => {
  if (skip(t)) return
  const harness = await createHarness({
    registrationRateLimit: { limit: 1 },
  })

  try {
    const client = harness.client()

    await getCsrf(client)
    await client.post('/api/auth/register', {})

    await getCsrf(client)
    const limited = await client.post('/api/auth/register', {})

    assert.equal(limited.status, 429)
    assert.equal(limited.headers['cache-control'], 'no-store')
    assert.ok(typeof limited.headers['retry-after'] === 'string')
    assert.ok(Number(limited.headers['retry-after']) > 0)
  } finally {
    await harness.close()
  }
})

test('CSRF is still enforced before the rate limiter runs', async (t) => {
  if (skip(t)) return
  const harness = await createHarness({
    registrationRateLimit: { limit: 5 },
  })

  try {
    const client = harness.client()
    await getCsrf(client)
    const cookie = client.cookie

    // Missing CSRF token: 403, request never reaches the rate limiter.
    const missingCsrf = await request({
      port: harness.port,
      method: 'POST',
      path: '/api/auth/register',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
      },
      body: { fullName: 'Ada', email: 'ada@example.com', password: PASSWORD },
    })
    assert.equal(missingCsrf.status, 403)
    assert.equal(missingCsrf.body.error.code, 'CSRF_TOKEN_INVALID')

    // The rate limiter counter should not have been incremented by the
    // CSRF-rejected request. A subsequent valid-CSRF request should still be
    // allowed.
    const validCsrf = await client.post('/api/auth/register', {
      fullName: 'Ada',
      email: 'ada@example.com',
      password: PASSWORD,
    })
    assert.equal(validCsrf.status, 201)
  } finally {
    await harness.close()
  }
})
