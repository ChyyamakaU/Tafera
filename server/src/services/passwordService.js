const argon2 = require('argon2')
const {
  ARGON2_AGGREGATE_MEMORY_BUDGET_KIB,
  ARGON2_HASH_LIMITS,
  ARGON2_OPTIONS,
  PASSWORD_HASH_CONCURRENCY,
  PASSWORD_HASH_MAX_QUEUE,
  PASSWORD_MAX_LENGTH,
} = require('../config/password')
const {
  countCharacters,
  passwordSchema,
} = require('../validators/password')
const {
  ConcurrencyLimiter,
  ConcurrencyQueueFullError,
} = require('../utils/concurrency')

const ARGON2ID_PHC_PATTERN =
  /^\$argon2id\$v=([1-9]\d*)\$m=([1-9]\d*),t=([1-9]\d*),p=([1-9]\d*)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/

class PasswordPolicyError extends Error {
  constructor(issues) {
    super('Password does not meet the security requirements.')
    this.name = 'PasswordPolicyError'
    this.code = 'INVALID_PASSWORD'
    this.status = 400
    this.expose = true
    this.details = issues.map(({ message }) => ({
      field: 'password',
      message,
    }))
  }
}

class PasswordServiceBusyError extends Error {
  constructor() {
    super('The password service is temporarily busy. Please try again later.')
    this.name = 'PasswordServiceBusyError'
    this.code = 'PASSWORD_SERVICE_BUSY'
    this.status = 503
    this.expose = true
  }
}

const validatePassword = (password) => {
  const result = passwordSchema.safeParse(password)

  if (!result.success) {
    throw new PasswordPolicyError(result.error.issues)
  }

  return result.data
}

const decodeBase64Component = (component) => {
  // Standard Base64 without padding, as emitted by node-argon2.
  if (component.length % 4 === 1) return null

  const buffer = Buffer.from(component, 'base64')

  if (buffer.length === 0) return null
  if (buffer.toString('base64').replace(/=+$/, '') !== component) {
    return null
  }

  return buffer
}

/**
 * Parses an Argon2id PHC string and validates its encoded parameters against
 * resource-safety and structural limits. Returns null for any unsupported or
 * malformed input. No part of the input is logged or repaired.
 */
const parseStoredArgon2Hash = (storedHash, maxMemoryKib) => {
  if (
    typeof storedHash !== 'string' ||
    storedHash.length === 0 ||
    storedHash.length > ARGON2_HASH_LIMITS.maxEncodedLength
  ) {
    return null
  }

  const match = ARGON2ID_PHC_PATTERN.exec(storedHash)

  if (!match) return null

  const version = Number(match[1])
  const memoryCost = Number(match[2])
  const timeCost = Number(match[3])
  const parallelism = Number(match[4])

  if (
    !Number.isSafeInteger(version) ||
    !Number.isSafeInteger(memoryCost) ||
    !Number.isSafeInteger(timeCost) ||
    !Number.isSafeInteger(parallelism)
  ) {
    return null
  }

  if (version !== ARGON2_HASH_LIMITS.supportedVersion) return null

  if (
    timeCost < ARGON2_HASH_LIMITS.timeMin ||
    timeCost > ARGON2_HASH_LIMITS.timeMax
  ) {
    return null
  }

  if (
    parallelism < ARGON2_HASH_LIMITS.parallelismMin ||
    parallelism > ARGON2_HASH_LIMITS.parallelismMax
  ) {
    return null
  }

  if (
    memoryCost < ARGON2_HASH_LIMITS.memoryMinKib ||
    memoryCost > maxMemoryKib
  ) {
    return null
  }

  if (memoryCost < 8 * parallelism) return null

  const salt = decodeBase64Component(match[5])
  const digest = decodeBase64Component(match[6])

  if (!salt || !digest) return null

  if (
    salt.length < ARGON2_HASH_LIMITS.saltMinBytes ||
    salt.length > ARGON2_HASH_LIMITS.saltMaxBytes
  ) {
    return null
  }

  if (
    digest.length < ARGON2_HASH_LIMITS.digestMinBytes ||
    digest.length > ARGON2_HASH_LIMITS.digestMaxBytes
  ) {
    return null
  }

  return {
    version,
    memoryCost,
    timeCost,
    parallelism,
  }
}

/**
 * Creates a password service with its own concurrency limiter. The default
 * singleton below is what application code should use; the factory exists so
 * the limiter and hasher can be replaced in tests.
 */
const createPasswordService = ({
  concurrency = PASSWORD_HASH_CONCURRENCY,
  maxQueue = PASSWORD_HASH_MAX_QUEUE,
  hasher = argon2,
} = {}) => {
  const limiter = new ConcurrencyLimiter(concurrency, maxQueue)

  // Encoded hashes may use more memory than the current config if they were
  // created with stronger historical settings, but every concurrently active
  // verification must still fit inside the aggregate budget.
  const maxStoredHashMemoryKib = Math.min(
    ARGON2_HASH_LIMITS.memoryMaxKib,
    Math.floor(
      ARGON2_AGGREGATE_MEMORY_BUDGET_KIB / limiter.maxConcurrency,
    ),
  )

  const isAllowedStoredHash = (storedHash) =>
    parseStoredArgon2Hash(storedHash, maxStoredHashMemoryKib) !== null

  const runLimited = async (task) => {
    try {
      return await limiter.run(task)
    } catch (error) {
      if (error instanceof ConcurrencyQueueFullError) {
        throw new PasswordServiceBusyError()
      }

      throw error
    }
  }

  const hashPassword = async (password) => {
    const validated = validatePassword(password)

    return runLimited(() => hasher.hash(validated, ARGON2_OPTIONS))
  }

  const verifyPassword = async (password, storedHash) => {
    if (typeof password !== 'string' || password.length === 0) return false
    if (countCharacters(password) > PASSWORD_MAX_LENGTH) return false
    if (!isAllowedStoredHash(storedHash)) return false

    return runLimited(async () => {
      try {
        return await hasher.verify(storedHash, password)
      } catch {
        // Hash-library failures fail closed without leaking error details.
        return false
      }
    })
  }

  const needsRehash = (storedHash) => {
    if (!isAllowedStoredHash(storedHash)) return true

    try {
      return hasher.needsRehash(storedHash, ARGON2_OPTIONS)
    } catch {
      return true
    }
  }

  return {
    hashPassword,
    verifyPassword,
    needsRehash,
    limiter,
  }
}

const service = createPasswordService()

module.exports = {
  ...service,
  createPasswordService,
  PasswordPolicyError,
  PasswordServiceBusyError,
}
