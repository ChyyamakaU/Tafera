'use strict'

process.env.NODE_ENV = 'test'
process.env.SESSION_SECRET =
  'test-only-session-secret-0123456789abcdef'
process.env.DB_NAME = process.env.DB_NAME || 'tafera_test'
process.env.DB_USER = process.env.DB_USER || 'tafera_test_user'
process.env.ARGON2_MAX_QUEUE = '50'

const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const crypto = require('node:crypto')
const express = require('express')
const cookieParser = require('cookie-parser')
const { createClient } = require('redis')
const { createSessionMiddleware } = require('../src/config/session')
const { createSessionPolicy } = require('../src/middlewares/sessionPolicy')
const { createSessionIndex } = require('../src/services/sessionIndex')
const {
  createAuthenticatedSession,
  createAnonymousSession,
  destroySession,
} = require('../src/services/sessionService')
const errorHandler = require('../src/middlewares/errorHandler')

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
const TEST_SECRET = 'test-only-session-secret-0123456789abcdef'
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const TEST_USER = Object.freeze({
  id: '00000000-0000-0000-0000-000000000001',
  role: 'user',
  authVersion: 1,
  email: 'must-not-be-stored@example.com',
  passwordHash: 'must-not-be-stored',
  fullName: 'Must Not Be Stored',
})

const TEST_ADMIN = Object.freeze({
  id: '00000000-0000-0000-0000-000000000002',
  role: 'admin',
  authVersion: 4,
})

let client = null
let redisAvailable = false
const openServers = new Set()

before(async () => {
  client = createClient({ url: REDIS_URL })
  client.on('error', () => {})

  try {
    await client.connect()
    await client.ping()
    redisAvailable = true
  } catch {
    redisAvailable = false
    try {
      client.destroy()
    } catch {
      // ignore
    }
    client = null
  }
})

after(async () => {
  for (const server of openServers) {
    await new Promise((resolve) => server.close(resolve))
  }
  openServers.clear()

  if (client && client.isOpen) {
    await client.quit().catch(() => {})
  }
})

const skipWithoutRedis = (t) => {
  if (redisAvailable) return false
  t.skip('Redis is unavailable; session HTTP integration test skipped')
  return true
}

const sessionView = (session) => {
  if (!session) return null

  const { cookie, ...data } = session

  return {
    data,
    cookie: cookie
      ? {
          maxAge: cookie.maxAge,
          secure: cookie.secure,
          httpOnly: cookie.httpOnly,
          sameSite: cookie.sameSite,
          path: cookie.path,
          domain: cookie.domain,
        }
      : null,
  }
}

const createApp = ({
  nodeEnv,
  trustProxy,
  namespace,
  index,
  storeClient = client,
}) => {
  const app = express()
  app.set('trust proxy', trustProxy)
  app.use(cookieParser())
  app.use(
    createSessionMiddleware({
      nodeEnv,
      namespace,
      client: storeClient,
      secret: TEST_SECRET,
    }),
  )
  app.use(createSessionPolicy({ nodeEnv, index }))

  const route = (handler) => async (req, res, next) => {
    try {
      await handler(req, res)
    } catch (err) {
      next(err)
    }
  }

  app.post(
    '/anonymous',
    route(async (req, res) => {
      await createAnonymousSession(req, { nodeEnv, index })
      res.json({ session: sessionView(req.session) })
    }),
  )

  app.post(
    '/login',
    route(async (req, res) => {
      await createAuthenticatedSession(req, TEST_USER, { nodeEnv, index })
      res.json({ session: sessionView(req.session) })
    }),
  )

  app.post(
    '/login-admin',
    route(async (req, res) => {
      await createAuthenticatedSession(req, TEST_ADMIN, { nodeEnv, index })
      res.json({ session: sessionView(req.session) })
    }),
  )

  app.get('/session', (req, res) => {
    res.json({ session: sessionView(req.session) })
  })

  app.post(
    '/logout',
    route(async (req, res) => {
      const result = await destroySession(req, { res, nodeEnv, index })
      res.json(result)
    }),
  )

  app.use(errorHandler)

  return app
}

