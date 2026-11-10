'use strict'

process.env.NODE_ENV = 'test'
process.env.SESSION_SECRET =
  'test-only-session-secret-0123456789abcdef'
process.env.DB_NAME = process.env.DB_NAME || 'tafera_test'
process.env.DB_USER = process.env.DB_USER || 'tafera_test_user'
process.env.ARGON2_MAX_QUEUE = '50'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { Sequelize, DataTypes } = require('sequelize')
const { parseDurationMs } = require('../src/utils/duration')
const {
  generateVerificationToken,
  hashVerificationToken,
  isWellFormedVerificationToken,
} = require('../src/utils/emailVerificationToken')
const {
  buildVerificationUrl,
  createEmailService,
} = require('../src/services/emailService')
const { EmailDeliveryUnavailableError } = require('../src/utils/emailErrors')
const {
  parseVerifyEmail,
} = require('../src/validators/auth')
const { ValidationError } = require('../src/utils/authErrors')
const { toSafeUser, toPublicUser } = require('../src/utils/safeUser')
const EmailVerificationTokenModel = require('../src/models/emailVerificationToken')

test('duration parsing supports the documented units and rejects unsafe values', () => {
  assert.equal(parseDurationMs('24h'), 24 * 60 * 60 * 1000)
  assert.equal(parseDurationMs('7d'), 7 * 24 * 60 * 60 * 1000)
  assert.equal(parseDurationMs('30m'), 30 * 60 * 1000)
  assert.equal(parseDurationMs('45s'), 45 * 1000)
  assert.equal(parseDurationMs('500ms'), 500)
  assert.equal(parseDurationMs('60'), 60 * 1000)

  for (const value of ['0', '0s', 'abc', '-5m', '1.5h', '1h30m', '']) {
    assert.throws(() => parseDurationMs(value), TypeError)
  }
})

test('verification tokens are unpredictable and only their hash is stored', () => {
  const first = generateVerificationToken()
  const second = generateVerificationToken()

  assert.equal(first.length, 43)
  assert.equal(second.length, 43)
  assert.notEqual(first, second)
  assert.equal(isWellFormedVerificationToken(first), true)
  assert.equal(isWellFormedVerificationToken(second), true)
  assert.equal(isWellFormedVerificationToken('short'), false)
  assert.equal(isWellFormedVerificationToken('!'.repeat(43)), false)
  assert.equal(isWellFormedVerificationToken(null), false)

  const hash = hashVerificationToken(first)
  assert.equal(hash.length, 64)
  assert.match(hash, /^[a-f0-9]{64}$/)
  assert.notEqual(hash, first)
  assert.equal(hash, hashVerificationToken(first))
  assert.notEqual(hash, hashVerificationToken(second))
})

test('verification links point at the configured frontend route', () => {
  const token = 'A'.repeat(43)

  assert.equal(
    buildVerificationUrl({
      token,
      clientUrl: 'http://localhost:5173/',
    }),
    `http://localhost:5173/verify-email?token=${token}`,
  )
  assert.equal(
    buildVerificationUrl({
      token,
      clientUrl: 'https://tafera.example',
    }),
    `https://tafera.example/verify-email?token=${token}`,
  )
})

test('the provider-independent email service reports when it is unconfigured', async () => {
  const service = createEmailService({ transport: null })

  assert.equal(service.isConfigured(), false)
  await assert.rejects(
    service.sendVerificationEmail({
      user: { email: 'ada@example.com' },
      token: 'A'.repeat(43),
    }),
    (error) => {
      assert.ok(error instanceof EmailDeliveryUnavailableError)
      assert.equal(error.status, 503)
      assert.equal(error.code, 'EMAIL_DELIVERY_UNAVAILABLE')
      assert.equal(error.message.includes('A'.repeat(43)), false)
      return true
    },
  )
})

test('a configured transport receives the verification link without leaking provider errors', async () => {
  const messages = []
  const service = createEmailService({
    transport: {
      async send(message) {
        messages.push(message)
      },
    },
    clientUrl: 'http://localhost:5173',
  })
  const token = 'B'.repeat(43)

  assert.equal(service.isConfigured(), true)
  await service.sendVerificationEmail({
    user: { email: 'ada@example.com' },
    token,
  })

  assert.equal(messages.length, 1)
  assert.equal(messages[0].to, 'ada@example.com')
  assert.match(messages[0].subject, /verify/i)
  assert.match(
    messages[0].text,
    /http:\/\/localhost:5173\/verify-email\?token=/,
  )
  assert.equal(messages[0].text.includes(token), true)
  assert.equal(messages[0].html.includes(token), true)

  const failing = createEmailService({
    transport: {
      async send() {
        throw new Error(`provider rejected ${token}`)
      },
    },
  })

  await assert.rejects(
    failing.sendVerificationEmail({
      user: { email: 'ada@example.com' },
      token,
    }),
    (error) => {
      assert.ok(error instanceof EmailDeliveryUnavailableError)
      assert.equal(error.message.includes(token), false)
      assert.equal(error.message.includes('provider rejected'), false)
      return true
    },
  )
})

test('verification input validation strips unknown fields and rejects missing tokens', () => {
  const parsed = parseVerifyEmail({
    token: ` ${'C'.repeat(43)} `,
    userId: 'attacker-controlled',
  })

  assert.deepEqual(parsed, { token: 'C'.repeat(43) })

  for (const input of [{}, { token: '' }, { token: 42 }]) {
    assert.throws(
      () => parseVerifyEmail(input),
      (error) => {
        assert.ok(error instanceof ValidationError)
        assert.equal(error.code, 'VALIDATION_ERROR')
        return true
      },
    )
  }
})

test('public user helpers expose verification state without the timestamp', () => {
  const user = {
    id: '00000000-0000-0000-0000-000000000001',
    fullName: 'Ada Lovelace',
    email: 'ada@example.com',
    role: 'user',
    status: 'active',
    emailVerifiedAt: null,
  }

  const safeUser = toSafeUser(user)
  const publicUser = toPublicUser(user)

  assert.equal(Object.hasOwn(safeUser, 'emailVerified'), false)
  assert.equal(publicUser.emailVerified, false)
  assert.equal(Object.hasOwn(publicUser, 'emailVerifiedAt'), false)

  const verified = toPublicUser({
    ...user,
    emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
  })
  assert.equal(verified.emailVerified, true)
  assert.equal(Object.hasOwn(verified, 'emailVerifiedAt'), false)
})

test('the verification token model hides hashes by default and in JSON', () => {
  const sequelize = new Sequelize(
    'postgres://user:pass@127.0.0.1:5432/test',
    { dialect: 'postgres', logging: false },
  )
  const Token = EmailVerificationTokenModel(sequelize, DataTypes)
  const token = Token.build({
    userId: '00000000-0000-0000-0000-000000000001',
    tokenHash: 'a'.repeat(64),
    expiresAt: new Date(Date.now() + 60_000),
  })

  assert.equal(
    Token.options.defaultScope.attributes.exclude.includes('tokenHash'),
    true,
  )
  assert.equal(Object.hasOwn(token.toJSON(), 'tokenHash'), false)
  assert.equal(
    typeof Token.scope('withTokenHash').findOne,
    'function',
  )
})
