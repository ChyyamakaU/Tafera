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

const test = require('node:test')
const assert = require('node:assert/strict')
const argon2 = require('argon2')
const {
  ARGON2_OPTIONS,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} = require('../src/config/password')
const {
  PasswordPolicyError,
  hashPassword,
  needsRehash,
  verifyPassword,
} = require('../src/services/passwordService')

const VALID_PASSWORD = 'correct horse battery staple'
const UNICODE_PASSWORD = '  pässwörd-密码-🔐 with spaces  '

test('valid passwords produce Argon2id PHC-format hashes', async () => {
  const hash = await hashPassword(VALID_PASSWORD)

  assert.match(hash, /^\$argon2id\$v=19\$/)
  assert.equal(hash.includes(VALID_PASSWORD), false)
})

test('hashes of the same password use unique salts', async () => {
  const first = await hashPassword(VALID_PASSWORD)
  const second = await hashPassword(VALID_PASSWORD)

  assert.notEqual(first, second)
  assert.equal(await verifyPassword(VALID_PASSWORD, first), true)
  assert.equal(await verifyPassword(VALID_PASSWORD, second), true)
})

test('correct passwords verify successfully', async () => {
  const hash = await hashPassword(VALID_PASSWORD)

  assert.equal(await verifyPassword(VALID_PASSWORD, hash), true)
})

test('incorrect passwords fail verification', async () => {
  const hash = await hashPassword(VALID_PASSWORD)

  assert.equal(
    await verifyPassword('correct horse battery staple!', hash),
    false,
  )
})

test('empty passwords are rejected', async () => {
  await assert.rejects(hashPassword(''), (error) => {
    assert.ok(error instanceof PasswordPolicyError)
    assert.equal(error.name, 'PasswordPolicyError')
    assert.equal(error.code, 'INVALID_PASSWORD')
    assert.equal(error.expose, true)
    return true
  })
})

test('passwords shorter than the minimum are rejected', async () => {
  const tooShort = 'a'.repeat(PASSWORD_MIN_LENGTH - 1)

  await assert.rejects(hashPassword(tooShort), PasswordPolicyError)
})

test('passwords longer than the maximum are rejected', async () => {
  const tooLong = 'a'.repeat(PASSWORD_MAX_LENGTH + 1)

  await assert.rejects(hashPassword(tooLong), PasswordPolicyError)
})

test('Unicode and space-containing passwords hash and verify', async () => {
  const hash = await hashPassword(UNICODE_PASSWORD)

  assert.equal(await verifyPassword(UNICODE_PASSWORD, hash), true)
  assert.match(hash, /^\$argon2id\$/)
})

test('passwords are not trimmed or Unicode-normalised', async () => {
  const spaced = '  spaced password  '
  const spacedHash = await hashPassword(spaced)

  assert.equal(await verifyPassword('spaced password', spacedHash), false)
  assert.equal(await verifyPassword(spaced, spacedHash), true)

  const composed = 'café password 123'
  const decomposed = 'cafe\u0301 password 123'
  const composedHash = await hashPassword(composed)

  assert.equal(await verifyPassword(composed, composedHash), true)
  assert.equal(await verifyPassword(decomposed, composedHash), false)
})

test('verification handles maximum-length Unicode without false rejection', async () => {
  const emojiPassword = '😀'.repeat(PASSWORD_MAX_LENGTH)
  const hash = await hashPassword(emojiPassword)

  assert.equal(await verifyPassword(emojiPassword, hash), true)
  assert.equal(
    await verifyPassword(`${emojiPassword}😀`, hash),
    false,
  )
})

test('malformed and unsupported hashes fail safely', async () => {
  const malformedHashes = [
    '',
    'not-a-hash',
    '$2b$12$abcdefghijklmnopqrstuv',
    '$argon2id$',
    '$argon2id$v=19$m=19456,t=2,p=1$',
  ]

  for (const storedHash of malformedHashes) {
    assert.equal(await verifyPassword(VALID_PASSWORD, storedHash), false)
    assert.equal(needsRehash(storedHash), true)
  }

  assert.equal(await verifyPassword(VALID_PASSWORD, null), false)
  assert.equal(await verifyPassword(null, '$argon2id$invalid'), false)
})

test('hash parameters match the configured Argon2id settings', async () => {
  const hash = await hashPassword(VALID_PASSWORD)
  const match =
    /^\$argon2id\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(hash)

  assert.ok(match, 'hash is in PHC format')
  assert.equal(Number(match[1]), 19)
  assert.equal(Number(match[2]), ARGON2_OPTIONS.memoryCost)
  assert.equal(Number(match[3]), ARGON2_OPTIONS.timeCost)
  assert.equal(Number(match[4]), ARGON2_OPTIONS.parallelism)
})

test('needsRehash detects outdated parameters and algorithms', async () => {
  const current = await hashPassword(VALID_PASSWORD)
  assert.equal(needsRehash(current), false)

  const outdated = await argon2.hash(VALID_PASSWORD, {
    ...ARGON2_OPTIONS,
    memoryCost: 8192,
  })
  assert.equal(needsRehash(outdated), true)

  const nonArgon2id = current.replace('$argon2id$', '$argon2i$')
  assert.equal(needsRehash(nonArgon2id), true)
})
