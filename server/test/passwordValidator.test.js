'use strict'

process.env.NODE_ENV = 'test'
process.env.SESSION_SECRET =
  'test-only-session-secret-0123456789abcdef'
process.env.DB_NAME = process.env.DB_NAME || 'tafera_test'
process.env.DB_USER = process.env.DB_USER || 'tafera_test_user'

const test = require('node:test')
const assert = require('node:assert/strict')
const {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} = require('../src/config/password')
const { passwordSchema } = require('../src/validators/password')

const parse = (value) => passwordSchema.safeParse(value)

test('accepts a passphrase with spaces and Unicode', () => {
  const password = 'correct horse 密码 🔐 battery staple'
  const result = parse(password)

  assert.equal(result.success, true)
  assert.equal(result.data, password)
})

test('accepts passwords without composition rules', () => {
  assert.equal(parse('a'.repeat(PASSWORD_MIN_LENGTH)).success, true)
  assert.equal(parse('            ').success, true)
})

test('rejects empty passwords', () => {
  const result = parse('')

  assert.equal(result.success, false)
  assert.match(result.error.issues[0].message, /required/i)
})

test('rejects passwords below the minimum length', () => {
  const result = parse('a'.repeat(PASSWORD_MIN_LENGTH - 1))

  assert.equal(result.success, false)
  assert.match(result.error.issues[0].message, /at least/i)
})

test('rejects passwords above the maximum length', () => {
  const result = parse('a'.repeat(PASSWORD_MAX_LENGTH + 1))

  assert.equal(result.success, false)
  assert.match(result.error.issues[0].message, /at most/i)
})

test('counts Unicode code points rather than UTF-16 units', () => {
  // Six emoji are 12 UTF-16 units but only six characters.
  assert.equal(parse('😀'.repeat(6)).success, false)
  assert.equal(parse('😀'.repeat(PASSWORD_MIN_LENGTH)).success, true)
  assert.equal(parse('😀'.repeat(PASSWORD_MAX_LENGTH)).success, true)
  assert.equal(parse('😀'.repeat(PASSWORD_MAX_LENGTH + 1)).success, false)
})

test('does not trim or normalise password values', () => {
  const spaced = '  exact password  '
  const decomposed = 'cafe\u0301 password 123'

  assert.equal(parse(spaced).data, spaced)
  assert.equal(parse(decomposed).data, decomposed)
})

test('rejects non-string values without echoing them', () => {
  for (const value of [null, undefined, 123456789012, {}, []]) {
    const result = parse(value)

    assert.equal(result.success, false)
    assert.doesNotMatch(result.error.issues[0].message, /123456789012/)
  }
})