const startServer = async (app) => {
  const server = app.listen(0, '127.0.0.1')

  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })

  openServers.add(server)

  return {
    port: server.address().port,
    close: async () => {
      openServers.delete(server)
      await new Promise((resolve) => server.close(resolve))
    },
  }
}

const request = ({ port, method = 'GET', path = '/', headers = {} }) =>
  new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, method, path, headers },
      (res) => {
        let raw = ''
        res.on('data', (chunk) => {
          raw += chunk
        })
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            setCookies: res.headers['set-cookie'] || [],
            body: raw ? JSON.parse(raw) : null,
          })
        })
      },
    )

    req.on('error', reject)
    req.end()
  })

const findCookie = (setCookies, name) =>
  setCookies.find((cookie) => cookie.startsWith(`${name}=`))

const rawCookiePair = (header) => header.split(';')[0]

const sessionIdFromCookie = (header) => {
  const value = decodeURIComponent(
    rawCookiePair(header).split('=').slice(1).join('='),
  )
  // express-session signs cookies as `s:<sessionId>.<signature>`.
  const unsigned = value.startsWith('s:') ? value.slice(2) : value
  return unsigned.split('.')[0]
}

const hasAttribute = (header, attribute) => {
  const lower = attribute.toLowerCase()
  return header
    .split(';')
    .slice(1)
    .map((part) => part.trim().toLowerCase())
    .some((part) => part === lower || part.startsWith(`${lower}=`))
}

const attributeValue = (header, name) => {
  const prefix = `${name.toLowerCase()}=`
  const part = header
    .split(';')
    .slice(1)
    .map((value) => value.trim())
    .find((value) => value.toLowerCase().startsWith(prefix))

  return part ? part.slice(prefix.length) : null
}

// express-session serialises the cookie's absolute expiry, not Max-Age.
const getExpiresAt = (header) => {
  const value = attributeValue(header, 'Expires')
  return value === null ? null : Date.parse(value)
}

const getLifetime = (header) => {
  const expiresAt = getExpiresAt(header)
  return expiresAt === null ? null : expiresAt - Date.now()
}

const assertLifetimeApproximately = (header, expectedMs, toleranceMs = 5000) => {
  const lifetime = getLifetime(header)
  assert.ok(
    Math.abs(lifetime - expectedMs) <= toleranceMs,
    `expected a lifetime near ${expectedMs}ms, received ${lifetime}ms`,
  )
}

const createIsolatedIndex = () => {
  const namespace = `tafera-test-${crypto.randomUUID()}`
  return {
    namespace,
    index: createSessionIndex({ client, namespace }),
  }
}

const cleanup = async (namespace) => {
  const keys = await client.keys(`${namespace}:*`)
  if (keys.length > 0) {
    await client.del(keys)
  }
}

const mutateStoredSession = async (index, sessionId, mutate) => {
  const key = `${index.sessionPrefix}${sessionId}`
  const raw = await client.get(key)
  const stored = JSON.parse(raw)
  mutate(stored)
  await client.set(key, JSON.stringify(stored), { EX: HOUR / 1000 })
}

const startIsolatedApp = async (options = {}) => {
  const { namespace, index } = createIsolatedIndex()
  const app = createApp({
    nodeEnv: 'test',
    trustProxy: false,
    namespace,
    index,
    ...options,
  })
  const server = await startServer(app)

  return {
    namespace,
    index,
    ...server,
    async cleanup() {
      await cleanup(namespace)
      await server.close()
    },
  }
}

