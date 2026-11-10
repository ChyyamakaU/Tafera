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
const EmailVerificationTokenModel = require('../src/models/emailVerificationToken')
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
const {
  createAuthenticate,
} = require('../src/middlewares/authenticate')
const {
  createCsrfProtection,
} = require('../src/middlewares/csrfProtection')
const {
  createRequireVerifiedEmail,
} = require('../src/middlewares/requireVerifiedEmail')
const { createAuthService } = require('../src/services/authService')
const { createAuthRouter } = require('../src/routes/auth')
const { createEmailService } = require('../src/services/emailService')
const {
  createEmailVerificationService,
} = require('../src/services/emailVerificationService')
const errorHandler = require('../src/middlewares/errorHandler')

const TEST_SECRET = 'test-only-session-secret-0123456789abcdef'
const SESSION_COOKIE = 'tafera.sid'
const PASSWORD = 'a sufficiently long passphrase'
const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE

let base = null
let scoped = null
let User = null
let EmailVerificationToken = null
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

    schema = `tafera_auth_stage3_${process.pid}_${Date.now()}`
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
      `CREATE TABLE "${schema}".email_verification_tokens (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         user_id uuid NOT NULL REFERENCES "${schema}".users(id)
           ON DELETE CASCADE ON UPDATE CASCADE,
         token_hash varchar(64) NOT NULL,
         expires_at timestamptz NOT NULL,
         consumed_at timestamptz,
         created_at timestamptz NOT NULL DEFAULT now(),
         updated_at timestamptz NOT NULL DEFAULT now()
       )`,
    )
    await base.query(
      `CREATE UNIQUE INDEX email_verification_tokens_token_hash_unique
       ON "${schema}".email_verification_tokens (token_hash)`,
    )
    await base.query(
      `CREATE INDEX email_verification_tokens_user_created_at_idx
       ON "${schema}".email_verification_tokens (user_id, created_at)`,
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
    EmailVerificationToken = EmailVerificationTokenModel(
      scoped,
      DataTypes,
    )
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
})

