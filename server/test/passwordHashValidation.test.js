'use strict'

process.env.NODE_ENV = 'test'
process.env.SESSION_SECRET =
  'test-only-session-secret-0123456789abcdef'
process.env.DB_NAME = process.env.DB_NAME || 'tafera_test'
process.env.DB_USER = process.env.DB_USER || 'tafera_test_user'
process.env.ARGON2_MEMORY_KIB = '19456'
process.env.ARGON2_TIME_COST = '2'
process.env.ARGON2_PARALLELISM = '1'
process.env.ARGON2_MAX_CONCURRENCY = '2'
process.env.ARGON2_MAX_QUEUE = '50'

const { before, test } = require('node:test')
const assert = require('node:assert/strict')
const argon2 = require('argon2')
const {
  ARGON2_AGGREGATE_MEMORY_BUDGET_KIB,
  ARGON2_HASH_LIMITS,
  ARGON2_OPTIONS,
} = require('../src/config/password')
const {
  createPasswordService,
  needsRehash,
  verifyPassword,
} = require('../src/services/passwordService')

const PASSWORD = 'stored-hash-validation-password'
const CONCURRENCY = 2

let currentHash
let olderHash

before(async () => {
  currentHash = await argon2.hash(PASSWORD, ARGON2_OPTIONS)
  olderHash = await argon2.hash(PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 8192,
    timeCost: 1,
    parallelism: 1,
  })
})

const base64 = (byteLength) =>
  Buffer.alloc(byteLength).toString('base64').replace(/=+$/, '')

const createFakeService = (concurrency = CONCURRENCY) => {
  const calls = { verify: 0, needsRehash: 0 }

  const hasher = {
    hash: async () => currentHash,
    verify: async () => {
      calls.verify += 1
      return true
    },
    needsRehash: (hash, options) => {
      calls.needsRehash += 1
      return argon2.needsRehash(hash, options)
    },
  }

  return {
    service: createPasswordService({
      concurrency,
      maxQueue: 5,
      hasher,
    }),
    calls,
  }
}

const buildHash = ({
  version = 19,
  memoryCost = 19456,
  timeCost = 2,
  parallelism = 1,
  salt,
  digest,
} = {}) => {
  const parts = currentHash.split('$')
  return (
    `$argon2id$v=${version}$m=${memoryCost},t=${timeCost},p=${parallelism}$` +
    `${salt ?? parts[4]}$${digest ?? parts[5]}`
  )
}

test('accepts a valid current Argon2id hash', async () => {
  const { service, calls } = createFakeService()

  assert.equal(await service.verifyPassword(PASSWORD, currentHash), true)
  assert.equal(calls.verify, 1)
  assert.equal(service.needsRehash(currentHash), false)
  assert.equal(calls.needsRehash, 1)
})

test('accepts a valid older hash using weaker permitted parameters', async () => {
  const { service, calls } = createFakeService()

  assert.equal(await service.verifyPassword(PASSWORD, olderHash), true)
  assert.equal(calls.verify, 1)
  assert.equal(service.needsRehash(olderHash), true)
  assert.equal(calls.needsRehash, 1)

  // The real Argon2 implementation must also still verify the older hash.
  assert.equal(await verifyPassword(PASSWORD, olderHash), true)
  assert.equal(needsRehash(olderHash), true)
})

test('rejects unsupported Argon2 versions', async () => {
  const { service, calls } = createFakeService()
  const hash = buildHash({ version: 16 })

  assert.equal(await service.verifyPassword(PASSWORD, hash), false)
  assert.equal(service.needsRehash(hash), true)
  assert.equal(calls.verify, 0)
  assert.equal(calls.needsRehash, 0)
})

test('rejects hashes whose memory cost exceeds the safe budget', async () => {
  const { service, calls } = createFakeService()
  const maximumMemoryKib = Math.floor(
    ARGON2_AGGREGATE_MEMORY_BUDGET_KIB / CONCURRENCY,
  )
  const hash = buildHash({ memoryCost: maximumMemoryKib + 1 })

  assert.equal(await service.verifyPassword(PASSWORD, hash), false)
  assert.equal(service.needsRehash(hash), true)
  assert.equal(calls.verify, 0)
  assert.equal(calls.needsRehash, 0)
})

test('accepts a hash exactly at the per-operation memory budget', async () => {
  const { service, calls } = createFakeService()
  const maximumMemoryKib = Math.floor(
    ARGON2_AGGREGATE_MEMORY_BUDGET_KIB / CONCURRENCY,
  )
  const hash = buildHash({
    memoryCost: maximumMemoryKib,
    timeCost: 1,
    parallelism: 1,
  })

  assert.equal(await service.verifyPassword(PASSWORD, hash), true)
  assert.equal(calls.verify, 1)
})