test('development requests use the tafera.sid cookie with safe attributes', async (t) => {
  if (skipWithoutRedis(t)) return
  const app = await startIsolatedApp()

  try {
    const response = await request({
      port: app.port,
      method: 'POST',
      path: '/anonymous',
    })

    assert.equal(response.status, 200)
    const cookie = findCookie(response.setCookies, 'tafera.sid')
    assert.ok(cookie, 'expected a tafera.sid cookie')
    assert.equal(hasAttribute(cookie, 'HttpOnly'), true)
    assert.equal(attributeValue(cookie, 'SameSite'), 'Lax')
    assert.equal(attributeValue(cookie, 'Path'), '/')
    assert.equal(hasAttribute(cookie, 'Secure'), false)
    assert.equal(hasAttribute(cookie, 'Domain'), false)
    assertLifetimeApproximately(cookie, 30 * MINUTE)

    // Anonymous sessions persist only the lifecycle metadata, never user data.
    assert.deepEqual(
      Object.keys(response.body.session.data).sort(),
      ['absoluteExpiresAt', 'createdAt', 'csrfSecret', 'lastSeenAt'],
    )
    assert.equal(response.body.session.data.roleAtLogin, undefined)
    assert.equal(response.body.session.data.userId, undefined)
  } finally {
    await app.cleanup()
  }
})

test('unmanaged requests do not create or set a session cookie', async (t) => {
  if (skipWithoutRedis(t)) return
  const app = await startIsolatedApp()

  try {
    const response = await request({ port: app.port, path: '/session' })

    assert.equal(response.status, 200)
    assert.deepEqual(response.body.session.data, {})
    assert.equal(response.setCookies.length, 0)
  } finally {
    await app.cleanup()
  }
})

test('login regenerates the session ID and stores only the allowed fields', async (t) => {
  if (skipWithoutRedis(t)) return
  const app = await startIsolatedApp()

  try {
    const anonymous = await request({
      port: app.port,
      method: 'POST',
      path: '/anonymous',
    })
    const anonymousCookie = findCookie(anonymous.setCookies, 'tafera.sid')
    const anonymousSessionId = sessionIdFromCookie(anonymousCookie)

    const login = await request({
      port: app.port,
      method: 'POST',
      path: '/login',
      headers: { Cookie: rawCookiePair(anonymousCookie) },
    })

    assert.equal(login.status, 200)
    const loginCookie = findCookie(login.setCookies, 'tafera.sid')
    const sessionId = sessionIdFromCookie(loginCookie)

    assert.notEqual(sessionId, anonymousSessionId)
    assertLifetimeApproximately(loginCookie, DAY)

    assert.deepEqual(
      Object.keys(login.body.session.data).sort(),
      [
        'absoluteExpiresAt',
        'authVersion',
        'createdAt',
        'csrfSecret',
        'lastSeenAt',
        'roleAtLogin',
        'userId',
      ],
    )
    assert.equal(login.body.session.data.userId, TEST_USER.id)
    assert.equal(login.body.session.data.roleAtLogin, 'user')
    assert.equal(login.body.session.data.authVersion, TEST_USER.authVersion)
    assert.equal(JSON.stringify(login.body).includes('must-not-be-stored'), false)

    assert.equal(
      await client.exists(`${app.index.sessionPrefix}${anonymousSessionId}`),
      0,
    )
    assert.equal(
      await client.exists(`${app.index.sessionPrefix}${sessionId}`),
      1,
    )
    assert.equal(await app.index.countSessions(TEST_USER.id), 1)
  } finally {
    await app.cleanup()
  }
})

test('admin sessions receive the 30 minute idle cookie', async (t) => {
  if (skipWithoutRedis(t)) return
  const app = await startIsolatedApp()

  try {
    const response = await request({
      port: app.port,
      method: 'POST',
      path: '/login-admin',
    })
    const cookie = findCookie(response.setCookies, 'tafera.sid')

    assertLifetimeApproximately(cookie, 30 * MINUTE)
    assert.equal(response.body.session.data.roleAtLogin, 'admin')
    assert.equal(
      response.body.session.data.absoluteExpiresAt -
        response.body.session.data.createdAt,
      12 * HOUR,
    )
  } finally {
    await app.cleanup()
  }
})