const skip = (t) => {
  if (!databaseAvailable) {
    t.skip('PostgreSQL is unavailable; authentication integration test skipped')
    return true
  }
  if (!redisAvailable) {
    t.skip('Redis is unavailable; authentication integration test skipped')
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

const findCookie = (setCookies, name) =>
  setCookies.find((cookie) => cookie.startsWith(`${name}=`))

const rawCookiePair = (header) => header.split(';')[0]

const sessionIdFromCookie = (header) => {
  const value = decodeURIComponent(
    rawCookiePair(header).split('=').slice(1).join('='),
  )
  const unsigned = value.startsWith('s:') ? value.slice(2) : value
  return unsigned.split('.')[0]
}

const isCookieCleared = (header) =>
  /Expires=Thu, 01 Jan 1970 00:00:00 GMT/i.test(header) ||
  /Max-Age=0(;|$)/i.test(header)

const attributeValue = (header, name) => {
  const prefix = `${name.toLowerCase()}=`
  const part = header
    .split(';')
    .slice(1)
    .map((value) => value.trim())
    .find((value) => value.toLowerCase().startsWith(prefix))

  return part ? part.slice(prefix.length) : null
}

const hasAttribute = (header, attribute) => {
  const lower = attribute.toLowerCase()
  return header
    .split(';')
    .slice(1)
    .map((part) => part.trim().toLowerCase())
    .some((part) => part === lower || part.startsWith(`${lower}=`))
}

const cookieLifetime = (header) => {
  const expires = attributeValue(header, 'Expires')
  return expires === null ? null : Date.parse(expires) - Date.now()
}

const assertLifetimeApproximately = (
  header,
  expectedMs,
  toleranceMs = 5000,
) => {
  const lifetime = cookieLifetime(header)
  assert.ok(
    Math.abs(lifetime - expectedMs) <= toleranceMs,
    `expected a lifetime near ${expectedMs}ms, received ${lifetime}ms`,
  )
}

const createHttpClient = (port) => {
  let cookie = null
  let csrfToken = null

  const send = async (
    method,
    path,
    { body, csrf, cookie: cookieOverride } = {},
  ) => {
    const headers = {}
    const sentCookie =
      cookieOverride !== undefined ? cookieOverride : cookie

    if (sentCookie) {
      headers.Cookie = sentCookie
    }

    const sentToken =
      csrf === false ? undefined : csrf === undefined ? csrfToken : csrf

    if (sentToken) {
      headers['X-CSRF-Token'] = sentToken
    }

    const response = await request({
      port,
      method,
      path,
      headers,
      body,
    })

    const setCookie = findCookie(response.setCookies, SESSION_COOKIE)

    if (setCookie) {
      cookie = isCookieCleared(setCookie) ? null : rawCookiePair(setCookie)
    }

    if (response.body && response.body.data) {
      if (typeof response.body.data.csrfToken === 'string') {
        csrfToken = response.body.data.csrfToken
      }
    }

    return response
  }

  return {
    get: (path, options) => send('GET', path, options),
    post: (path, body, options = {}) => send('POST', path, { ...options, body }),
    get cookie() {
      return cookie
    },
    set cookie(value) {
      cookie = value
    },
    get csrfToken() {
      return csrfToken
    },
    set csrfToken(value) {
      csrfToken = value
    },
    get sessionId() {
      return cookie ? sessionIdFromCookie(cookie) : null
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

const createHarness = async ({
  emailTransport,
  resendCooldownMs = 0,
  tokenTtlMs = DAY,
  resendRateLimit = {},
} = {}) => {
  const namespace = `tafera-auth-test-${crypto.randomUUID()}`
  const index = createSessionIndex({ client: redisClient, namespace })
  const nodeEnv = 'development'
  const sentEmails = []
  const actionCalls = []
  const transport =
    emailTransport === undefined
      ? {
          async send(message) {
            sentEmails.push(message)
          },
        }
      : emailTransport
  const emailService = createEmailService({
    transport,
    clientUrl: 'http://localhost:5173',
  })
  const verificationService = createEmailVerificationService({
    User,
    EmailVerificationToken,
    emails: emailService,
    tokenTtlMs,
    resendCooldownMs,
  })

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

  // Representative community routes. The production API does not expose
  // community endpoints yet; this test-only router exercises the real
  // authenticate, CSRF and verified-email middleware stack that every
  // protected community write route must use.
  const authenticate = createAuthenticate({ User, sessions, nodeEnv })
  const csrfProtection = createCsrfProtection()
  const requireVerifiedEmail = createRequireVerifiedEmail({ User })
  const community = express.Router()

  community.get('/feed', (req, res) => {
    res
      .set('Cache-Control', 'no-store')
      .status(200)
      .json({ data: { items: [] } })
  })

  const protectedAction = (action) => (req, res) => {
    actionCalls.push(action)
    res
      .set('Cache-Control', 'no-store')
      .status(201)
      .json({ data: { action, userId: req.user.id } })
  }

  const protect = (path, action) =>
    community.post(
      path,
      authenticate,
      csrfProtection,
      requireVerifiedEmail,
      protectedAction(action),
    )

  protect('/posts', 'create_post')
  protect('/posts/:postId/comments', 'comment')
  protect('/users/:userId/follow', 'follow')
  protect('/trips', 'create_trip')
  protect('/trips/:tripId/join', 'join_trip')

  app.use('/api/community', community)

  const authService = createAuthService({
    User,
    sessions,
    nodeEnv,
    verifications: verificationService,
  })
  app.use(
    '/api/auth',
    createAuthRouter({
      authService,
      sessions,
      nodeEnv,
      User,
      verificationService,
      redisClient,
      rateLimitPrefix: `${namespace}:email-verification:`,
      resendRateLimit: {
        windowMs: 15 * MINUTE,
        limit: 3,
        ...resendRateLimit,
      },
    }),
  )
  app.use(errorHandler)

  const server = await startServer(app)

  return {
    namespace,
    index,
    sentEmails,
    actionCalls,
    verificationService,
    port: server.address().port,
    client: () => createHttpClient(server.address().port),
    close: async () => {
      await new Promise((resolve) => server.close(resolve))
      await cleanupNamespace(namespace)
    },
  }
}

const createUser = async (overrides = {}) => {
  const password = overrides.password || PASSWORD
  const passwordHash = await passwordService.hashPassword(password)

  return User.create({
    fullName: 'Ada Lovelace',
    email: 'ada@example.com',
    passwordHash,
    role: 'user',
    status: 'active',
    authVersion: 1,
    ...overrides,
    passwordHash,
  })
}

const getCsrf = async (client) => {
  const response = await client.get('/api/auth/csrf')
  assert.equal(response.status, 200)
  assert.equal(typeof response.body.data.csrfToken, 'string')
  return response
}

const registerUser = async (client, overrides = {}) => {
  const csrf = await getCsrf(client)
  const response = await client.post('/api/auth/register', {
    fullName: 'Ada Lovelace',
    email: 'ada@example.com',
    password: PASSWORD,
    ...overrides,
  })

  return { csrf, response }
}

const loginUser = async (client, email, password = PASSWORD) => {
  const csrf = await getCsrf(client)
  const response = await client.post('/api/auth/login', { email, password })
  return { csrf, response }
}

const verificationTokenFrom = (message) => {
  const match = /verify-email\?token=([A-Za-z0-9_-]+)/.exec(
    message && message.text ? message.text : '',
  )
  return match ? match[1] : null
}

const sha256 = (value) =>
  crypto.createHash('sha256').update(value, 'utf8').digest('hex')

const verifyEmail = (client, token) =>
  client.post('/api/auth/verify-email', { token })

const resendVerification = (client) =>
  client.post('/api/auth/verify-email/resend')

const assertSafeUser = (user) => {
  assert.equal(typeof user.id, 'string')
  assert.equal(Object.hasOwn(user, 'passwordHash'), false)
  assert.equal(Object.hasOwn(user, 'authVersion'), false)
  assert.equal(Object.hasOwn(user, 'emailVerifiedAt'), false)
}

test('registration creates a safe user, hashes the password and starts a session', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const client = harness.client()
    const csrf = await getCsrf(client)
    const anonymousSessionId = client.sessionId

    const response = await client.post('/api/auth/register', {
      fullName: '  Ada Lovelace ',
      email: '  ADA@Example.COM ',
      password: PASSWORD,
    })

    assert.equal(response.status, 201)
    assertSafeUser(response.body.data.user)
    assert.equal(response.body.data.user.fullName, 'Ada Lovelace')
    assert.equal(response.body.data.user.email, 'ada@example.com')
    assert.equal(response.body.data.user.role, 'user')
    assert.equal(response.body.data.user.status, 'active')
    assert.equal(typeof response.body.data.csrfToken, 'string')
    assert.notEqual(
      response.body.data.csrfToken,
      csrf.body.data.csrfToken,
    )

    const cookie = findCookie(response.setCookies, SESSION_COOKIE)
    assert.ok(cookie)
    assert.equal(hasAttribute(cookie, 'HttpOnly'), true)
    assert.equal(attributeValue(cookie, 'SameSite'), 'Lax')
    assert.equal(attributeValue(cookie, 'Path'), '/')
    assertLifetimeApproximately(cookie, DAY)

    assert.notEqual(client.sessionId, anonymousSessionId)
    const sessionId = client.sessionId

    const stored = await User.scope('withPassword').findOne({
      where: { email: 'ada@example.com' },
    })

    assert.ok(stored)
    assert.match(stored.passwordHash, /^\$argon2id\$/)
    assert.notEqual(stored.passwordHash, PASSWORD)
    assert.equal(
      await passwordService.verifyPassword(PASSWORD, stored.passwordHash),
      true,
    )
    assert.equal(JSON.stringify(response.body).includes('$argon2'), false)

    assert.equal(await harness.index.countSessions(stored.id), 1)
    assert.equal(
      await redisClient.exists(
        `${harness.index.sessionPrefix}${sessionId}`,
      ),
      1,
    )

    const me = await client.get('/api/auth/me')
    assert.equal(me.status, 200)
    assertSafeUser(me.body.data.user)
    assert.equal(me.body.data.user.email, 'ada@example.com')
  } finally {
    await harness.close()
  }
})

test('registration rejects invalid and weak input', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const client = harness.client()
    await getCsrf(client)

    for (const [body, expectedField] of [
      [{}, 'fullName'],
      [
        { fullName: 'Ada', email: 'not-an-email', password: PASSWORD },
        'email',
      ],
      [
        { fullName: 'Ada', email: 'ada@example.com', password: 'short' },
        'password',
      ],
    ]) {
      const response = await client.post('/api/auth/register', body)

      assert.equal(response.status, 400)
      assert.equal(response.body.error.code, 'VALIDATION_ERROR')
      assert.ok(
        response.body.error.details.some(
          (detail) => detail.field === expectedField,
        ),
      )
    }

    assert.equal(await User.count(), 0)
  } finally {
    await harness.close()
  }
})

test('duplicate registration is rejected case-insensitively', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const first = harness.client()
    const firstResult = await registerUser(first, {
      email: 'ada@example.com',
    })
    assert.equal(firstResult.response.status, 201)

    const second = harness.client()
    const secondResult = await registerUser(second, {
      email: 'ADA@EXAMPLE.COM',
    })

    assert.equal(secondResult.response.status, 409)
    assert.equal(secondResult.response.body.error.code, 'EMAIL_IN_USE')
    assert.equal(await User.count(), 1)
  } finally {
    await harness.close()
  }
})

