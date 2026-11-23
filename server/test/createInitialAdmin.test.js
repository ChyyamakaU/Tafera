'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const {
  InitialAdminValidationError,
  validateInitialAdminEnv,
  bootstrapInitialAdmin,
} = require('../src/scripts/createInitialAdmin')
const passwordService = require('../src/services/passwordService')
const { createAuthService } = require('../src/services/authService')
const { createRequireAdmin } = require('../src/middlewares/requireAdmin')
const { createRequireVerifiedEmail } = require('../src/middlewares/requireVerifiedEmail')

const createInMemoryUserModel = (initialRows = []) => {
  const rows = initialRows.map((row) => ({ ...row }))

  const wrap = (record) => ({
    ...record,
    get() {
      return { ...record }
    },
    async update(changes) {
      Object.assign(record, changes)
      Object.assign(this, changes)
      return this
    },
  })

  const findMatching = (where = {}) =>
    rows.find((row) =>
      Object.entries(where).every(([key, value]) => row[key] === value),
    )

  const model = {
    rows,
    async findOne({ where = {} } = {}) {
      const found = findMatching(where)
      return found ? wrap(found) : null
    },
    async findByPk(id) {
      const found = rows.find((row) => row.id === id)
      return found ? wrap(found) : null
    },
    async create(input) {
      const record = {
        id: `user-${rows.length + 1}`,
        username: null,
        profileImage: null,
        bio: null,
        createdAt: new Date('2026-11-24T00:00:00.000Z'),
        updatedAt: new Date('2026-11-24T00:00:00.000Z'),
        ...input,
        email: String(input.email).trim().toLowerCase(),
      }
      rows.push(record)
      return wrap(record)
    },
    scope(scopeName) {
      if (scopeName === 'withPassword') {
        return {
          findOne: model.findOne,
        }
      }
      return model
    },
  }

  return model
}

