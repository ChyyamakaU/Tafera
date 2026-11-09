'use strict'

const { after, before, test } = require('node:test')
const assert = require('node:assert/strict')
const { Sequelize, QueryTypes } = require('sequelize')
const { runtimeConfig } = require('../src/config/database')
const migration = require('../src/migrations/20261109000001-add-auth-fields-to-users')

const FUNCTIONAL_INDEX = 'users_email_lower_unique'
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
  const schema = `tafera_auth_test_${process.pid}_${Date.now()}_${schemaCounter}`

  await base.query(`CREATE SCHEMA "${schema}"`, { logging: false })

  const scoped = createSequelize(config, {
    searchPath: schema,
    dialectOptions: {
      ...(config.options.dialectOptions || {}),
      prependSearchPath: true,
    },
  })

  // queryInterface.addColumn/removeColumn qualify the table explicitly. Point
  // the query generator at the temporary schema so the migration cannot touch
  // public.users during tests.
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

const createUsersTable = (scoped) =>
  scoped.query(
    `CREATE TABLE users (
       id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       email varchar NOT NULL,
       CONSTRAINT users_email_key UNIQUE (email)
     )`,
    { logging: false },
  )

const getColumns = (scoped, schema) =>
  scoped.query(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = :schema AND table_name = 'users'
     ORDER BY ordinal_position`,
    {
      replacements: { schema },
      type: QueryTypes.SELECT,
      logging: false,
    },
  )

const getIndexes = (scoped, schema) =>
  scoped.query(
    `SELECT indexname, indexdef
     FROM pg_indexes
     WHERE schemaname = :schema AND tablename = 'users'
     ORDER BY indexname`,
    {
      replacements: { schema },
      type: QueryTypes.SELECT,
      logging: false,
    },
  )

test('adds auth columns and enforces case-insensitive email uniqueness', async (t) => {
  if (!databaseAvailable) {
    return t.skip('PostgreSQL is unavailable; migration integration test skipped')
  }

  await withTemporarySchema(async (scoped, schema) => {
    await createUsersTable(scoped)
    await scoped.query(
      `INSERT INTO users (email)
       VALUES ('  Ada@Example.COM  '), ('GRACE@EXAMPLE.COM')`,
      { logging: false },
    )

    await migration.up(scoped.getQueryInterface(), Sequelize)

    const columns = await getColumns(scoped, schema)
    const byName = Object.fromEntries(
      columns.map((column) => [column.column_name, column]),
    )

    assert.ok(byName.auth_version)
    assert.equal(byName.auth_version.data_type, 'integer')
    assert.equal(byName.auth_version.is_nullable, 'NO')
    assert.match(String(byName.auth_version.column_default), /1/)

    assert.ok(byName.email_verified_at)
    assert.equal(
      byName.email_verified_at.data_type,
      'timestamp with time zone',
    )
    assert.equal(byName.email_verified_at.is_nullable, 'YES')
    assert.equal(byName.email_verified_at.column_default, null)

    const indexes = await getIndexes(scoped, schema)
    const functionalIndex = indexes.find(
      (index) => index.indexname === FUNCTIONAL_INDEX,
    )

    assert.ok(functionalIndex, 'functional unique index must exist')
    assert.match(functionalIndex.indexdef, /unique/i)
    assert.match(functionalIndex.indexdef, /lower\(/i)
    assert.match(functionalIndex.indexdef, /email/i)

    const emails = await scoped.query(
      'SELECT email FROM users ORDER BY email',
      { type: QueryTypes.SELECT, logging: false },
    )
    assert.deepEqual(
      emails.map(({ email }) => email),
      ['ada@example.com', 'grace@example.com'],
    )

    await assert.rejects(
      scoped.query(
        "INSERT INTO users (email) VALUES ('ADA@EXAMPLE.COM')",
        { logging: false },
      ),
      (error) => {
        const isUniqueViolation =
          error.name === 'SequelizeUniqueConstraintError' ||
          error.parent?.code === '23505'

        assert.equal(
          isUniqueViolation,
          true,
          `expected a unique violation, received ${error.name}: ${error.message}`,
        )

        return true
      },
    )
  })
})

test('down removes the index and columns without dropping users', async (t) => {
  if (!databaseAvailable) {
    return t.skip('PostgreSQL is unavailable; migration integration test skipped')
  }

  await withTemporarySchema(async (scoped, schema) => {
    await createUsersTable(scoped)
    await scoped.query(
      "INSERT INTO users (email) VALUES ('Ada@Example.COM')",
      { logging: false },
    )

    const queryInterface = scoped.getQueryInterface()
    await migration.up(queryInterface, Sequelize)
    await migration.down(queryInterface, Sequelize)

    const columns = await getColumns(scoped, schema)
    const columnNames = columns.map(({ column_name }) => column_name).sort()

    assert.deepEqual(columnNames, ['email', 'id'])
    assert.equal(
      columns.some(({ column_name }) => column_name === 'auth_version'),
      false,
    )
    assert.equal(
      columns.some(({ column_name }) => column_name === 'email_verified_at'),
      false,
    )

    const indexes = await getIndexes(scoped, schema)
    assert.equal(
      indexes.some(({ indexname }) => indexname === FUNCTIONAL_INDEX),
      false,
    )

    const tables = await scoped.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = :schema AND table_name = 'users'`,
      {
        replacements: { schema },
        type: QueryTypes.SELECT,
        logging: false,
      },
    )
    assert.equal(tables.length, 1)

    const emails = await scoped.query(
      'SELECT email FROM users',
      { type: QueryTypes.SELECT, logging: false },
    )
    assert.deepEqual(
      emails.map(({ email }) => email),
      ['ada@example.com'],
    )
  })
})

