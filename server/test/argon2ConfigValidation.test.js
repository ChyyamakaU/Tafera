'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const SERVER_DIR = path.resolve(__dirname, '..')
const SESSION_SECRET = 'test-only-session-secret-0123456789abcdef'

const baseEnv = {
  ...process.env,
  NODE_ENV: 'test',
  SESSION_SECRET,
  DB_NAME: 'tafera_test',
  DB_USER: 'tafera_test_user',
  DATABASE_URL: '',
  CLIENT_URL: '',
  REDIS_URL: '',
  CLOUDINARY_CLOUD_NAME: '',
  CLOUDINARY_API_KEY: '',
  CLOUDINARY_API_SECRET: '',
  ARGON2_MEMORY_KIB: '19456',
  ARGON2_TIME_COST: '2',
  ARGON2_PARALLELISM: '1',
  ARGON2_MAX_CONCURRENCY: '2',
  ARGON2_MAX_QUEUE: '50',
}

const runWithEnvironment = (overrides = {}) =>
  spawnSync(process.execPath, ['-e', "require('./src/config/env')"], {
    cwd: SERVER_DIR,
    env: { ...baseEnv, ...overrides },
    encoding: 'utf8',
  })

test('accepts the baseline Argon2 configuration', () => {
  const result = runWithEnvironment()

  assert.equal(result.status, 0, result.stderr)
})

test('accepts the higher-memory Argon2 configuration', () => {
  const result = runWithEnvironment({
    ARGON2_MEMORY_KIB: '47104',
    ARGON2_TIME_COST: '1',
    ARGON2_PARALLELISM: '1',
    ARGON2_MAX_CONCURRENCY: '2',
  })

  assert.equal(result.status, 0, result.stderr)
})

test('accepts a configuration exactly at the aggregate memory limit', () => {
  const result = runWithEnvironment({
    ARGON2_MEMORY_KIB: '65536',
    ARGON2_TIME_COST: '1',
    ARGON2_PARALLELISM: '1',
    ARGON2_MAX_CONCURRENCY: '2',
  })

  assert.equal(result.status, 0, result.stderr)
})

test('rejects a configuration above the aggregate memory limit', () => {
  const result = runWithEnvironment({
    ARGON2_MEMORY_KIB: '65536',
    ARGON2_TIME_COST: '1',
    ARGON2_PARALLELISM: '1',
    ARGON2_MAX_CONCURRENCY: '3',
  })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /aggregate Argon2 memory budget/i)
  assert.equal(result.stderr.includes(SESSION_SECRET), false)
})

test('rejects individual memory above the aggregate budget', () => {
  const result = runWithEnvironment({
    ARGON2_MEMORY_KIB: '131073',
    ARGON2_MAX_CONCURRENCY: '1',
  })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /ARGON2_MEMORY_KIB/)
})

test('rejects an invalid queue capacity', () => {
  const result = runWithEnvironment({
    ARGON2_MAX_QUEUE: '1001',
  })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /ARGON2_MAX_QUEUE/)
})
