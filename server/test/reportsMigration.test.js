'use strict'

const { after, before, test } = require('node:test')
const assert = require('node:assert/strict')
const { Sequelize, QueryTypes } = require('sequelize')
const { runtimeConfig } = require('../src/config/database')
const migration = require('../src/migrations/20261112000001-update-reports-enums-and-index')

const TABLE = 'reports'
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
  const schema = `tafera_reports_test_${process.pid}_${Date.now()}_${schemaCounter}`

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

const createUsersTable = (scoped) =>
  scoped.query(
    `CREATE TABLE users (
       id uuid PRIMARY KEY DEFAULT gen_random_uuid()
     )`,
    { logging: false },
  )

// Creates the reports table exactly as the original create-reports migration
// did, so the new migration can be tested as an evolution of that schema.
const createReportsTable = (scoped) =>
  scoped.query(
    `CREATE TYPE "enum_reports_target_type" AS ENUM ('user', 'post', 'comment');
     CREATE TYPE "enum_reports_reason" AS ENUM (
       'spam', 'harassment', 'inappropriate_content', 'impersonation',
       'misinformation', 'other'
     );
     CREATE TYPE "enum_reports_status" AS ENUM (
       'pending', 'reviewed', 'resolved', 'dismissed'
     );
     CREATE TABLE "${TABLE}" (
       id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       reporter_id uuid REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
       target_type "enum_reports_target_type" NOT NULL,
       target_id uuid NOT NULL,
       reason "enum_reports_reason" NOT NULL,
       description text,
       status "enum_reports_status" NOT NULL DEFAULT 'pending',
       reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
       reviewed_at timestamptz,
       resolution_note text,
       created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
       updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`,
    { logging: false },
  )

