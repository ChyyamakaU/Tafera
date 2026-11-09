'use strict'

// Hard ceiling for memory reserved by all in-flight Argon2 operations.
const ARGON2_AGGREGATE_MEMORY_BUDGET_KIB = 131072

const ARGON2_CONFIG_LIMITS = Object.freeze({
  memoryMinKib: 19456,
  memoryMaxKib: ARGON2_AGGREGATE_MEMORY_BUDGET_KIB,
  timeMin: 1,
  timeMax: 10,
  parallelismMin: 1,
  parallelismMax: 16,
  concurrencyMin: 1,
  concurrencyMax: 16,
  maxQueueMin: 0,
  maxQueueMax: 1000,
  maxQueueDefault: 50,
})

// Limits applied to parameters encoded inside stored hashes. Historical hashes
// may use weaker parameters than the current configuration, so these are
// resource-safety ceilings rather than exact matches for the current config.
const ARGON2_HASH_LIMITS = Object.freeze({
  supportedVersion: 19,
  maxEncodedLength: 512,
  memoryMinKib: 8192,
  memoryMaxKib: ARGON2_AGGREGATE_MEMORY_BUDGET_KIB,
  timeMin: 1,
  timeMax: ARGON2_CONFIG_LIMITS.timeMax,
  parallelismMin: 1,
  parallelismMax: ARGON2_CONFIG_LIMITS.parallelismMax,
  saltMinBytes: 8,
  saltMaxBytes: 64,
  digestMinBytes: 16,
  digestMaxBytes: 64,
})

module.exports = {
  ARGON2_AGGREGATE_MEMORY_BUDGET_KIB,
  ARGON2_CONFIG_LIMITS,
  ARGON2_HASH_LIMITS,
}