describe('createInitialAdmin CLI bootstrap', () => {
  it('rejects missing or weak environment variables without leaking the password or touching the DB', async () => {
    let dbTouched = false
    const untouchedModel = {
      findOne: async () => {
        dbTouched = true
        return null
      },
    }

    await assert.rejects(
      () => bootstrapInitialAdmin({ env: {}, User: untouchedModel }),
      (err) => {
        assert.ok(err instanceof InitialAdminValidationError)
        assert.match(err.message, /INITIAL_ADMIN_EMAIL/)
        assert.match(err.message, /INITIAL_ADMIN_PASSWORD/)
        return true
      },
    )
    assert.equal(dbTouched, false)

    const weakSecret = 'shortPass!'
    await assert.rejects(
      () =>
        bootstrapInitialAdmin({
          env: {
            INITIAL_ADMIN_EMAIL: 'admin@example.com',
            INITIAL_ADMIN_PASSWORD: weakSecret,
          },
          User: untouchedModel,
        }),
      (err) => {
        assert.ok(err instanceof InitialAdminValidationError)
        assert.match(err.message, /INITIAL_ADMIN_PASSWORD/)
        assert.match(err.message, /at least 12 characters/i)
        assert.equal(err.message.includes(weakSecret), false)
        return true
      },
    )
    assert.equal(dbTouched, false)

    assert.throws(
      () =>
        validateInitialAdminEnv({
          INITIAL_ADMIN_EMAIL: 'not-an-email',
          INITIAL_ADMIN_PASSWORD: 'ValidStrongPassword!2026',
        }),
      InitialAdminValidationError,
    )
  })

  it('creates an initial verified admin with Argon2id password hash when no admin exists', async () => {
    const User = createInMemoryUserModel([])
    const logs = []
    const secret = 'SuperSecureAdminPass!2026'

    const result = await bootstrapInitialAdmin({
      env: {
        INITIAL_ADMIN_EMAIL: '  Founder@Tafera.org ',
        INITIAL_ADMIN_PASSWORD: secret,
        INITIAL_ADMIN_NAME: 'Tafera Founder',
        INITIAL_ADMIN_USERNAME: 'tafera_founder',
      },
      User,
      passwords: passwordService,
      logger: { log: (msg) => logs.push(msg) },
    })

    assert.equal(result.outcome, 'created_admin')
    assert.equal(result.created, true)
    assert.equal(result.promoted, false)
    assert.equal(User.rows.length, 1)

    const stored = User.rows[0]
    assert.equal(stored.email, 'founder@tafera.org')
    assert.equal(stored.fullName, 'Tafera Founder')
    assert.equal(stored.username, 'tafera_founder')
    assert.equal(stored.role, 'admin')
    assert.equal(stored.status, 'active')
    assert.ok(stored.emailVerifiedAt instanceof Date)
    assert.notEqual(stored.passwordHash, secret)
    assert.match(stored.passwordHash, /^\$argon2id\$/)
    assert.equal(await passwordService.verifyPassword(secret, stored.passwordHash), true)

    // Ensure password never appears in console output
    assert.equal(logs.some((line) => line.includes(secret)), false)
  })

  it('promotes an existing regular user matching INITIAL_ADMIN_EMAIL and verifies their email', async () => {
    const User = createInMemoryUserModel([
      {
        id: 'user-existing',
        fullName: 'Ada Existing',
        email: 'ada@tafera.org',
        passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$sFnQNpdPu9GxoLznhPvjCA$AQOaU8UHZB3fbeYdsTe2XfVX3W5RabpuHbfPvryAH7A',
        role: 'user',
        status: 'active',
        authVersion: 1,
        emailVerifiedAt: null,
      },
    ])

    const result = await bootstrapInitialAdmin({
      env: {
        INITIAL_ADMIN_EMAIL: 'ada@tafera.org',
        INITIAL_ADMIN_PASSWORD: 'AnotherStrongPassword!2026',
      },
      User,
      passwords: passwordService,
      logger: { log: () => {} },
    })

    assert.equal(result.outcome, 'promoted_existing_user')
    assert.equal(result.promoted, true)
    assert.equal(result.created, false)
    assert.equal(User.rows.length, 1)
    assert.equal(User.rows[0].role, 'admin')
    assert.ok(User.rows[0].emailVerifiedAt instanceof Date)
  })

  it('aborts safely without creating a second admin if an admin account already exists', async () => {
    const User = createInMemoryUserModel([
      {
        id: 'admin-1',
        fullName: 'Existing Admin',
        email: 'first-admin@tafera.org',
        passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$sFnQNpdPu9GxoLznhPvjCA$AQOaU8UHZB3fbeYdsTe2XfVX3W5RabpuHbfPvryAH7A',
        role: 'admin',
        status: 'active',
        authVersion: 1,
        emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ])
    const logs = []

    const result = await bootstrapInitialAdmin({
      env: {
        INITIAL_ADMIN_EMAIL: 'second-admin@tafera.org',
        INITIAL_ADMIN_PASSWORD: 'SecondStrongPassword!2026',
      },
      User,
      passwords: passwordService,
      logger: { log: (msg) => logs.push(msg) },
    })

    assert.equal(result.outcome, 'aborted_admin_exists')
    assert.equal(result.created, false)
    assert.equal(result.promoted, false)
    assert.equal(User.rows.length, 1)
    assert.match(logs[0], /already exists/i)
  })

  it('allows the bootstrapped admin to log in via authService and pass requireVerifiedEmail + requireAdmin', async () => {
    const User = createInMemoryUserModel([])
    const secret = 'AdminLoginCheckPassword!2026'

    await bootstrapInitialAdmin({
      env: {
        INITIAL_ADMIN_EMAIL: 'ops@tafera.org',
        INITIAL_ADMIN_PASSWORD: secret,
        INITIAL_ADMIN_NAME: 'Ops Admin',
      },
      User,
      passwords: passwordService,
      logger: { log: () => {} },
    })

    const createdSessions = []
    const authService = createAuthService({
      User,
      passwords: passwordService,
      sessions: {
        createAuthenticatedSession: async (req, user) => {
          req.session = { userId: user.id, roleAtLogin: user.role, csrfToken: 'csrf-123' }
          createdSessions.push(user)
        },
      },
    })

    const req = { session: {} }
    const loginResult = await authService.login(
      { email: 'ops@tafera.org', password: secret },
      { req, res: {} },
    )

    assert.equal(loginResult.user.email, 'ops@tafera.org')
    assert.equal(loginResult.user.role, 'admin')
    assert.equal(loginResult.user.emailVerified, true)
    assert.equal(createdSessions.length, 1)

    // Verify requireVerifiedEmail + requireAdmin middlewares accept the bootstrapped admin
    const requireVerifiedEmail = createRequireVerifiedEmail({ User })
    const requireAdmin = createRequireAdmin()
    const authedReq = {
      user: await User.findByPk(loginResult.user.id),
      auth: { userId: loginResult.user.id, role: loginResult.user.role },
    }

    await new Promise((resolve, reject) => {
      requireVerifiedEmail(authedReq, {}, (err) => (err ? reject(err) : resolve()))
    })
    await new Promise((resolve, reject) => {
      requireAdmin(authedReq, {}, (err) => (err ? reject(err) : resolve()))
    })
  })
})