test('public registration cannot assign administrator or protected fields', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const client = harness.client()
    const result = await registerUser(client, {
      role: 'admin',
      status: 'suspended',
      authVersion: 99,
      emailVerifiedAt: new Date().toISOString(),
      passwordHash: 'attacker-controlled',
    })

    assert.equal(result.response.status, 201)
    assert.equal(result.response.body.data.user.role, 'user')
    assert.equal(result.response.body.data.user.status, 'active')

    const stored = await User.scope('withPassword').findOne({
      where: { email: 'ada@example.com' },
    })

    assert.equal(stored.role, 'user')
    assert.equal(stored.status, 'active')
    assert.equal(stored.authVersion, 1)
    assert.match(stored.passwordHash, /^\$argon2id\$/)
    assert.equal(
      await passwordService.verifyPassword(PASSWORD, stored.passwordHash),
      true,
    )
  } finally {
    await harness.close()
  }
})

test('login regenerates the session, applies policy and registers the session', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser({ authVersion: 3 })
    const client = harness.client()
    const csrf = await getCsrf(client)
    const anonymousSessionId = client.sessionId

    const response = await client.post('/api/auth/login', {
      email: 'ADA@EXAMPLE.COM',
      password: PASSWORD,
    })

    assert.equal(response.status, 200)
    assertSafeUser(response.body.data.user)
    assert.equal(response.body.data.user.id, user.id)
    assert.notEqual(client.sessionId, anonymousSessionId)
    assert.notEqual(
      response.body.data.csrfToken,
      csrf.body.data.csrfToken,
    )

    const cookie = findCookie(response.setCookies, SESSION_COOKIE)
    assert.ok(cookie)
    assertLifetimeApproximately(cookie, DAY)

    const sessionId = client.sessionId
    const raw = await redisClient.get(
      `${harness.index.sessionPrefix}${sessionId}`,
    )
    const storedSession = JSON.parse(raw)

    assert.equal(storedSession.userId, user.id)
    assert.equal(storedSession.authVersion, 3)
    assert.equal(storedSession.roleAtLogin, 'user')
    assert.equal(typeof storedSession.csrfSecret, 'string')
    assert.equal(Object.hasOwn(storedSession, 'email'), false)
    assert.equal(Object.hasOwn(storedSession, 'passwordHash'), false)

    assert.equal(await harness.index.countSessions(user.id), 1)

    const me = await client.get('/api/auth/me')
    assert.equal(me.status, 200)
    assert.equal(me.body.data.user.id, user.id)
  } finally {
    await harness.close()
  }
})

test('unknown email and wrong password return the same generic error', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()

    const wrongPasswordClient = harness.client()
    const wrongPassword = await loginUser(
      wrongPasswordClient,
      user.email,
      'the wrong password',
    )

    const unknownClient = harness.client()
    const unknown = await loginUser(
      unknownClient,
      'missing@example.com',
      PASSWORD,
    )

    for (const response of [wrongPassword.response, unknown.response]) {
      assert.equal(response.status, 401)
      assert.equal(response.body.error.code, 'INVALID_CREDENTIALS')
      assert.equal(response.body.error.message, 'Invalid email or password.')
    }

    assert.equal(wrongPassword.response.body.error.message, unknown.response.body.error.message)
    assert.equal(await harness.index.countSessions(user.id), 0)
  } finally {
    await harness.close()
  }
})

test('suspended accounts cannot log in', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser({ status: 'suspended' })
    const client = harness.client()
    const result = await loginUser(client, user.email)

    assert.equal(result.response.status, 403)
    assert.equal(result.response.body.error.code, 'ACCOUNT_INACTIVE')
    assert.equal(await harness.index.countSessions(user.id), 0)
  } finally {
    await harness.close()
  }
})

