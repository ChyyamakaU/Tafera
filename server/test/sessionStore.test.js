'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { SessionStoreUnavailableError } = require('../src/utils/sessionErrors')
const { TaferaSessionStore } = require('../src/config/sessionStore')

const sessionData = (overrides = {}) => {
  const now = Date.now()

  return {
    roleAtLogin: 'user',
    createdAt: now,
    absoluteExpiresAt: now + 7 * 24 * 60 * 60 * 1000,
    lastSeenAt: now,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 },
    ...overrides,
  }
}

const withCallback = (operation) =>
  new Promise((resolve) => {
    operation((err, data) => resolve({ err, data }))
  })

test('store TTL ignores the cookie and uses the remaining absolute lifetime', () => {
  const store = new TaferaSessionStore({
    client: {},
    prefix: 'test:sess:',
  })
  const now = Date.now()
  const session = sessionData({
    absoluteExpiresAt: now + 45 * 1000,
    cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 },
  })

  const ttl = store.getTTL(session)

  assert.ok(ttl <= 45 && ttl >= 44, `expected ~45 seconds, received ${ttl}`)
})

test('store TTL is zero for a session past absolute expiry', () => {
  const store = new TaferaSessionStore({
    client: {},
    prefix: 'test:sess:',
  })

  assert.equal(
    store.getTTL(
      sessionData({ absoluteExpiresAt: Date.now() - 1000 }),
    ),
    0,
  )
})

test('store.set writes the clamped TTL, not the cookie lifetime', async () => {
  const calls = []
  const client = {
    async set(key, value, options) {
      calls.push({ key, value, options })
    },
  }
  const store = new TaferaSessionStore({ client, prefix: 'test:sess:' })
  const session = sessionData({
    absoluteExpiresAt: Date.now() + 30 * 1000,
  })

  const { err } = await withCallback((callback) =>
    store.set('sid-1', session, callback),
  )

  assert.equal(err, null)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].key, 'test:sess:sid-1')
  assert.equal(calls[0].options.expiration.type, 'EX')
  assert.ok(
    calls[0].options.expiration.value <= 30 &&
      calls[0].options.expiration.value >= 29,
  )
})

test('store.get failures are converted to an opaque 503 error', async () => {
  const internal = Object.assign(new Error('redis://secret-host unavailable'), {
    code: 'ECONNREFUSED',
  })
  const client = {
    async get() {
      throw internal
    },
  }
  const store = new TaferaSessionStore({ client, prefix: 'test:sess:' })
  const originalError = console.error
  console.error = () => {}

  try {
    const { err } = await withCallback((callback) =>
      store.get('sid-1', callback),
    )

    assert.ok(err instanceof SessionStoreUnavailableError)
    assert.equal(err.status, 503)
    assert.equal(err.code, 'SESSION_STORE_UNAVAILABLE')
    assert.doesNotMatch(err.message, /secret-host/)
    assert.doesNotMatch(err.message, /redis:\/\//)
  } finally {
    console.error = originalError
  }
})

test('store.set failures are converted to an opaque 503 error', async () => {
  const client = {
    async set() {
      throw new Error('connection lost to redis://internal:6379')
    },
  }
  const store = new TaferaSessionStore({ client, prefix: 'test:sess:' })
  const originalError = console.error
  console.error = () => {}

  try {
    const { err } = await withCallback((callback) =>
      store.set('sid-1', sessionData(), callback),
    )

    assert.ok(err instanceof SessionStoreUnavailableError)
    assert.doesNotMatch(err.message, /internal:6379/)
  } finally {
    console.error = originalError
  }
})

test('store.touch failures are converted to an opaque 503 error', async () => {
  const client = {
    async expire() {
      throw new Error('boom')
    },
  }
  const store = new TaferaSessionStore({ client, prefix: 'test:sess:' })
  const originalError = console.error
  console.error = () => {}

  try {
    const { err } = await withCallback((callback) =>
      store.touch('sid-1', sessionData(), callback),
    )

    assert.ok(err instanceof SessionStoreUnavailableError)
    assert.equal(err.status, 503)
  } finally {
    console.error = originalError
  }
})
