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

const captureQuery = () => {
  const captured = []

  sequelize.query = async (sql) => {
    captured.push(String(sql))
    return [[], 0]
  }

  return captured
}

const buildUser = () =>
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
  })

test('ordinary user queries exclude the password hash', async () => {
  const captured = captureQuery()

  await User.findAll()

  assert.equal(captured.length, 1)
  assert.doesNotMatch(captured[0], /password_hash/)
  assert.match(captured[0], /"email"/)
})

test('the authentication scope deliberately includes the password hash', async () => {
  const captured = captureQuery()

  await User.scope('withPassword').findAll()

  assert.equal(captured.length, 1)
  assert.match(captured[0], /password_hash/)
})

test('serialising a user never exposes the password hash', () => {
  const user = buildUser()
  const json = user.toJSON()

  assert.equal(user.get('passwordHash'), PASSWORD_HASH)
  assert.equal(Object.hasOwn(json, 'passwordHash'), false)
  assert.equal(json.email, 'ada@example.com')
  assert.equal(JSON.stringify(user).includes(PASSWORD_HASH), false)
})

test('the safe user representation uses an explicit allowlist', () => {
  const user = buildUser()
  const safeUser = toSafeUser(user)

  assert.deepEqual(
    Object.keys(safeUser).sort(),
    [...SAFE_USER_FIELDS].sort(),
  )
  assert.equal(Object.hasOwn(safeUser, 'passwordHash'), false)

  const withUnknownField = toSafeUser({
    id: '1',
    fullName: 'Grace Hopper',
    passwordHash: PASSWORD_HASH,
    unrelated: 'do not expose',
  })

  assert.equal(Object.hasOwn(withUnknownField, 'passwordHash'), false)
  assert.equal(Object.hasOwn(withUnknownField, 'unrelated'), false)
})