test('admin sessions receive the shorter admin policy', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const admin = await createUser({
      email: 'admin@example.com',
      role: 'admin',
    })
    const client = harness.client()
    const result = await loginUser(client, admin.email)

    assert.equal(result.response.status, 200)
    const cookie = findCookie(result.response.setCookies, SESSION_COOKIE)
    assertLifetimeApproximately(cookie, 30 * MINUTE)

    const me = await client.get('/api/auth/me')
    assert.equal(me.status, 200)
    assert.equal(me.body.data.user.role, 'admin')
  } finally {
    await harness.close()
  }
})

test('the eleventh login revokes the oldest session', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const clients = []
    const sessionIds = []

    for (let i = 0; i < 11; i += 1) {
      const client = harness.client()
      const result = await loginUser(client, user.email)
      assert.equal(result.response.status, 200)
      clients.push(client)
      sessionIds.push(client.sessionId)
    }

    assert.equal(await harness.index.countSessions(user.id), 10)
    assert.equal(
      await redisClient.exists(
        `${harness.index.sessionPrefix}${sessionIds[0]}`,
      ),
      0,
    )
    assert.equal(
      await redisClient.exists(
        `${harness.index.sessionPrefix}${sessionIds[10]}`,
      ),
      1,
    )

    const revoked = await clients[0].get('/api/auth/me')
    assert.equal(revoked.status, 401)
  } finally {
    await harness.close()
  }
})

test('CSRF tokens protect state-changing routes but not safe methods', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const client = harness.client()
    await getCsrf(client)

    const missing = await client.post(
      '/api/auth/register',
      {
        fullName: 'Ada Lovelace',
        email: 'ada@example.com',
        password: PASSWORD,
      },
      { csrf: false },
    )
    assert.equal(missing.status, 403)
    assert.equal(missing.body.error.code, 'CSRF_TOKEN_INVALID')

    const invalid = await client.post(
      '/api/auth/register',
      {
        fullName: 'Ada Lovelace',
        email: 'ada@example.com',
        password: PASSWORD,
      },
      { csrf: 'not-a-valid-token' },
    )
    assert.equal(invalid.status, 403)
    assert.equal(invalid.body.error.code, 'CSRF_TOKEN_INVALID')

    const safeMethod = await client.get('/api/auth/me', { csrf: false })
    assert.equal(safeMethod.status, 401)
    assert.equal(safeMethod.body.error.code, 'AUTH_REQUIRED')

    const registered = await client.post('/api/auth/register', {
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      password: PASSWORD,
    })
    assert.equal(registered.status, 201)
    assert.equal(typeof client.csrfToken, 'string')
  } finally {
    await harness.close()
  }
})

test('registration rotates CSRF tokens so the anonymous token is invalid', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const client = harness.client()
    const csrf = await getCsrf(client)
    const oldToken = csrf.body.data.csrfToken

    const registered = await client.post('/api/auth/register', {
      fullName: 'Ada Lovelace',
      email: 'ada@example.com',
      password: PASSWORD,
    })
    assert.equal(registered.status, 201)

    const withOldToken = await client.post(
      '/api/auth/logout',
      undefined,
      { csrf: oldToken },
    )
    assert.equal(withOldToken.status, 403)
    assert.equal(withOldToken.body.error.code, 'CSRF_TOKEN_INVALID')

    const withNewToken = await client.post('/api/auth/logout')
    assert.equal(withNewToken.status, 204)
  } finally {
    await harness.close()
  }
})

test('logout destroys the session, clears the index and is idempotent', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser()
    const client = harness.client()
    const result = await loginUser(client, user.email)
    assert.equal(result.response.status, 200)

    const sessionId = client.sessionId
    const oldCookie = client.cookie

    const logout = await client.post('/api/auth/logout')
    assert.equal(logout.status, 204)

    const cleared = findCookie(logout.setCookies, SESSION_COOKIE)
    assert.ok(cleared)
    assert.equal(isCookieCleared(cleared), true)
    assert.equal(hasAttribute(cleared, 'HttpOnly'), true)
    assert.equal(attributeValue(cleared, 'SameSite'), 'Lax')
    assert.equal(attributeValue(cleared, 'Path'), '/')

    assert.equal(
      await redisClient.exists(
        `${harness.index.sessionPrefix}${sessionId}`,
      ),
      0,
    )
    assert.equal(await harness.index.countSessions(user.id), 0)

    const me = await client.get('/api/auth/me', {
      cookie: oldCookie,
      csrf: false,
    })
    assert.equal(me.status, 401)

    const repeated = await client.post('/api/auth/logout', undefined, {
      cookie: oldCookie,
      csrf: false,
    })
    assert.equal(repeated.status, 204)
  } finally {
    await harness.close()
  }
})

test('the full register, authenticate, logout lifecycle works', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const client = harness.client()

    const registered = await registerUser(client)
    assert.equal(registered.response.status, 201)

    const me = await client.get('/api/auth/me')
    assert.equal(me.status, 200)
    assert.equal(me.body.data.user.email, 'ada@example.com')

    const logout = await client.post('/api/auth/logout')
    assert.equal(logout.status, 204)

    const afterLogout = await client.get('/api/auth/me')
    assert.equal(afterLogout.status, 401)
    assert.equal(afterLogout.body.error.code, 'AUTH_REQUIRED')
  } finally {
    await harness.close()
  }
})

