'use strict'

process.env.NODE_ENV = 'test'
process.env.SESSION_SECRET =
  'test-only-session-secret-0123456789abcdef'
process.env.DB_NAME = process.env.DB_NAME || 'tafera_test'
process.env.DB_USER = process.env.DB_USER || 'tafera_test_user'
process.env.ARGON2_MAX_QUEUE = '50'

const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { createClient } = require('redis')
const {
  MAX_SESSIONS_PER_USER,
  createSessionIndex,
} = require('../src/services/sessionIndex')
const { SessionStoreUnavailableError } = require('../src/utils/sessionErrors')

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

let client = null
let redisAvailable = false

const silentErrors = () => {
  const original = console.error
  console.error = () => {}
  return () => {
    console.error = original
  }
}

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
  if (client && client.isOpen) {
    await client.quit().catch(() => {})
  }
})

const skipWithoutRedis = (t) => {
  if (redisAvailable) return false
  t.skip('Redis is unavailable; session index integration test skipped')
  return true
}

const createIsolatedIndex = () => {
  const namespace = `tafera-test-${crypto.randomUUID()}`
  return {
    namespace,
    index: createSessionIndex({ client, namespace }),
  }
}

const seedSession = async (index, sessionId, ttlSeconds = 3600) => {
  await client.set(
    `${index.sessionPrefix}${sessionId}`,
    JSON.stringify({ sentinel: true }),
    { EX: ttlSeconds },
  )
}

const cleanup = async (namespace) => {
  const keys = await client.keys(`${namespace}:*`)
  if (keys.length > 0) {
    await client.del(keys)
  }
}

const assertAllIndexedSessionsExist = async (index) => {
  const sessions = await index.listSessions(
    '00000000-0000-0000-0000-000000000001',
  )

  for (const { value } of sessions) {
    assert.equal(
      await client.exists(`${index.sessionPrefix}${value}`),
      1,
      `expected payload for ${value} to exist`,
    )
  }
}

const USER_ID = '00000000-0000-0000-0000-000000000001'
const OTHER_USER_ID = '00000000-0000-0000-0000-000000000002'

test('index registers sessions for each user under a namespaced key', async (t) => {
  if (skipWithoutRedis(t)) return
  const { namespace, index } = createIsolatedIndex()

  try {
    await seedSession(index, 'session-a')
    await seedSession(index, 'session-b')
    await seedSession(index, 'session-other')
    await index.registerSession({
      userId: USER_ID,
      sessionId: 'session-a',
      createdAt: 1000,
    })
    await index.registerSession({
      userId: USER_ID,
      sessionId: 'session-b',
      createdAt: 2000,
    })
    await index.registerSession({
      userId: OTHER_USER_ID,
      sessionId: 'session-other',
      createdAt: 3000,
    })

    assert.equal(await index.countSessions(USER_ID), 2)
    assert.equal(await index.countSessions(OTHER_USER_ID), 1)
    assert.equal(await client.exists(`${namespace}:user-sessions:${USER_ID}`), 1)
    assert.equal(
      await client.exists(`${namespace}:user-sessions:${OTHER_USER_ID}`),
      1,
    )
    await assertAllIndexedSessionsExist(index)
  } finally {
    await cleanup(namespace)
  }
})

test('the eleventh session revokes the oldest session and its payload', async (t) => {
  if (skipWithoutRedis(t)) return
  const { namespace, index } = createIsolatedIndex()
  const base = 1_700_000_000_000

  try {
    for (let i = 0; i < MAX_SESSIONS_PER_USER; i += 1) {
      await seedSession(index, `session-${i}`)
      await index.registerSession({
        userId: USER_ID,
        sessionId: `session-${i}`,
        createdAt: base + i * 1000,
      })
    }

    await seedSession(index, 'session-10')
    const result = await index.registerSession({
      userId: USER_ID,
      sessionId: 'session-10',
      createdAt: base + 10_000,
    })

    assert.deepEqual(result.removedSessionIds, ['session-0'])
    assert.equal(await index.countSessions(USER_ID), MAX_SESSIONS_PER_USER)
    assert.equal(await client.exists(`${index.sessionPrefix}session-0`), 0)
    assert.equal(await client.exists(`${index.sessionPrefix}session-10`), 1)

    const sessions = await index.listSessions(USER_ID)
    assert.deepEqual(
      sessions.map(({ value }) => value).sort(),
      Array.from({ length: MAX_SESSIONS_PER_USER }, (_, i) => `session-${i + 1}`).sort(),
    )
  } finally {
    await cleanup(namespace)
  }
})

