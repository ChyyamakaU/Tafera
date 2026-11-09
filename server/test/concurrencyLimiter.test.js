'use strict'

process.env.NODE_ENV = 'test'
process.env.SESSION_SECRET =
  'test-only-session-secret-0123456789abcdef'
process.env.DB_NAME = process.env.DB_NAME || 'tafera_test'
process.env.DB_USER = process.env.DB_USER || 'tafera_test_user'
process.env.ARGON2_MAX_CONCURRENCY = '2'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  ConcurrencyLimiter,
  ConcurrencyQueueFullError,
} = require('../src/utils/concurrency')
const {
  createPasswordService,
  PasswordServiceBusyError,
} = require('../src/services/passwordService')

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds))

const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}

test('limiter never exceeds its maximum concurrency', async () => {
  const limiter = new ConcurrencyLimiter(2)
  let active = 0
  let peak = 0

  await Promise.all(
    Array.from({ length: 7 }, () =>
      limiter.run(async () => {
        active += 1
        peak = Math.max(peak, active)
        await delay(5)
        active -= 1
      }),
    ),
  )

  assert.equal(peak, 2)
  assert.equal(limiter.activeCount, 0)
  assert.equal(limiter.queuedCount, 0)
})

test('a rejected task releases its slot', async () => {
  const limiter = new ConcurrencyLimiter(1)

  await assert.rejects(
    limiter.run(async () => {
      throw new Error('boom')
    }),
    /boom/,
  )

  assert.equal(limiter.activeCount, 0)
  assert.equal(await limiter.run(async () => 'next'), 'next')
})

test('limiter rejects invalid construction and task values', async () => {
  for (const value of [0, -1, 1.5, '2', undefined]) {
    assert.throws(() => new ConcurrencyLimiter(value), RangeError)
  }

  const limiter = new ConcurrencyLimiter(1)
  await assert.rejects(limiter.run('not a function'), TypeError)
})

test('password hashing is bounded by the configured limiter', async () => {
  let inFlight = 0
  let peak = 0

  const fakeHasher = {
    hash: async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await delay(10)
      inFlight -= 1
      return '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA'
    },
    verify: async () => true,
    needsRehash: () => false,
  }

  const service = createPasswordService({
    concurrency: 2,
    hasher: fakeHasher,
  })

  await Promise.all(
    Array.from({ length: 6 }, (_, index) =>
      service.hashPassword(`concurrency-test-password-${index}`),
    ),
  )

  assert.equal(peak, 2)
  assert.equal(service.limiter.maxConcurrency, 2)
  assert.equal(service.limiter.activeCount, 0)
  assert.equal(service.limiter.queuedCount, 0)
})

test('the waiting queue has a hard capacity and rejects excess work', async () => {
  const limiter = new ConcurrencyLimiter(1, 2)
  const gate = deferred()

  const running = limiter.run(async () => {
    await gate.promise
    return 'running'
  })
  const queuedFirst = limiter.run(async () => 'queued-1')
  const queuedSecond = limiter.run(async () => 'queued-2')

  assert.equal(limiter.maxQueue, 2)
  assert.equal(limiter.activeCount, 1)
  assert.equal(limiter.queuedCount, 2)

  await assert.rejects(
    limiter.run(async () => 'rejected'),
    ConcurrencyQueueFullError,
  )

  // A rejected operation must not consume a slot or a queue position.
  assert.equal(limiter.activeCount, 1)
  assert.equal(limiter.queuedCount, 2)

  gate.resolve()

  assert.deepEqual(
    await Promise.all([running, queuedFirst, queuedSecond]),
    ['running', 'queued-1', 'queued-2'],
  )
  assert.equal(limiter.activeCount, 0)
  assert.equal(limiter.queuedCount, 0)

  // The released slot is usable by a new operation.
  assert.equal(await limiter.run(async () => 'after-release'), 'after-release')
  assert.equal(limiter.activeCount, 0)
  assert.equal(limiter.queuedCount, 0)
})

test('a zero-capacity queue rejects immediately without changing counts', async () => {
  const limiter = new ConcurrencyLimiter(1, 0)
  const gate = deferred()
  const running = limiter.run(() => gate.promise)

  assert.equal(limiter.activeCount, 1)
  assert.equal(limiter.queuedCount, 0)

  await assert.rejects(
    limiter.run(async () => 'rejected'),
    ConcurrencyQueueFullError,
  )

  assert.equal(limiter.activeCount, 1)
  assert.equal(limiter.queuedCount, 0)

  gate.resolve()
  await running

  assert.equal(limiter.activeCount, 0)
  assert.equal(limiter.queuedCount, 0)
})

test('a failed queued task releases its slot for the next task', async () => {
  const limiter = new ConcurrencyLimiter(1, 2)
  const gate = deferred()

  const running = limiter.run(async () => {
    await gate.promise
    return 'running'
  })
  const failing = limiter.run(async () => {
    throw new Error('queued failure')
  })
  const failingAssertion = assert.rejects(failing, /queued failure/)
  const succeeding = limiter.run(async () => 'queued success')

  gate.resolve()

  assert.equal(await running, 'running')
  await failingAssertion
  assert.equal(await succeeding, 'queued success')
  assert.equal(limiter.activeCount, 0)
  assert.equal(limiter.queuedCount, 0)
})

test('limiter validates both concurrency and queue capacity', () => {
  for (const value of [0, -1, 1.5, '2', undefined]) {
    assert.throws(() => new ConcurrencyLimiter(value), RangeError)
  }

  for (const value of [-1, 1.5, '2']) {
    assert.throws(() => new ConcurrencyLimiter(1, value), RangeError)
  }
})

test('password service converts queue exhaustion into a safe 503 error', async () => {
  const gate = deferred()
  const fakeHasher = {
    hash: async () => {
      await gate.promise
      return '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA'
    },
    verify: async () => true,
    needsRehash: () => false,
  }

  const service = createPasswordService({
    concurrency: 1,
    maxQueue: 1,
    hasher: fakeHasher,
  })

  const active = service.hashPassword('overload-test-password-1')
  const queued = service.hashPassword('overload-test-password-2')

  assert.equal(service.limiter.activeCount, 1)
  assert.equal(service.limiter.queuedCount, 1)

  await assert.rejects(
    service.hashPassword('overload-test-password-3'),
    (error) => {
      assert.ok(error instanceof PasswordServiceBusyError)
      assert.equal(error.name, 'PasswordServiceBusyError')
      assert.equal(error.status, 503)
      assert.equal(error.code, 'PASSWORD_SERVICE_BUSY')
      assert.match(error.message, /temporarily busy/i)
      assert.doesNotMatch(error.message, /overload-test-password/)
      return true
    },
  )

  assert.equal(service.limiter.activeCount, 1)
  assert.equal(service.limiter.queuedCount, 1)

  gate.resolve()
  await Promise.all([active, queued])

  assert.equal(service.limiter.activeCount, 0)
  assert.equal(service.limiter.queuedCount, 0)
})