test('missing, expired and revoked sessions are rejected', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const missingClient = harness.client()
    const missing = await missingClient.get('/api/auth/me')
    assert.equal(missing.status, 401)
    assert.equal(missing.body.error.code, 'AUTH_REQUIRED')

    const user = await createUser()

    const expiredClient = harness.client()
    const expiredLogin = await loginUser(expiredClient, user.email)
    assert.equal(expiredLogin.response.status, 200)
    const expiredSessionId = expiredClient.sessionId
    const raw = await redisClient.get(
      `${harness.index.sessionPrefix}${expiredSessionId}`,
    )
    const stored = JSON.parse(raw)
    stored.absoluteExpiresAt = Date.now() - 1000
    stored.lastSeenAt = Date.now()
    await redisClient.set(
      `${harness.index.sessionPrefix}${expiredSessionId}`,
      JSON.stringify(stored),
      { EX: 60 * 60 },
    )

    const expired = await expiredClient.get('/api/auth/me')
    assert.equal(expired.status, 401)
    assert.equal(
      isCookieCleared(findCookie(expired.setCookies, SESSION_COOKIE)),
      true,
    )

    const revokedClient = harness.client()
    const revokedLogin = await loginUser(revokedClient, user.email)
    assert.equal(revokedLogin.response.status, 200)
    await harness.index.revokeAllSessions(user.id)

    const revoked = await revokedClient.get('/api/auth/me')
    assert.equal(revoked.status, 401)
  } finally {
    await harness.close()
  }
})

test('missing users and suspended users invalidate active sessions', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const missingUser = await createUser({ email: 'missing@example.com' })
    const missingClient = harness.client()
    const missingLogin = await loginUser(missingClient, missingUser.email)
    assert.equal(missingLogin.response.status, 200)

    await User.destroy({ where: { id: missingUser.id } })
    const missing = await missingClient.get('/api/auth/me')
    assert.equal(missing.status, 401)
    assert.equal(missing.body.error.code, 'SESSION_INVALID')
    assert.equal(await harness.index.countSessions(missingUser.id), 0)

    const suspendedUser = await createUser({ email: 'suspended@example.com' })
    const suspendedClient = harness.client()
    const suspendedLogin = await loginUser(
      suspendedClient,
      suspendedUser.email,
    )
    assert.equal(suspendedLogin.response.status, 200)

    await User.update(
      { status: 'suspended' },
      { where: { id: suspendedUser.id } },
    )

    const suspended = await suspendedClient.get('/api/auth/me')
    assert.equal(suspended.status, 403)
    assert.equal(suspended.body.error.code, 'ACCOUNT_INACTIVE')
    assert.equal(await harness.index.countSessions(suspendedUser.id), 0)
  } finally {
    await harness.close()
  }
})

test('authVersion changes revoke existing sessions', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser({ authVersion: 5 })
    const client = harness.client()
    const login = await loginUser(client, user.email)
    assert.equal(login.response.status, 200)

    const sessionId = client.sessionId

    await User.update(
      { authVersion: 6 },
      { where: { id: user.id } },
    )

    const response = await client.get('/api/auth/me')
    assert.equal(response.status, 401)
    assert.equal(response.body.error.code, 'SESSION_INVALID')
    assert.equal(
      isCookieCleared(findCookie(response.setCookies, SESSION_COOKIE)),
      true,
    )

    assert.equal(await harness.index.countSessions(user.id), 0)
    assert.equal(
      await redisClient.exists(
        `${harness.index.sessionPrefix}${sessionId}`,
      ),
      0,
    )
  } finally {
    await harness.close()
  }
})

test('registration creates an unverified account and emails a hashed verification token', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const client = harness.client()
    const { response } = await registerUser(client)

    assert.equal(response.status, 201)
    assert.equal(response.body.data.user.emailVerified, false)
    assert.equal(harness.sentEmails.length, 1)

    const stored = await User.findOne({ where: { email: 'ada@example.com' } })
    assert.ok(stored)
    assert.equal(stored.emailVerifiedAt, null)

    const message = harness.sentEmails[0]
    assert.equal(message.to, 'ada@example.com')
    assert.match(message.subject, /verify/i)
    assert.match(
      message.text,
      /http:\/\/localhost:5173\/verify-email\?token=/,
    )

    const token = verificationTokenFrom(message)
    assert.ok(token)
    assert.equal(JSON.stringify(response.body).includes(token), false)

    const tokenRow = await EmailVerificationToken.findOne({
      where: { userId: stored.id },
    })
    assert.ok(tokenRow)
    assert.equal(tokenRow.tokenHash, undefined)
    assert.equal(tokenRow.consumedAt, null)
    assert.ok(tokenRow.expiresAt.getTime() > Date.now())

    const withHash = await EmailVerificationToken.scope(
      'withTokenHash',
    ).findOne({ where: { userId: stored.id } })
    assert.equal(withHash.tokenHash, sha256(token))
    assert.notEqual(withHash.tokenHash, token)
  } finally {
    await harness.close()
  }
})

test('a valid verification token marks the user verified and cannot be reused', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const client = harness.client()
    const { response } = await registerUser(client)
    assert.equal(response.status, 201)

    const token = verificationTokenFrom(harness.sentEmails[0])
    assert.ok(token)

    // Verification uses the emailed token, not the session cookie.
    const verifier = harness.client()
    const verified = await verifyEmail(verifier, token)

    assert.equal(verified.status, 200)
    assert.equal(verified.body.data.user.emailVerified, true)
    assert.equal(
      Object.hasOwn(verified.body.data.user, 'emailVerifiedAt'),
      false,
    )
    assert.equal(JSON.stringify(verified.body).includes(token), false)

    const stored = await User.findOne({ where: { email: 'ada@example.com' } })
    assert.ok(stored.emailVerifiedAt instanceof Date)

    const tokenRow = await EmailVerificationToken.scope(
      'withTokenHash',
    ).findOne({ where: { userId: stored.id } })
    assert.ok(tokenRow.consumedAt instanceof Date)

    const reused = await verifyEmail(harness.client(), token)
    assert.equal(reused.status, 400)
    assert.equal(reused.body.error.code, 'VERIFICATION_TOKEN_INVALID')

    const me = await client.get('/api/auth/me')
    assert.equal(me.status, 200)
    assert.equal(me.body.data.user.emailVerified, true)
  } finally {
    await harness.close()
  }
})