test('concurrent registrations stay within the limit', async (t) => {
  if (skipWithoutRedis(t)) return
  const { namespace, index } = createIsolatedIndex()
  const base = 1_700_000_000_000

  try {
    const sessionIds = Array.from({ length: 25 }, (_, i) => `session-${i}`)

    for (const sessionId of sessionIds) {
      await seedSession(index, sessionId)
    }

    await Promise.all(
      sessionIds.map((sessionId, i) =>
        index.registerSession({
          userId: USER_ID,
          sessionId,
          createdAt: base + i * 1000,
        }),
      ),
    )

    assert.equal(await index.countSessions(USER_ID), MAX_SESSIONS_PER_USER)

    const sessions = await index.listSessions(USER_ID)
    assert.equal(sessions.length, MAX_SESSIONS_PER_USER)

    // Exactly the 10 newest sessions survive the concurrent race.
    assert.deepEqual(
      sessions.map(({ value }) => value).sort(),
      sessionIds.slice(-MAX_SESSIONS_PER_USER).sort(),
    )

    const payloadKeys = await client.keys(`${index.sessionPrefix}*`)
    assert.equal(payloadKeys.length, MAX_SESSIONS_PER_USER)
  } finally {
    await cleanup(namespace)
  }
})

test('stale index entries are removed when a new session registers', async (t) => {
  if (skipWithoutRedis(t)) return
  const { namespace, index } = createIsolatedIndex()

  try {
    await client.zAdd(
      `${namespace}:user-sessions:${USER_ID}`,
      [{ score: 1, value: 'stale-session' }],
    )

    await seedSession(index, 'fresh-session')
    const result = await index.registerSession({
      userId: USER_ID,
      sessionId: 'fresh-session',
      createdAt: 2,
    })

    assert.deepEqual(result.removedSessionIds, [])
    const sessions = await index.listSessions(USER_ID)
    assert.deepEqual(
      sessions.map(({ value }) => value),
      ['fresh-session'],
    )
  } finally {
    await cleanup(namespace)
  }
})

test('the index receives a TTL so abandoned users do not leak keys', async (t) => {
  if (skipWithoutRedis(t)) return
  const { namespace, index } = createIsolatedIndex()

  try {
    await seedSession(index, 'session-a')
    await index.registerSession({
      userId: USER_ID,
      sessionId: 'session-a',
      createdAt: 1,
    })

    const ttl = await client.ttl(`${namespace}:user-sessions:${USER_ID}`)
    assert.ok(ttl > 0)
    assert.ok(ttl <= index.indexTtlSeconds)
  } finally {
    await cleanup(namespace)
  }
})

test('revokeAllSessions deletes every payload and the index key', async (t) => {
  if (skipWithoutRedis(t)) return
  const { namespace, index } = createIsolatedIndex()

  try {
    for (let i = 0; i < 3; i += 1) {
      await seedSession(index, `session-${i}`)
      await index.registerSession({
        userId: USER_ID,
        sessionId: `session-${i}`,
        createdAt: i + 1,
      })
    }

    const revoked = await index.revokeAllSessions(USER_ID)

    assert.equal(revoked, 3)
    assert.equal(await index.countSessions(USER_ID), 0)
    assert.equal(await client.exists(`${namespace}:user-sessions:${USER_ID}`), 0)
    assert.equal(await client.exists(`${index.sessionPrefix}session-0`), 0)
    assert.equal(await client.exists(`${index.sessionPrefix}session-1`), 0)
    assert.equal(await client.exists(`${index.sessionPrefix}session-2`), 0)
  } finally {
    await cleanup(namespace)
  }
})

test('index failures surface as opaque 503 errors', async () => {
  const restore = silentErrors()
  const index = createSessionIndex({
    client: {
      async eval() {
        throw Object.assign(new Error('redis://user:secret@internal:6379'), {
          code: 'ECONNREFUSED',
        })
      },
    },
    namespace: 'test-failure',
  })

  try {
    await assert.rejects(
      index.registerSession({
        userId: USER_ID,
        sessionId: 'session-a',
        createdAt: 1,
      }),
      (error) => {
        assert.ok(error instanceof SessionStoreUnavailableError)
        assert.equal(error.status, 503)
        assert.equal(error.code, 'SESSION_STORE_UNAVAILABLE')
        assert.doesNotMatch(error.message, /secret|internal:6379/)
        return true
      },
    )
  } finally {
    restore()
  }
})

test('registerSession validates identifiers without touching Redis', async () => {
  const index = createSessionIndex({
    client: {
      async eval() {
        throw new Error('should not be called')
      },
    },
    namespace: 'test-validation',
  })

  await assert.rejects(
    index.registerSession({ userId: '', sessionId: 'x', createdAt: 1 }),
    TypeError,
  )
  await assert.rejects(
    index.registerSession({ userId: 'x', sessionId: '', createdAt: 1 }),
    TypeError,
  )
  await assert.rejects(
    index.registerSession({ userId: 'x', sessionId: 'y', createdAt: NaN }),
    TypeError,
  )
})