test('aborts on duplicate normalized emails without modifying the schema', async (t) => {
  if (!databaseAvailable) {
    return t.skip('PostgreSQL is unavailable; migration integration test skipped')
  }

  await withTemporarySchema(async (scoped, schema) => {
    await createUsersTable(scoped)
    await scoped.query(
      `INSERT INTO users (email)
       VALUES ('Dup@Example.com'), ('dup@example.com')`,
      { logging: false },
    )

    await assert.rejects(
      migration.up(scoped.getQueryInterface(), Sequelize),
      /duplicate normalized email addresses found/i,
    )

    const columns = await getColumns(scoped, schema)
    assert.equal(
      columns.some(({ column_name }) => column_name === 'auth_version'),
      false,
    )
    assert.equal(
      columns.some(({ column_name }) => column_name === 'email_verified_at'),
      false,
    )
  })
})

test('rolls back column additions when index creation fails', async (t) => {
  if (!databaseAvailable) {
    return t.skip('PostgreSQL is unavailable; migration integration test skipped')
  }

  await withTemporarySchema(async (scoped, schema) => {
    await createUsersTable(scoped)
    await scoped.query(
      "INSERT INTO users (email) VALUES ('Mixed@Example.COM')",
      { logging: false },
    )
    await scoped.query(
      `CREATE INDEX ${FUNCTIONAL_INDEX} ON users (email)`,
      { logging: false },
    )

    await assert.rejects(
      migration.up(scoped.getQueryInterface(), Sequelize),
      /already exists/i,
    )

    const columns = await getColumns(scoped, schema)
    assert.equal(
      columns.some(({ column_name }) => column_name === 'auth_version'),
      false,
    )
    assert.equal(
      columns.some(({ column_name }) => column_name === 'email_verified_at'),
      false,
    )

    const emails = await scoped.query(
      'SELECT email FROM users',
      { type: QueryTypes.SELECT, logging: false },
    )
    assert.deepEqual(
      emails.map(({ email }) => email),
      ['Mixed@Example.COM'],
    )
  })
})