test('logout clears the cookie, destroys the session and updates the index', async (t) => {
  if (skipWithoutRedis(t)) return
  const app = await startIsolatedApp()

  try {
    const login = await request({
      port: app.port,
      method: 'POST',
      path: '/login',
    })
    const cookie = findCookie(login.setCookies, 'tafera.sid')
    const sessionId = sessionIdFromCookie(cookie)

    const logout = await request({
      port: app.port,
      method: 'POST',
      path: '/logout',
      headers: { Cookie: rawCookiePair(cookie) },
    })

    assert.equal(logout.status, 200)
    assert.deepEqual(logout.body, { destroyed: true })

    const cleared = findCookie(logout.setCookies, 'tafera.sid')
    assert.ok(cleared, 'expected a clearing cookie')
    assert.equal(hasAttribute(cleared, 'HttpOnly'), true)
    assert.equal(attributeValue(cleared, 'Path'), '/')
    assert.equal(hasAttribute(cleared, 'Domain'), false)
    assert.match(cleared, /Expires=Thu, 01 Jan 1970 00:00:00 GMT/i)

    assert.equal(await client.exists(`${app.index.sessionPrefix}${sessionId}`), 0)
    assert.equal(await app.index.countSessions(TEST_USER.id), 0)
  } finally {
    await app.cleanup()
  }
})

test('rolling activity renews idle expiry but never extends absolute expiry', async (t) => {
  if (skipWithoutRedis(t)) return
  const app = await startIsolatedApp()

  try {
    const login = await request({
      port: app.port,
      method: 'POST',
      path: '/login',
    })
    const cookie = findCookie(login.setCookies, 'tafera.sid')
    const sessionId = sessionIdFromCookie(cookie)
    const absoluteExpiresAt = Date.now() + MINUTE

    await mutateStoredSession(app.index, sessionId, (session) => {
      session.absoluteExpiresAt = absoluteExpiresAt
      session.lastSeenAt = Date.now()
    })

    const response = await request({
      port: app.port,
      path: '/session',
      headers: { Cookie: rawCookiePair(cookie) },
    })

    assert.equal(response.status, 200)
    assert.ok(response.body.session)
    const renewed = findCookie(response.setCookies, 'tafera.sid')
    assert.ok(renewed, 'expected the rolling cookie to be reissued')

    const lifetime = getLifetime(renewed)
    assert.ok(
      lifetime > 0 && lifetime <= MINUTE + 2000,
      `expected a cookie capped near 60 seconds, received ${lifetime}ms`,
    )
    assert.equal(response.body.session.data.absoluteExpiresAt, absoluteExpiresAt)

    const ttl = await client.ttl(`${app.index.sessionPrefix}${sessionId}`)
    assert.ok(ttl > 0 && ttl <= 60, `unexpected Redis TTL ${ttl}`)
  } finally {
    await app.cleanup()
  }
})

test('idle expiry destroys the session and clears the cookie', async (t) => {
  if (skipWithoutRedis(t)) return
  const app = await startIsolatedApp()

  try {
    const login = await request({
      port: app.port,
      method: 'POST',
      path: '/login',
    })
    const cookie = findCookie(login.setCookies, 'tafera.sid')
    const sessionId = sessionIdFromCookie(cookie)

    await mutateStoredSession(app.index, sessionId, (session) => {
      session.lastSeenAt = Date.now() - DAY - 5000
      session.absoluteExpiresAt = Date.now() + DAY
    })

    const response = await request({
      port: app.port,
      path: '/session',
      headers: { Cookie: rawCookiePair(cookie) },
    })

    assert.equal(response.status, 200)
    assert.equal(response.body.session, null)
    const cleared = findCookie(response.setCookies, 'tafera.sid')
    assert.ok(cleared, 'expected the expired cookie to be cleared')
    assert.match(cleared, /Expires=Thu, 01 Jan 1970 00:00:00 GMT/i)
    assert.equal(await client.exists(`${app.index.sessionPrefix}${sessionId}`), 0)
  } finally {
    await app.cleanup()
  }
})

test('absolute expiry destroys the session even after recent activity', async (t) => {
  if (skipWithoutRedis(t)) return
  const app = await startIsolatedApp()

  try {
    const login = await request({
      port: app.port,
      method: 'POST',
      path: '/login',
    })
    const cookie = findCookie(login.setCookies, 'tafera.sid')
    const sessionId = sessionIdFromCookie(cookie)

    await mutateStoredSession(app.index, sessionId, (session) => {
      session.lastSeenAt = Date.now()
      session.absoluteExpiresAt = Date.now() - 1000
    })

    const response = await request({
      port: app.port,
      path: '/session',
      headers: { Cookie: rawCookiePair(cookie) },
    })

    assert.equal(response.body.session, null)
    assert.ok(findCookie(response.setCookies, 'tafera.sid'))
    assert.equal(await client.exists(`${app.index.sessionPrefix}${sessionId}`), 0)
  } finally {
    await app.cleanup()
  }
})