test('rejects hashes below the safe historical memory floor', async () => {
  const { service, calls } = createFakeService()
  const hash = buildHash({ memoryCost: ARGON2_HASH_LIMITS.memoryMinKib - 1 })

  assert.equal(await service.verifyPassword(PASSWORD, hash), false)
  assert.equal(calls.verify, 0)
})

test('rejects excessive time-cost parameters', async () => {
  const { service, calls } = createFakeService()
  const hash = buildHash({ timeCost: ARGON2_HASH_LIMITS.timeMax + 1 })

  assert.equal(await service.verifyPassword(PASSWORD, hash), false)
  assert.equal(service.needsRehash(hash), true)
  assert.equal(calls.verify, 0)
  assert.equal(calls.needsRehash, 0)
})

test('rejects excessive parallelism parameters', async () => {
  const { service, calls } = createFakeService()
  const hash = buildHash({
    parallelism: ARGON2_HASH_LIMITS.parallelismMax + 1,
  })

  assert.equal(await service.verifyPassword(PASSWORD, hash), false)
  assert.equal(service.needsRehash(hash), true)
  assert.equal(calls.verify, 0)
  assert.equal(calls.needsRehash, 0)
})

test('rejects malformed PHC strings', async () => {
  const { service, calls } = createFakeService()
  const malformedHashes = [
    '',
    'not-a-hash',
    '$argon2id$',
    '$argon2id$v=19$m=19456,t=2,p=1$',
    `$argon2id$v=19$m=19456,t=2,p=1$${currentHash.split('$')[4]}$`,
    '$argon2id$v=19$m=019456,t=2,p=1$c2FsdA$aGFzaA',
    '$argon2id$v=19$m=19456,t=02,p=1$c2FsdA$aGFzaA',
    currentHash.replace('$argon2id$', '$argon2i$'),
  ]

  for (const hash of malformedHashes) {
    assert.equal(await service.verifyPassword(PASSWORD, hash), false)
    assert.equal(service.needsRehash(hash), true)
  }

  assert.equal(calls.verify, 0)
  assert.equal(calls.needsRehash, 0)
})

test('rejects oversized encoded hashes', async () => {
  const { service, calls } = createFakeService()
  const hash = buildHash({ digest: 'A'.repeat(600) })

  assert.ok(hash.length > ARGON2_HASH_LIMITS.maxEncodedLength)
  assert.equal(await service.verifyPassword(PASSWORD, hash), false)
  assert.equal(service.needsRehash(hash), true)
  assert.equal(calls.verify, 0)
  assert.equal(calls.needsRehash, 0)
})

test('rejects invalid salt and digest components', async () => {
  const { service, calls } = createFakeService()
  const invalidHashes = [
    buildHash({ salt: base64(ARGON2_HASH_LIMITS.saltMinBytes - 1) }),
    buildHash({ salt: base64(ARGON2_HASH_LIMITS.saltMaxBytes + 1) }),
    buildHash({ digest: base64(ARGON2_HASH_LIMITS.digestMinBytes - 1) }),
    buildHash({ digest: base64(ARGON2_HASH_LIMITS.digestMaxBytes + 1) }),
    buildHash({ salt: '!!!!' }),
    buildHash({ digest: 'AB' }),
  ]

  for (const hash of invalidHashes) {
    assert.equal(await service.verifyPassword(PASSWORD, hash), false)
    assert.equal(service.needsRehash(hash), true)
  }

  assert.equal(calls.verify, 0)
  assert.equal(calls.needsRehash, 0)
})

test('all rejected hashes bypass the underlying hasher', async () => {
  const { service, calls } = createFakeService()
  const rejectedHashes = [
    buildHash({ version: 16 }),
    buildHash({ memoryCost: 131072 }),
    buildHash({ timeCost: 100 }),
    buildHash({ parallelism: 999 }),
    buildHash({ memoryCost: 4096 }),
    buildHash({ digest: 'A'.repeat(600) }),
    buildHash({ salt: 'AAAA' }),
    buildHash({ digest: 'AAAA' }),
    'malformed',
  ]

  for (const hash of rejectedHashes) {
    assert.equal(await service.verifyPassword(PASSWORD, hash), false)
    assert.equal(service.needsRehash(hash), true)
  }

  assert.equal(calls.verify, 0)
  assert.equal(calls.needsRehash, 0)
})
