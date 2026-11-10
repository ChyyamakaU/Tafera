'use strict'

process.env.NODE_ENV = 'test'
process.env.SESSION_SECRET =
  'test-only-session-secret-0123456789abcdef'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  BIO_MAX_LENGTH,
  PROFILE_IMAGE_MAX_LENGTH,
  parseProfileUpdate,
  parseUserId,
} = require('../src/validators/profile')
const { ValidationError } = require('../src/utils/authErrors')
const { ProfileNotFoundError } = require('../src/utils/profileErrors')
const {
  createProfileService,
} = require('../src/services/profileService')
const {
  PUBLIC_PROFILE_FIELDS,
  toPublicProfile,
  toPublicUser,
} = require('../src/utils/safeUser')

const detailsFor = (callback) => {
  try {
    callback()
  } catch (error) {
    assert.ok(error instanceof ValidationError)
    assert.equal(error.code, 'VALIDATION_ERROR')
    return error.details
  }

  assert.fail('expected a ValidationError')
}

const buildUser = (overrides = {}) => ({
  id: '00000000-0000-0000-0000-000000000001',
  fullName: 'Ada Lovelace',
  email: 'ada@example.com',
  profileImage: 'https://example.com/ada.png',
  bio: 'Mathematician',
  role: 'user',
  status: 'active',
  authVersion: 3,
  emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
  passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  ...overrides,
})

test('profile updates accept only the permitted fields and trim strings', () => {
  assert.deepEqual(
    parseProfileUpdate({
      fullName: '  Grace Hopper  ',
      bio: '  Computer scientist  ',
      profileImage: '  https://example.com/grace.png  ',
    }),
    {
      fullName: 'Grace Hopper',
      bio: 'Computer scientist',
      profileImage: 'https://example.com/grace.png',
    },
  )
})

test('profile updates treat empty optional strings as null to clear them', () => {
  assert.deepEqual(parseProfileUpdate({ bio: '   ' }), { bio: null })
  assert.deepEqual(parseProfileUpdate({ profileImage: '' }), {
    profileImage: null,
  })
  assert.deepEqual(parseProfileUpdate({ bio: null }), { bio: null })
  assert.deepEqual(parseProfileUpdate({ profileImage: null }), {
    profileImage: null,
  })
})

test('protected and unknown fields are stripped from profile updates', () => {
  const parsed = parseProfileUpdate({
    fullName: 'Grace Hopper',
    role: 'admin',
    status: 'suspended',
    email: 'attacker@example.com',
    emailVerified: true,
    emailVerifiedAt: null,
    authVersion: 99,
    passwordHash: 'not-a-hash',
    id: '00000000-0000-0000-0000-000000000002',
  })

  assert.deepEqual(parsed, { fullName: 'Grace Hopper' })
  assert.equal(Object.hasOwn(parsed, 'role'), false)
  assert.equal(Object.hasOwn(parsed, 'status'), false)
  assert.equal(Object.hasOwn(parsed, 'email'), false)
  assert.equal(Object.hasOwn(parsed, 'authVersion'), false)
  assert.equal(Object.hasOwn(parsed, 'passwordHash'), false)
})

test('an update with no permitted fields is rejected', () => {
  for (const input of [
    {},
    undefined,
    { role: 'admin' },
    { email: 'attacker@example.com' },
    { id: '00000000-0000-0000-0000-000000000002' },
  ]) {
    const details = detailsFor(() => parseProfileUpdate(input))

    assert.deepEqual(details, [
      {
        field: 'request',
        message: 'Provide at least one profile field to update.',
      },
    ])
  }
})

