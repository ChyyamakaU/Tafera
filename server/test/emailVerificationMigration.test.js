'use strict'

const { after, before, test } = require('node:test')
const assert = require('node:assert/strict')
const { Sequelize, QueryTypes } = require('sequelize')
const { runtimeConfig } = require('../src/config/database')
const migration = require('../src/migrations/20261110000001-create-email-verification-tokens')

const TABLE = 'email_verification_tokens'
const IS_PRODUCTION = process.env.NODE_ENV === 'production'

const createSequelize = (config, overrides = {}) => {
  const options = {
    ...config.options,
    logging: false,
    ...overrides,
  }

  if (config.url) {
    return new Sequelize(config.url, options)
  }

  return new Sequelize(config.database, config.username, config.password, {
    ...options,
    host: config.host,
    port: config.port,
  })
}

let base
let databaseAvailable = false
let schemaCounter = 0

before(async () => {
  if (IS_PRODUCTION) return

  try {
    const config = runtimeConfig()
    base = createSequelize(config)
    await base.authenticate()
    databaseAvailable = true
  } catch {
    databaseAvailable = false
  }
})

after(async () => {
  if (base) {
    await base.close().catch(() => {})
  }
})

const withTemporarySchema = async (callback) => {
  const config = runtimeConfig()
  schemaCounter += 1
  const schema = `tafera_email_verify_test_${process.pid}_${Date.now()}_${schemaCounter}`

  await base.query(`CREATE SCHEMA "${schema}"`, { logging: false })

  const scoped = createSequelize(config, {
    searchPath: schema,
    dialectOptions: {
      ...(config.options.dialectOptions || {}),
      prependSearchPath: true,
    },
  })

  scoped.getQueryInterface().queryGenerator.options.schema = schema

  try {
    await callback(scoped, schema)
  } finally {
    await scoped.close().catch(() => {})
    await base.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`, {
      logging: false,
    })
  }
}

const getColumns = (scoped, schema) =>
  scoped.query(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = :schema AND table_name = :table
     ORDER BY ordinal_position`,
    {
      replacements: { schema, table: TABLE },
      type: QueryTypes.SELECT,
      logging: false,
    },
  )

const getIndexes = (scoped, schema) =>
  scoped.query(
    `SELECT indexname, indexdef
     FROM pg_indexes
     WHERE schemaname = :schema AND tablename = :table
     ORDER BY indexname`,
    {
      replacements: { schema, table: TABLE },
      type: QueryTypes.SELECT,
      logging: false,
    },
  )

const getForeignKeys = (scoped, schema) =>
  scoped.query(
    `SELECT conname, pg_get_constraintdef(oid) AS definition
     FROM pg_constraint
     WHERE conrelid = (:qualified)::regclass AND contype = 'f'`,
    {
      replacements: { qualified: `"${schema}"."${TABLE}"` },
      type: QueryTypes.SELECT,
      logging: false,
    },
  )

test('creates the token table, indexes and user foreign key', async (t) => {
  if (!databaseAvailable) {
    return t.skip(
      'PostgreSQL is unavailable; email verification migration test skipped',
    )
  }

  await withTemporarySchema(async (scoped, schema) => {
    await scoped.query(
      'CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid())',
      { logging: false },
    )

    await migration.up(scoped.getQueryInterface(), Sequelize)

    const columns = await getColumns(scoped, schema)
    const byName = Object.fromEntries(
      columns.map((column) => [column.column_name, column]),
    )

    assert.deepEqual(Object.keys(byName).sort(), [
      'consumed_at',
      'created_at',
      'expires_at',
      'id',
      'token_hash',
      'updated_at',
      'user_id',
    ])
    assert.equal(byName.token_hash.is_nullable, 'NO')
    assert.equal(byName.expires_at.is_nullable, 'NO')
    assert.equal(byName.consumed_at.is_nullable, 'YES')
    assert.equal(byName.user_id.is_nullable, 'NO')

    const indexes = await getIndexes(scoped, schema)
    const byIndex = Object.fromEntries(
      indexes.map((index) => [index.indexname, index.indexdef]),
    )

    assert.match(
      byIndex.email_verification_tokens_token_hash_unique,
      /UNIQUE INDEX .* \(token_hash\)/,
    )
    assert.match(
      byIndex.email_verification_tokens_user_created_at_idx,
      /\(user_id, created_at\)/,
    )

    const foreignKeys = await getForeignKeys(scoped, schema)
    assert.equal(foreignKeys.length, 1)
    assert.match(foreignKeys[0].definition, /REFERENCES users\(id\)/)
    assert.match(foreignKeys[0].definition, /ON DELETE CASCADE/)

    const [user] = await scoped.query(
      'INSERT INTO users DEFAULT VALUES RETURNING id',
      { type: QueryTypes.SELECT, logging: false },
    )

    await scoped.query(
      `INSERT INTO ${TABLE}
         (user_id, token_hash, expires_at)
       VALUES (:userId, :hash, now() + interval '1 hour')`,
      {
        replacements: { userId: user.id, hash: 'a'.repeat(64) },
        logging: false,
      },
    )

    await scoped.query('DELETE FROM users WHERE id = :id', {
      replacements: { id: user.id },
      logging: false,
    })

    const [{ count }] = await scoped.query(
      `SELECT COUNT(*)::int AS count FROM ${TABLE}`,
      { type: QueryTypes.SELECT, logging: false },
    )
    assert.equal(count, 0)
  })
})

test('down drops the token table', async (t) => {
  if (!databaseAvailable) {
    return t.skip(
      'PostgreSQL is unavailable; email verification migration test skipped',
    )
  }

  await withTemporarySchema(async (scoped, schema) => {
    await scoped.query(
      'CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid())',
      { logging: false },
    )

    await migration.up(scoped.getQueryInterface(), Sequelize)
    await migration.down(scoped.getQueryInterface(), Sequelize)

    const tables = await scoped.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = :schema AND table_name = :table`,
      {
        replacements: { schema, table: TABLE },
        type: QueryTypes.SELECT,
        logging: false,
      },
    )

    assert.equal(tables.length, 0)
  })
})
