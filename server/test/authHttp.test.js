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
const { createAuthRouter } = require('../src/routes/auth')
const errorHandler = require('../src/middlewares/errorHandler')

const TEST_SECRET = 'test-only-session-secret-0123456789abcdef'
const SESSION_COOKIE = 'tafera.sid'
const PASSWORD = 'a sufficiently long passphrase'
const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE

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

const createHarness = async () => {
  const namespace = `tafera-auth-test-${crypto.randomUUID()}`
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

  const authService = createAuthService({ User, sessions, nodeEnv })
  app.use(
    '/api/auth',
    createAuthRouter({ authService, sessions, nodeEnv, User }),
  )
  app.use(errorHandler)

  const server = await startServer(app)

  return {
    namespace,
    index,
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