test('invalid, missing and expired verification tokens are rejected safely', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const client = harness.client()
    await registerUser(client)
    const token = verificationTokenFrom(harness.sentEmails[0])
    const user = await User.findOne({ where: { email: 'ada@example.com' } })

    const invalid = await verifyEmail(harness.client(), 'A'.repeat(43))
    assert.equal(invalid.status, 400)
    assert.equal(invalid.body.error.code, 'VERIFICATION_TOKEN_INVALID')

    const missing = await harness.client().post('/api/auth/verify-email', {})
    assert.equal(missing.status, 400)
    assert.equal(missing.body.error.code, 'VALIDATION_ERROR')

    await EmailVerificationToken.update(
      { expiresAt: new Date(Date.now() - 1000) },
      { where: { userId: user.id } },
    )

    const expired = await verifyEmail(harness.client(), token)
    assert.equal(expired.status, 400)
    assert.equal(expired.body.error.code, 'VERIFICATION_TOKEN_INVALID')

    await user.reload()
    assert.equal(user.emailVerifiedAt, null)
  } finally {
    await harness.close()
  }
})

test('concurrent verification requests consume the token only once', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const client = harness.client()
    await registerUser(client)
    const token = verificationTokenFrom(harness.sentEmails[0])

    const [first, second] = await Promise.all([
      verifyEmail(harness.client(), token),
      verifyEmail(harness.client(), token),
    ])

    assert.deepEqual(
      [first.status, second.status].sort((a, b) => a - b),
      [200, 400],
    )

    const user = await User.findOne({ where: { email: 'ada@example.com' } })
    assert.ok(user.emailVerifiedAt instanceof Date)

    const tokens = await EmailVerificationToken.findAll({
      where: { userId: user.id },
    })
    assert.equal(tokens.length, 1)
    assert.ok(tokens[0].consumedAt instanceof Date)
  } finally {
    await harness.close()
  }
})

test('resend invalidates the previous token and sends a new link', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const client = harness.client()
    await registerUser(client)
    assert.equal(harness.sentEmails.length, 1)
    const firstToken = verificationTokenFrom(harness.sentEmails[0])

    const resend = await resendVerification(client)
    assert.equal(resend.status, 202)
    assert.equal(resend.body.data.sent, true)
    assert.equal(harness.sentEmails.length, 2)

    const secondToken = verificationTokenFrom(harness.sentEmails[1])
    assert.ok(secondToken)
    assert.notEqual(secondToken, firstToken)

    const oldTokenResponse = await verifyEmail(
      harness.client(),
      firstToken,
    )
    assert.equal(oldTokenResponse.status, 400)

    const newTokenResponse = await verifyEmail(
      harness.client(),
      secondToken,
    )
    assert.equal(newTokenResponse.status, 200)
  } finally {
    await harness.close()
  }
})

test('resend requires authentication and CSRF and is rate limited', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const anonymous = harness.client()
    const unauthenticated = await resendVerification(anonymous)
    assert.equal(unauthenticated.status, 401)
    assert.equal(unauthenticated.body.error.code, 'AUTH_REQUIRED')

    const client = harness.client()
    await registerUser(client)

    const missingCsrf = await client.post(
      '/api/auth/verify-email/resend',
      undefined,
      { csrf: false },
    )
    assert.equal(missingCsrf.status, 403)
    assert.equal(missingCsrf.body.error.code, 'CSRF_TOKEN_INVALID')

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await resendVerification(client)
      assert.equal(response.status, 202)
    }

    const limited = await resendVerification(client)
    assert.equal(limited.status, 429)
    assert.equal(
      limited.body.error.code,
      'EMAIL_VERIFICATION_RATE_LIMITED',
    )
    assert.equal(typeof limited.headers['retry-after'], 'string')
  } finally {
    await harness.close()
  }
})

test('resend applies a per-account cooldown without invalidating the current token', async (t) => {
  if (skip(t)) return
  const harness = await createHarness({ resendCooldownMs: 60 * 1000 })

  try {
    const client = harness.client()
    await registerUser(client)
    const firstToken = verificationTokenFrom(harness.sentEmails[0])

    const limited = await resendVerification(client)
    assert.equal(limited.status, 429)
    assert.equal(
      limited.body.error.code,
      'EMAIL_VERIFICATION_RATE_LIMITED',
    )
    assert.equal(typeof limited.headers['retry-after'], 'string')
    assert.equal(harness.sentEmails.length, 1)

    const verified = await verifyEmail(harness.client(), firstToken)
    assert.equal(verified.status, 200)
  } finally {
    await harness.close()
  }
})

test('already-verified accounts do not receive another email', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const client = harness.client()
    await registerUser(client)
    const token = verificationTokenFrom(harness.sentEmails[0])
    assert.equal((await verifyEmail(harness.client(), token)).status, 200)
    assert.equal(harness.sentEmails.length, 1)

    const resend = await resendVerification(client)
    assert.equal(resend.status, 200)
    assert.equal(resend.body.data.alreadyVerified, true)
    assert.equal(resend.body.data.sent, false)
    assert.equal(harness.sentEmails.length, 1)

    const user = await User.findOne({ where: { email: 'ada@example.com' } })
    assert.equal(
      await EmailVerificationToken.count({ where: { userId: user.id } }),
      1,
    )
  } finally {
    await harness.close()
  }
})

