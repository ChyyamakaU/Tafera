'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Sequelize, DataTypes } = require('sequelize')
const UserModel = require('../src/models/user')
const {
  SAFE_USER_FIELDS,
  toSafeUser,
} = require('../src/utils/safeUser')

const sequelize = new Sequelize('postgres://user:pass@127.0.0.1:5432/test', {
  dialect: 'postgres',
  logging: false,
})

const User = UserModel(sequelize, DataTypes)

const PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA'

const buildUser = (overrides = {}) =>
  User.build({
    id: '00000000-0000-0000-0000-000000000001',
    fullName: 'Ada Lovelace',
    email: 'ada@example.com',
    passwordHash: PASSWORD_HASH,
    profileImage: null,
    bio: 'Mathematician',
    role: 'user',
    status: 'active',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  })

test('authVersion defaults to 1', () => {
  const user = buildUser()

  assert.equal(user.get('authVersion'), 1)
  assert.equal(user.authVersion, 1)
})

test('emailVerifiedAt defaults to null', () => {
  const user = buildUser()

  assert.equal(user.get('emailVerifiedAt'), null)
})

test('email addresses are trimmed and converted to lowercase', () => {
  const user = buildUser({ email: '  Ada@Example.COM  ' })

  assert.equal(user.get('email'), 'ada@example.com')
})

test('new attributes map to the existing snake_case columns', () => {
  assert.equal(User.rawAttributes.authVersion.field, 'auth_version')
  assert.equal(User.rawAttributes.emailVerifiedAt.field, 'email_verified_at')
  assert.equal(User.rawAttributes.fullName.field, 'full_name')
})

test('invalid email values are rejected by model validation', async () => {
  const invalidEmails = ['', 'not-an-email', 123, null, undefined, {}, []]

  for (const email of invalidEmails) {
    const user = buildUser({ email })

    await assert.rejects(
      user.validate(),
      (error) => {
        assert.ok(Array.isArray(error.errors))

        const hasEmailError = error.errors.some(
          (item) => item.path === 'email',
        )
        assert.equal(
          hasEmailError,
          true,
          `expected an email validation error for ${JSON.stringify(email)}`,
        )

        return true
      },
    )
  }
})

test('public serialization excludes passwordHash, authVersion and emailVerifiedAt', () => {
  const user = buildUser()
  const json = user.toJSON()
  const safeUser = toSafeUser(user)

  for (const serialized of [json, safeUser]) {
    assert.equal(Object.hasOwn(serialized, 'passwordHash'), false)
    assert.equal(Object.hasOwn(serialized, 'authVersion'), false)
    assert.equal(Object.hasOwn(serialized, 'emailVerifiedAt'), false)
  }

  assert.deepEqual(
    Object.keys(safeUser).sort(),
    [...SAFE_USER_FIELDS].sort(),
  )
  assert.equal(JSON.stringify(user).includes(PASSWORD_HASH), false)
})

test('existing password scope and associations remain available', () => {
  assert.equal(typeof User.scope('withPassword').findAll, 'function')
  assert.equal(typeof User.associate, 'function')
  assert.equal(User.options.defaultScope.attributes.exclude.includes('passwordHash'), true)
})
