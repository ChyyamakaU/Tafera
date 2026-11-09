const argon2 = require('argon2')
const env = require('./env')
const {
  ARGON2_AGGREGATE_MEMORY_BUDGET_KIB,
  ARGON2_HASH_LIMITS,
} = require('./argon2Policy')

const PASSWORD_MIN_LENGTH = env.PASSWORD.minLength
const PASSWORD_MAX_LENGTH = env.PASSWORD.maxLength

// Centralised Argon2id parameters. Every new password hash uses these values;
// changing them causes needsRehash() to flag existing hashes for an upgrade
// after the user's next successful sign-in.
const ARGON2_OPTIONS = Object.freeze({
  type: argon2.argon2id,
  memoryCost: env.PASSWORD.argon2.memoryKib,
  timeCost: env.PASSWORD.argon2.timeCost,
  parallelism: env.PASSWORD.argon2.parallelism,
})

// Each concurrent Argon2 operation reserves memoryCost KiB. The limiter caps
// in-flight hashes/verifies at maxConcurrency, and the environment validation
// guarantees memoryCost × maxConcurrency stays within the aggregate budget.
// Waiting operations are capped by maxQueue so a burst cannot grow memory
// without bound. Node's libuv thread pool defaults to 4 threads, so values
// above 4 mostly queue.
const PASSWORD_HASH_CONCURRENCY = env.PASSWORD.argon2.maxConcurrency
const PASSWORD_HASH_MAX_QUEUE = env.PASSWORD.argon2.maxQueue

module.exports = {
  ARGON2_AGGREGATE_MEMORY_BUDGET_KIB,
  ARGON2_HASH_LIMITS,
  ARGON2_OPTIONS,
  PASSWORD_HASH_CONCURRENCY,
  PASSWORD_HASH_MAX_QUEUE,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
}