test('registration survives email delivery failure without inconsistent state', async (t) => {
  if (skip(t)) return
  const attempts = []
  const harness = await createHarness({
    emailTransport: {
      async send(message) {
        attempts.push(message.to)
        throw new Error('provider unavailable')
      },
    },
  })

  try {
    const client = harness.client()
    const { response } = await registerUser(client)

    assert.equal(response.status, 201)
    assert.equal(response.body.data.user.emailVerified, false)
    assert.deepEqual(attempts, ['ada@example.com'])
    assert.equal(harness.sentEmails.length, 0)

    const user = await User.findOne({ where: { email: 'ada@example.com' } })
    assert.ok(user)
    assert.equal(user.emailVerifiedAt, null)
    assert.equal(
      await EmailVerificationToken.count({ where: { userId: user.id } }),
      1,
    )

    const me = await client.get('/api/auth/me')
    assert.equal(me.status, 200)
    assert.equal(me.body.data.user.emailVerified, false)

    const resend = await resendVerification(client)
    assert.equal(resend.status, 503)
    assert.equal(resend.body.error.code, 'EMAIL_DELIVERY_UNAVAILABLE')
    assert.equal(JSON.stringify(resend.body).includes('provider unavailable'), false)
  } finally {
    await harness.close()
  }
})

test('resend reports unavailable when no email provider is configured', async (t) => {
  if (skip(t)) return
  const harness = await createHarness({ emailTransport: null })

  try {
    const client = harness.client()
    const { response } = await registerUser(client)

    assert.equal(response.status, 201)
    assert.equal(response.body.data.user.emailVerified, false)

    const resend = await resendVerification(client)
    assert.equal(resend.status, 503)
    assert.equal(resend.body.error.code, 'EMAIL_DELIVERY_UNAVAILABLE')
    assert.equal(harness.sentEmails.length, 0)
  } finally {
    await harness.close()
  }
})

// Mirrors the protected community actions listed for verified-account
// enforcement. The production API has no community routers yet, so these
// paths are mounted by the test harness with the real authenticate, CSRF and
// requireVerifiedEmail middleware.
const PROTECTED_COMMUNITY_ACTIONS = [
  ['/api/community/posts', { content: 'A new post' }, 'create_post'],
  [
    '/api/community/posts/00000000-0000-0000-0000-000000000001/comments',
    { content: 'A comment' },
    'comment',
  ],
  [
    '/api/community/users/00000000-0000-0000-0000-000000000002/follow',
    {},
    'follow',
  ],
  ['/api/community/trips', { title: 'A trip' }, 'create_trip'],
  [
    '/api/community/trips/00000000-0000-0000-0000-000000000003/join',
    {},
    'join_trip',
  ],
]

test('verified users can perform every protected community action', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const client = harness.client()
    const { response } = await registerUser(client)
    assert.equal(response.status, 201)

    const token = verificationTokenFrom(harness.sentEmails[0])
    assert.equal((await verifyEmail(harness.client(), token)).status, 200)

    const user = await User.findOne({ where: { email: 'ada@example.com' } })
    assert.ok(user.emailVerifiedAt instanceof Date)

    for (const [path, body, action] of PROTECTED_COMMUNITY_ACTIONS) {
      const result = await client.post(path, body)

      assert.equal(
        result.status,
        201,
        `${action} failed: ${JSON.stringify(result.body)}`,
      )
      assert.equal(result.body.data.action, action)
      assert.equal(result.body.data.userId, user.id)
    }

    // Protected actions do not create additional sessions.
    assert.equal(await harness.index.countSessions(user.id), 1)
    assert.deepEqual(
      harness.actionCalls,
      PROTECTED_COMMUNITY_ACTIONS.map(([, , action]) => action),
    )
  } finally {
    await harness.close()
  }
})

test('unverified users are blocked from every protected action with a consistent error', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const client = harness.client()
    const { response } = await registerUser(client)
    assert.equal(response.status, 201)
    assert.equal(response.body.data.user.emailVerified, false)

    const errors = []

    for (const [path, body, action] of PROTECTED_COMMUNITY_ACTIONS) {
      const result = await client.post(path, body)

      assert.equal(result.status, 403, `${action} was not blocked`)
      errors.push({
        code: result.body.error.code,
        message: result.body.error.message,
        status: result.body.error.status,
      })
    }

    for (const error of errors) {
      assert.deepEqual(error, {
        code: 'EMAIL_VERIFICATION_REQUIRED',
        message:
          'Please verify your email address before performing this action.',
        status: 403,
      })
    }

    const user = await User.findOne({ where: { email: 'ada@example.com' } })
    assert.equal(user.emailVerifiedAt, null)
    assert.equal(harness.actionCalls.length, 0)
  } finally {
    await harness.close()
  }
})

test('unverified users can register, log in, read their account and browse public content', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const client = harness.client()
    const { response } = await registerUser(client)

    assert.equal(response.status, 201)
    assert.equal(response.body.data.user.emailVerified, false)

    const feed = await client.get('/api/community/feed')
    assert.equal(feed.status, 200)

    const me = await client.get('/api/auth/me')
    assert.equal(me.status, 200)
    assert.equal(me.body.data.user.emailVerified, false)

    // An unverified account may still request another verification email.
    const resend = await resendVerification(client)
    assert.equal(resend.status, 202)

    const logout = await client.post('/api/auth/logout')
    assert.equal(logout.status, 204)

    // Logging in again is allowed while still unverified.
    const login = await loginUser(client, 'ada@example.com')
    assert.equal(login.response.status, 200)
    assert.equal(login.response.body.data.user.emailVerified, false)

    const afterLoginMe = await client.get('/api/auth/me')
    assert.equal(afterLoginMe.status, 200)
    assert.equal(afterLoginMe.body.data.user.emailVerified, false)

    const afterLoginFeed = await client.get('/api/community/feed')
    assert.equal(afterLoginFeed.status, 200)

    const blocked = await client.post('/api/community/posts', {
      content: 'Still unverified',
    })
    assert.equal(blocked.status, 403)
    assert.equal(
      blocked.body.error.code,
      'EMAIL_VERIFICATION_REQUIRED',
    )

    // The verification endpoint remains available to the unverified account.
    const latestToken = verificationTokenFrom(
      harness.sentEmails[harness.sentEmails.length - 1],
    )
    const verified = await verifyEmail(harness.client(), latestToken)
    assert.equal(verified.status, 200)

    const meAfterVerification = await client.get('/api/auth/me')
    assert.equal(meAfterVerification.status, 200)
    assert.equal(meAfterVerification.body.data.user.emailVerified, true)
  } finally {
    await harness.close()
  }
})

