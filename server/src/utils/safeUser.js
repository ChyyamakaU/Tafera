// Explicit allowlist for user data that may leave the API boundary. Never
// build a response by removing fields from a model instance: new sensitive
// columns would otherwise be exposed by default.
const SAFE_USER_FIELDS = Object.freeze([
  'id',
  'fullName',
  'email',
  'profileImage',
  'bio',
  'role',
  'status',
  'createdAt',
  'updatedAt',
])

const toSafeUser = (user) => {
  if (!user || typeof user !== 'object') return null

  const source =
    typeof user.get === 'function' ? user.get({ plain: true }) : user

  const safeUser = {}

  for (const field of SAFE_USER_FIELDS) {
    if (source[field] !== undefined) {
      safeUser[field] = source[field]
    }
  }

  return safeUser
}

// Adds a derived, non-sensitive verification flag for API responses. The raw
// emailVerifiedAt timestamp is still never exposed.
const toPublicUser = (user) => {
  const safeUser = toSafeUser(user)

  if (!safeUser) return null

  const source =
    typeof user.get === 'function' ? user.get({ plain: true }) : user

  if (source.emailVerifiedAt !== undefined) {
    safeUser.emailVerified = source.emailVerifiedAt !== null
  }

  return safeUser
}

module.exports = {
  SAFE_USER_FIELDS,
  toSafeUser,
  toPublicUser,
}