const getEnumLabels = (scoped, schema, type) =>
  scoped.query(
    `SELECT e.enumlabel
     FROM pg_enum e
     JOIN pg_type t ON e.enumtypid = t.oid
     JOIN pg_namespace n ON t.typnamespace = n.oid
     WHERE n.nspname = :schema AND t.typname = :type
     ORDER BY e.enumsortorder`,
    {
      replacements: { schema, type },
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

test('up adds trip to target_type and under_review to status, preserves reviewed data, and creates the active-report index', async (t) => {
  if (!databaseAvailable) {
    return t.skip('PostgreSQL is unavailable; migration integration test skipped')
  }

  await withTemporarySchema(async (scoped, schema) => {
    await createUsersTable(scoped)
    await createReportsTable(scoped)

    // Existing data before the migration.
    const [reporter] = await scoped.query(
      'INSERT INTO users DEFAULT VALUES RETURNING id',
      { type: QueryTypes.SELECT, logging: false },
    )
    const [target] = await scoped.query(
      'INSERT INTO users DEFAULT VALUES RETURNING id',
      { type: QueryTypes.SELECT, logging: false },
    )

    await scoped.query(
      `INSERT INTO "${TABLE}"
         (reporter_id, target_type, target_id, reason, status)
       VALUES (:reporterId, 'user', :targetId, 'harassment', 'reviewed')`,
      {
        replacements: { reporterId: reporter.id, targetId: target.id },
        logging: false,
      },
    )

    const beforeStatus = await getEnumLabels(scoped, schema, 'enum_reports_status')
    const beforeTarget = await getEnumLabels(scoped, schema, 'enum_reports_target_type')
    assert.deepEqual(
      beforeStatus.map(({ enumlabel }) => enumlabel),
      ['pending', 'reviewed', 'resolved', 'dismissed'],
    )
    assert.deepEqual(
      beforeTarget.map(({ enumlabel }) => enumlabel),
      ['user', 'post', 'comment'],
    )

    await migration.up(scoped.getQueryInterface(), Sequelize)

    // Status vocabulary changed: 'reviewed' -> 'under_review', data preserved.
    const afterStatus = await getEnumLabels(scoped, schema, 'enum_reports_status')
    assert.deepEqual(
      afterStatus.map(({ enumlabel }) => enumlabel),
      ['pending', 'under_review', 'resolved', 'dismissed'],
    )

    const afterTarget = await getEnumLabels(scoped, schema, 'enum_reports_target_type')
    assert.deepEqual(
      afterTarget.map(({ enumlabel }) => enumlabel),
      ['user', 'post', 'comment', 'trip'],
    )

    // The report previously stored as 'reviewed' is now 'under_review'.
    const [report] = await scoped.query(
      `SELECT status FROM "${TABLE}" WHERE reporter_id = :reporterId`,
      {
        replacements: { reporterId: reporter.id },
        type: QueryTypes.SELECT,
        logging: false,
      },
    )
    assert.equal(report.status, 'under_review')

    // A trip target can now be reported.
    await scoped.query(
      `INSERT INTO "${TABLE}"
         (reporter_id, target_type, target_id, reason, status)
       VALUES (:reporterId, 'trip', :targetId, 'spam', 'pending')`,
      {
        replacements: { reporterId: reporter.id, targetId: target.id },
        logging: false,
      },
    )

    // The partial unique index exists and blocks a duplicate active report.
    const indexes = await getIndexes(scoped, schema)
    const activeIndex = indexes.find(
      ({ indexname }) =>
        indexname === 'reports_reporter_target_active_idx',
    )
    assert.ok(activeIndex, 'partial unique index must exist')
    assert.match(activeIndex.indexdef, /UNIQUE/i)
    assert.match(activeIndex.indexdef, /reporter_id/i)
    assert.match(activeIndex.indexdef, /target_type/i)
    assert.match(activeIndex.indexdef, /target_id/i)
    assert.match(activeIndex.indexdef, /pending/i)
    assert.match(activeIndex.indexdef, /under_review/i)

    await assert.rejects(
      scoped.query(
        `INSERT INTO "${TABLE}"
           (reporter_id, target_type, target_id, reason, status)
         VALUES (:reporterId, 'user', :targetId, 'spam', 'pending')`,
        {
          replacements: { reporterId: reporter.id, targetId: target.id },
          logging: false,
        },
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

test('up rolls back all changes when a duplicate active report blocks the index', async (t) => {
  if (!databaseAvailable) {
    return t.skip('PostgreSQL is unavailable; migration integration test skipped')
  }

  await withTemporarySchema(async (scoped, schema) => {
    await createUsersTable(scoped)
    await createReportsTable(scoped)

    const [reporter] = await scoped.query(
      'INSERT INTO users DEFAULT VALUES RETURNING id',
      { type: QueryTypes.SELECT, logging: false },
    )
    const [target] = await scoped.query(
      'INSERT INTO users DEFAULT VALUES RETURNING id',
      { type: QueryTypes.SELECT, logging: false },
    )

    // Two pre-existing active reports for the same reporter and target.
    // The original schema has no unique constraint, so both rows can exist.
    await scoped.query(
      `INSERT INTO "${TABLE}"
         (reporter_id, target_type, target_id, reason, status)
       VALUES (:reporterId, 'user', :targetId, 'harassment', 'pending')`,
      {
        replacements: { reporterId: reporter.id, targetId: target.id },
        logging: false,
      },
    )
    await scoped.query(
      `INSERT INTO "${TABLE}"
         (reporter_id, target_type, target_id, reason, status)
       VALUES (:reporterId, 'user', :targetId, 'spam', 'pending')`,
      {
        replacements: { reporterId: reporter.id, targetId: target.id },
        logging: false,
      },
    )

    const queryInterface = scoped.getQueryInterface()

    // The partial unique index cannot be created because a duplicate active
    // report already exists, so the whole up transaction must roll back.
    await assert.rejects(
      migration.up(queryInterface, Sequelize),
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

    // The status enum still uses 'reviewed' (the rename was rolled back).
    const afterStatus = await getEnumLabels(scoped, schema, 'enum_reports_status')
    assert.deepEqual(
      afterStatus.map(({ enumlabel }) => enumlabel),
      ['pending', 'reviewed', 'resolved', 'dismissed'],
    )

    // The target_type enum still does not include 'trip' (ADD VALUE rolled back).
    const afterTarget = await getEnumLabels(scoped, schema, 'enum_reports_target_type')
    assert.deepEqual(
      afterTarget.map(({ enumlabel }) => enumlabel),
      ['user', 'post', 'comment'],
    )

    // The partial unique index does not exist (index creation was rolled back).
    const indexes = await getIndexes(scoped, schema)
    assert.equal(
      indexes.some(({ indexname }) => indexname === 'reports_reporter_target_active_idx'),
      false,
      'partial unique index must not exist after rollback',
    )

    // Existing report data remains intact.
    const reports = await scoped.query(
      `SELECT target_type, status FROM "${TABLE}" WHERE reporter_id = :reporterId ORDER BY reason`,
      {
        replacements: { reporterId: reporter.id },
        type: QueryTypes.SELECT,
        logging: false,
      },
    )
    assert.deepEqual(
      reports.map(({ target_type, status }) => ({ target_type, status })),
      [
        { target_type: 'user', status: 'pending' },
        { target_type: 'user', status: 'pending' },
      ],
    )
  })
})

test('down restores previous enums and removes the index without losing data', async (t) => {
  if (!databaseAvailable) {
    return t.skip('PostgreSQL is unavailable; migration integration test skipped')
  }

  await withTemporarySchema(async (scoped, schema) => {
    await createUsersTable(scoped)
    await createReportsTable(scoped)

    const [reporter] = await scoped.query(
      'INSERT INTO users DEFAULT VALUES RETURNING id',
      { type: QueryTypes.SELECT, logging: false },
    )
    const [target] = await scoped.query(
      'INSERT INTO users DEFAULT VALUES RETURNING id',
      { type: QueryTypes.SELECT, logging: false },
    )

    await scoped.query(
      `INSERT INTO "${TABLE}"
         (reporter_id, target_type, target_id, reason, status)
       VALUES (:reporterId, 'post', :targetId, 'spam', 'pending')`,
      {
        replacements: { reporterId: reporter.id, targetId: target.id },
        logging: false,
      },
    )

    const queryInterface = scoped.getQueryInterface()
    await migration.up(queryInterface, Sequelize)
    await migration.down(queryInterface, Sequelize)

    // Status vocabulary restored to previous values.
    const afterStatus = await getEnumLabels(scoped, schema, 'enum_reports_status')
    assert.deepEqual(
      afterStatus.map(({ enumlabel }) => enumlabel),
      ['pending', 'reviewed', 'resolved', 'dismissed'],
    )

    // Target type vocabulary restored to previous values.
    const afterTarget = await getEnumLabels(scoped, schema, 'enum_reports_target_type')
    assert.deepEqual(
      afterTarget.map(({ enumlabel }) => enumlabel),
      ['user', 'post', 'comment'],
    )

    // The partial unique index was removed.
    const indexes = await getIndexes(scoped, schema)
    assert.equal(
      indexes.some(({ indexname }) => indexname === 'reports_reporter_target_active_idx'),
      false,
      'partial unique index must be removed',
    )

    // Report data was preserved through up and down.
    const [report] = await scoped.query(
      `SELECT status FROM "${TABLE}" WHERE reporter_id = :reporterId`,
      {
        replacements: { reporterId: reporter.id },
        type: QueryTypes.SELECT,
        logging: false,
      },
    )
    assert.equal(report.status, 'pending')
  })
})

test('down fails when a trip report exists, leaving all changes intact', async (t) => {
  if (!databaseAvailable) {
    return t.skip('PostgreSQL is unavailable; migration integration test skipped')
  }

  await withTemporarySchema(async (scoped, schema) => {
    await createUsersTable(scoped)
    await createReportsTable(scoped)

    const [reporter] = await scoped.query(
      'INSERT INTO users DEFAULT VALUES RETURNING id',
      { type: QueryTypes.SELECT, logging: false },
    )
    const [target] = await scoped.query(
      'INSERT INTO users DEFAULT VALUES RETURNING id',
      { type: QueryTypes.SELECT, logging: false },
    )

    const queryInterface = scoped.getQueryInterface()
    await migration.up(queryInterface, Sequelize)

    // Create an active trip report after up.
    await scoped.query(
      `INSERT INTO "${TABLE}"
         (reporter_id, target_type, target_id, reason, status)
       VALUES (:reporterId, 'trip', :targetId, 'spam', 'pending')`,
      {
        replacements: { reporterId: reporter.id, targetId: target.id },
        logging: false,
      },
    )

    // Down must fail because the target_type cast cannot convert 'trip' to
    // the restored enum that lacks 'trip'.
    await assert.rejects(
      migration.down(queryInterface, Sequelize),
      (error) => {
        const isCastFailure =
          error.parent?.code === '22P02' ||
          /invalid input value for enum/.test(error.message)

        assert.equal(
          isCastFailure,
          true,
          `expected a cast/enum failure, received ${error.name}: ${error.message}`,
        )

        return true
      },
    )

    // The partial unique index still exists (the DROP INDEX was rolled back).
    const indexes = await getIndexes(scoped, schema)
    assert.ok(
      indexes.some(({ indexname }) => indexname === 'reports_reporter_target_active_idx'),
      'partial unique index must still exist',
    )

    // The status enum still uses 'under_review' (the rename was rolled back).
    const afterStatus = await getEnumLabels(scoped, schema, 'enum_reports_status')
    assert.deepEqual(
      afterStatus.map(({ enumlabel }) => enumlabel),
      ['pending', 'under_review', 'resolved', 'dismissed'],
    )

    // The target_type enum still includes 'trip' (the recreation was rolled back).
    const afterTarget = await getEnumLabels(scoped, schema, 'enum_reports_target_type')
    assert.deepEqual(
      afterTarget.map(({ enumlabel }) => enumlabel),
      ['user', 'post', 'comment', 'trip'],
    )

    // Existing report records remain intact.
    const reports = await scoped.query(
      `SELECT target_type, status FROM "${TABLE}" WHERE reporter_id = :reporterId ORDER BY target_type`,
      {
        replacements: { reporterId: reporter.id },
        type: QueryTypes.SELECT,
        logging: false,
      },
    )
    assert.deepEqual(
      reports.map(({ target_type, status }) => ({ target_type, status })),
      [
        { target_type: 'trip', status: 'pending' },
      ],
    )
  })
})