test('verification changes take effect immediately from the database without re-login', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const client = harness.client()
    await registerUser(client)

    const token = verificationTokenFrom(harness.sentEmails[0])
    const user = await User.findOne({ where: { email: 'ada@example.com' } })

    const before = await client.post('/api/community/posts', {
      content: 'Before verification',
    })
    assert.equal(before.status, 403)
    assert.equal(before.body.error.code, 'EMAIL_VERIFICATION_REQUIRED')

    // Verified through a separate client that has no session. The original
    // session must pick up the change without logging in again.
    assert.equal((await verifyEmail(harness.client(), token)).status, 200)

    const after = await client.post('/api/community/posts', {
      content: 'After verification',
    })
    assert.equal(after.status, 201)

    // Revoking the verification directly in PostgreSQL must block the same
    // session on its very next request.
    await User.update(
      { emailVerifiedAt: null },
      { where: { id: user.id } },
    )

    const revoked = await client.post('/api/community/posts', {
      content: 'Verification revoked',
    })
    assert.equal(revoked.status, 403)
    assert.equal(revoked.body.error.code, 'EMAIL_VERIFICATION_REQUIRED')

    // Restoring it (for example by a verification completed elsewhere) must
    // grant access immediately as well.
    await User.update(
      { emailVerifiedAt: new Date() },
      { where: { id: user.id } },
    )

    const restored = await client.post('/api/community/posts', {
      content: 'Verification restored',
    })
    assert.equal(restored.status, 201)
  } finally {
    await harness.close()
  }
})

test('unauthenticated users receive AUTH_REQUIRED for protected actions', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const anonymous = harness.client()

    for (const [path, body, action] of PROTECTED_COMMUNITY_ACTIONS) {
      const result = await anonymous.post(path, body, { csrf: false })

      assert.equal(result.status, 401, `${action} was not rejected`)
      assert.equal(result.body.error.code, 'AUTH_REQUIRED')
    }

    assert.equal(harness.actionCalls.length, 0)
  } finally {
    await harness.close()
  }
})

test('frontend-supplied verification status is never trusted', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const client = harness.client()
    await registerUser(client)

    const forgedTimestamp = new Date().toISOString()
    const response = await request({
      port: harness.port,
      method: 'POST',
      path: '/api/community/posts',
      headers: {
        Cookie: client.cookie,
        'X-CSRF-Token': client.csrfToken,
        'X-Email-Verified': 'true',
        'X-Email-Verified-At': forgedTimestamp,
      },
      body: {
        content: 'Forged verification',
        emailVerified: true,
        emailVerifiedAt: forgedTimestamp,
      },
    })

    assert.equal(response.status, 403)
    assert.equal(
      response.body.error.code,
      'EMAIL_VERIFICATION_REQUIRED',
    )

    const user = await User.findOne({ where: { email: 'ada@example.com' } })
    assert.equal(user.emailVerifiedAt, null)
  } finally {
    await harness.close()
  }
})

test('protected actions still require CSRF and a valid session', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const client = harness.client()
    await registerUser(client)

    const token = verificationTokenFrom(harness.sentEmails[0])
    assert.equal((await verifyEmail(harness.client(), token)).status, 200)

    const missingCsrf = await client.post(
      '/api/community/posts',
      { content: 'No CSRF' },
      { csrf: false },
    )
    assert.equal(missingCsrf.status, 403)
    assert.equal(missingCsrf.body.error.code, 'CSRF_TOKEN_INVALID')

    const invalidCsrf = await client.post(
      '/api/community/posts',
      { content: 'Wrong CSRF' },
      { csrf: 'not-the-real-token' },
    )
    assert.equal(invalidCsrf.status, 403)
    assert.equal(invalidCsrf.body.error.code, 'CSRF_TOKEN_INVALID')

    const user = await User.findOne({ where: { email: 'ada@example.com' } })
    await User.update({ authVersion: 77 }, { where: { id: user.id } })

    const revoked = await client.post('/api/community/posts', {
      content: 'Revoked session',
    })
    assert.equal(revoked.status, 401)
    assert.equal(revoked.body.error.code, 'SESSION_INVALID')
  } finally {
    await harness.close()
  }
})

test('the verified-email guard does not authenticate requests by itself', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const app = express()
    app.use(express.json())
    app.use(cookieParser())
    app.use(
      createRequireVerifiedEmail({ User }),
    )
    app.post('/api/community/posts', (req, res) => {
      res.status(201).json({ data: { userId: req.user.id } })
    })
    app.use(errorHandler)

    const server = await startServer(app)

    try {
      const response = await request({
        port: server.address().port,
        method: 'POST',
        path: '/api/community/posts',
        body: { content: 'No session', emailVerified: true },
      })

      assert.equal(response.status, 401)
      assert.equal(response.body.error.code, 'AUTH_REQUIRED')
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  } finally {
    await harness.close()
  }
})