test('production uses __Host-tafera.sid with Secure and Priority=High', async (t) => {
  if (skipWithoutRedis(t)) return
  const { namespace, index } = createIsolatedIndex()
  const server = await startServer(
    createApp({
      nodeEnv: 'production',
      trustProxy: 1,
      namespace,
      index,
    }),
  )

  try {
    const response = await request({
      port: server.port,
      method: 'POST',
      path: '/login',
      headers: { 'X-Forwarded-Proto': 'https' },
    })

    assert.equal(response.status, 200)
    const cookie = findCookie(response.setCookies, '__Host-tafera.sid')
    assert.ok(cookie, 'expected a __Host-tafera.sid cookie')
    assert.equal(hasAttribute(cookie, 'Secure'), true)
    assert.equal(hasAttribute(cookie, 'HttpOnly'), true)
    assert.equal(attributeValue(cookie, 'SameSite'), 'Lax')
    assert.equal(attributeValue(cookie, 'Path'), '/')
    assert.equal(attributeValue(cookie, 'Priority'), 'High')
    assert.equal(hasAttribute(cookie, 'Domain'), false)
    assert.equal(findCookie(response.setCookies, 'tafera.sid'), undefined)
  } finally {
    await cleanup(namespace)
    await server.close()
  }
})

test('production does not issue secure cookies over an untrusted connection', async (t) => {
  if (skipWithoutRedis(t)) return
  const trusted = createIsolatedIndex()
  const trustedServer = await startServer(
    createApp({
      nodeEnv: 'production',
      trustProxy: 1,
      namespace: trusted.namespace,
      index: trusted.index,
    }),
  )
  const untrusted = createIsolatedIndex()
  const untrustedServer = await startServer(
    createApp({
      nodeEnv: 'production',
      trustProxy: false,
      namespace: untrusted.namespace,
      index: untrusted.index,
    }),
  )

  try {
    // Trusted proxy but no forwarded proto: the connection is HTTP.
    const direct = await request({
      port: trustedServer.port,
      method: 'POST',
      path: '/anonymous',
    })
    assert.equal(direct.setCookies.length, 0)

    // Untrusted proxy: a forged X-Forwarded-Proto must be ignored.
    const forged = await request({
      port: untrustedServer.port,
      method: 'POST',
      path: '/anonymous',
      headers: { 'X-Forwarded-Proto': 'https' },
    })
    assert.equal(forged.setCookies.length, 0)
  } finally {
    await cleanup(trusted.namespace)
    await cleanup(untrusted.namespace)
    await trustedServer.close()
    await untrustedServer.close()
  }
})

test('Redis store failures return a safe 503 without leaking internals', async (t) => {
  const fakeClient = {
    async get() {
      return null
    },
    async destroy() {},
    async set() {
      throw new Error('redis://user:secret@internal:6379 unreachable')
    },
    async expire() {},
    async del() {},
    async scan() {
      return { cursor: 0, keys: [] }
    },
  }
  const namespace = `tafera-test-${crypto.randomUUID()}`
  const index = createSessionIndex({ client: fakeClient, namespace })
  const app = createApp({
    nodeEnv: 'test',
    trustProxy: false,
    namespace,
    index,
    storeClient: fakeClient,
  })
  const server = await startServer(app)
  const originalError = console.error
  console.error = () => {}

  try {
    const response = await request({
      port: server.port,
      method: 'POST',
      path: '/anonymous',
    })

    assert.equal(response.status, 503)
    assert.equal(response.body.error.status, 503)
    assert.doesNotMatch(JSON.stringify(response.body), /internal:6379/)
    assert.doesNotMatch(JSON.stringify(response.body), /secret/)
  } finally {
    console.error = originalError
    await server.close()
  }
})