test('invalid profile values are rejected with field-level details', () => {
  const cases = [
    [{ fullName: 'A' }, 'fullName'],
    [{ fullName: 'x'.repeat(101) }, 'fullName'],
    [{ fullName: 42 }, 'fullName'],
    [{ bio: 'x'.repeat(BIO_MAX_LENGTH + 1) }, 'bio'],
    [{ bio: 42 }, 'bio'],
    [{ profileImage: 'not-a-url' }, 'profileImage'],
    [{ profileImage: 'ftp://example.com/a.png' }, 'profileImage'],
    [
      { profileImage: `https://example.com/${'x'.repeat(PROFILE_IMAGE_MAX_LENGTH)}` },
      'profileImage',
    ],
  ]

  for (const [input, field] of cases) {
    const details = detailsFor(() => parseProfileUpdate(input))

    assert.equal(
      details.some((detail) => detail.field === field),
      true,
      `expected a ${field} validation error for ${JSON.stringify(input)}`,
    )
  }
})

test('user identifiers must be UUIDs and are normalised to lowercase', () => {
  assert.deepEqual(
    parseUserId({
      userId: 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE',
    }),
    { userId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
  )

  for (const input of [{}, { userId: 'me' }, { userId: '123' }]) {
    const details = detailsFor(() => parseUserId(input))

    assert.equal(details[0].field, 'userId')
  }
})

test('public profile serialization exposes only the public allowlist', () => {
  const profile = toPublicProfile(buildUser())

  assert.deepEqual(
    Object.keys(profile).sort(),
    [...PUBLIC_PROFILE_FIELDS].sort(),
  )
  assert.deepEqual(profile, {
    id: '00000000-0000-0000-0000-000000000001',
    fullName: 'Ada Lovelace',
    profileImage: 'https://example.com/ada.png',
    bio: 'Mathematician',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  })

  const serialized = JSON.stringify(profile)
  for (const sensitive of [
    'ada@example.com',
    'passwordHash',
    'authVersion',
    'emailVerified',
    'emailVerifiedAt',
    'role',
    'status',
    'updatedAt',
  ]) {
    assert.equal(serialized.includes(sensitive), false)
  }

  assert.equal(toPublicProfile(null), null)
})

test('authenticated user serialization keeps email and verification state', () => {
  const user = toPublicUser(buildUser())

  assert.equal(user.email, 'ada@example.com')
  assert.equal(user.emailVerified, true)
  assert.equal(Object.hasOwn(user, 'passwordHash'), false)
  assert.equal(Object.hasOwn(user, 'authVersion'), false)
  assert.equal(Object.hasOwn(user, 'emailVerifiedAt'), false)
})

test('public profile lookup filters inactive accounts and uses the allowlist', async () => {
  const calls = []
  const user = buildUser()
  const User = {
    async findOne(options) {
      calls.push(options)
      return user
    },
  }
  const service = createProfileService({ User })

  const profile = await service.getPublicProfile(user.id)

  assert.deepEqual(profile, toPublicProfile(user))
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].where, {
    id: user.id,
    status: 'active',
  })
  assert.deepEqual(calls[0].attributes, [...PUBLIC_PROFILE_FIELDS])
})

test('missing and suspended public profiles return the same not-found error', async () => {
  const service = createProfileService({
    User: {
      async findOne() {
        return null
      },
    },
  })

  await assert.rejects(
    service.getPublicProfile('00000000-0000-0000-0000-000000000001'),
    (error) => {
      assert.ok(error instanceof ProfileNotFoundError)
      assert.equal(error.code, 'PROFILE_NOT_FOUND')
      assert.equal(error.status, 404)
      assert.equal(error.expose, true)
      assert.equal(error.message, 'Profile not found.')
      return true
    },
  )
})

test('profile updates pass only the validated input to the user record', async () => {
  const updates = []
  const user = {
    id: '00000000-0000-0000-0000-000000000001',
    async update(values) {
      updates.push(values)
      return this
    },
  }
  const service = createProfileService({ User: {} })

  const result = await service.updateOwnProfile(user, {
    fullName: 'Grace Hopper',
    bio: null,
  })

  assert.equal(result, user)
  assert.deepEqual(updates, [{ fullName: 'Grace Hopper', bio: null }])
})
