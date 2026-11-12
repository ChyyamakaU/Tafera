'use strict'

const { after, before, test } = require('node:test')
const assert = require('node:assert/strict')
const { Sequelize, QueryTypes } = require('sequelize')
const { runtimeConfig } = require('../src/config/database')
const journalMigration = require('../src/migrations/20261112000003-create-scrapbook-journals')
const imageMigration = require('../src/migrations/20261112000004-create-scrapbook-images')
const coverIndexMigration = require('../src/migrations/20261112000005-add-scrapbook-image-cover-index')

const TABLE_JOURNALS = 'scrapbook_journals'
const TABLE_IMAGES = 'scrapbook_images'
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
  const schema = `tafera_scrapbook_test_${process.pid}_${Date.now()}_${schemaCounter}`

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
       id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       full_name varchar(255) NOT NULL,
       email varchar(255) NOT NULL,
       password_hash varchar(255) NOT NULL,
       role varchar(255) NOT NULL DEFAULT 'user',
       status varchar(255) NOT NULL DEFAULT 'active',
       auth_version integer NOT NULL DEFAULT 1,
       email_verified_at timestamptz,
       created_at timestamptz NOT NULL DEFAULT now(),
       updated_at timestamptz NOT NULL DEFAULT now()
     )`,
    { logging: false },
  )

const createTripsTable = (scoped) =>
  scoped.query(
    `CREATE TABLE trips (
       id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
       title varchar(255) NOT NULL,
       description text,
       trip_type varchar(255) NOT NULL DEFAULT 'personal',
       start_date date NOT NULL,
       end_date date NOT NULL,
       max_participants integer,
       status varchar(255) NOT NULL DEFAULT 'draft',
       created_at timestamptz NOT NULL DEFAULT now(),
       updated_at timestamptz NOT NULL DEFAULT now()
     )`,
    { logging: false },
  )

const getIndexes = (scoped, schema, table) =>
  scoped.query(
    `SELECT indexname, indexdef
     FROM pg_indexes
     WHERE schemaname = :schema AND tablename = :table
     ORDER BY indexname`,
    {
      replacements: { schema, table },
      type: QueryTypes.SELECT,
      logging: false,
    },
  )

const countCovers = (scoped, journalId) =>
  scoped.query(
    `SELECT count(*) AS cnt FROM "scrapbook_images" WHERE journal_id = :journalId AND is_cover = true`,
    {
      replacements: { journalId },
      type: QueryTypes.SELECT,
      logging: false,
    },
  )

test('up creates scrapbook_journals and scrapbook_images tables', async (t) => {
  if (!databaseAvailable) {
    return t.skip('PostgreSQL is unavailable; migration integration test skipped')
  }

  await withTemporarySchema(async (scoped, schema) => {
    await createUsersTable(scoped)
    await createTripsTable(scoped)

    await journalMigration.up(scoped.getQueryInterface(), Sequelize)
    await imageMigration.up(scoped.getQueryInterface(), Sequelize)

    // Both tables exist.
    const journalIndexes = await getIndexes(scoped, schema, TABLE_JOURNALS)
    assert.ok(
      journalIndexes.some(({ indexname }) => indexname === 'scrapbook_journals_user_id_idx'),
      'scrapbook_journals user_id index must exist',
    )

    const imageIndexes = await getIndexes(scoped, schema, TABLE_IMAGES)
    assert.ok(
      imageIndexes.some(({ indexname }) => indexname === 'scrapbook_images_journal_id_idx'),
      'scrapbook_images journal_id index must exist',
    )

    // A journal can be created without a trip.
    const [user] = await scoped.query(
      `INSERT INTO users (full_name, email, password_hash)
       VALUES ('Test User', 'test@example.com', 'hash')
       RETURNING id`,
      { type: QueryTypes.SELECT, logging: false },
    )

    const [journal] = await scoped.query(
      `INSERT INTO "scrapbook_journals" (user_id, title, description, is_public)
       VALUES (:userId, 'My Journal', 'A personal journal', false)
       RETURNING id`,
      {
        replacements: { userId: user.id },
        type: QueryTypes.SELECT,
        logging: false,
      },
    )
    assert.ok(journal.id, 'journal should have an id')

    // A journal can be created with a trip.
    const [trip] = await scoped.query(
      `INSERT INTO trips (user_id, title, description, trip_type, start_date, end_date, status)
       VALUES (:userId, 'Japan Trip', 'A trip to Japan', 'personal', '2027-03-01', '2027-03-10', 'draft')
       RETURNING id`,
      {
        replacements: { userId: user.id },
        type: QueryTypes.SELECT,
        logging: false,
      },
    )

    const [journalWithTrip] = await scoped.query(
      `INSERT INTO "scrapbook_journals" (user_id, trip_id, title, description, is_public)
       VALUES (:userId, :tripId, 'Trip Journal', 'Journal for Japan trip', true)
       RETURNING id`,
      {
        replacements: { userId: user.id, tripId: trip.id },
        type: QueryTypes.SELECT,
        logging: false,
      },
    )
    assert.ok(journalWithTrip.id, 'journal with trip should have an id')

    // An image can be created for a journal.
    await scoped.query(
      `INSERT INTO "scrapbook_images"
         (journal_id, image_url, public_id, alt_text, caption, display_order, is_cover)
       VALUES
         (:journalId, 'https://res.cloudinary.com/test/img1.jpg', 'scrapbooks/img1', 'Alt text', 'Caption', 1, true)`,
      {
        replacements: { journalId: journal.id },
        type: QueryTypes.SELECT,
        logging: false,
      },
    )
    const [image] = await scoped.query(
      `SELECT id FROM "scrapbook_images" WHERE journal_id = :journalId ORDER BY id DESC LIMIT 1`,
      { replacements: { journalId: journal.id }, type: QueryTypes.SELECT, logging: false },
    )
    assert.ok(image.id, 'image should have an id')
  })
})

test('up creates partial unique index allowing one cover per journal', async (t) => {
  if (!databaseAvailable) {
    return t.skip('PostgreSQL is unavailable; migration integration test skipped')
  }

  await withTemporarySchema(async (scoped, schema) => {
    await createUsersTable(scoped)
    await createTripsTable(scoped)
    await journalMigration.up(scoped.getQueryInterface(), Sequelize)
    await imageMigration.up(scoped.getQueryInterface(), Sequelize)

    const [user] = await scoped.query(
      `INSERT INTO users (full_name, email, password_hash)
       VALUES ('Test User', 'test@example.com', 'hash')
       RETURNING id`,
      { type: QueryTypes.SELECT, logging: false },
    )

    const [journal] = await scoped.query(
      `INSERT INTO "scrapbook_journals" (user_id, title, description, is_public)
       VALUES (:userId, 'My Journal', 'A journal', false)
       RETURNING id`,
      { replacements: { userId: user.id }, type: QueryTypes.SELECT, logging: false },
    )

    // First cover image is allowed.
    await scoped.query(
      `INSERT INTO "scrapbook_images"
         (journal_id, image_url, public_id, display_order, is_cover)
       VALUES (:journalId, 'https://res.cloudinary.com/test/img1.jpg', 'scrapbooks/img1', 1, true)`,
      { replacements: { journalId: journal.id }, logging: false },
    )

    // Create the cover index.
    await coverIndexMigration.up(scoped.getQueryInterface(), Sequelize)

    const indexes = await getIndexes(scoped, schema, TABLE_IMAGES)
    const coverIndex = indexes.find(
      ({ indexname }) => indexname === 'scrapbook_images_one_cover_idx',
    )
    assert.ok(coverIndex, 'partial unique index must exist')
    assert.match(coverIndex.indexdef, /UNIQUE/i)
    assert.match(coverIndex.indexdef, /is_cover/i)

    // A second cover for the same journal is blocked.
    await assert.rejects(
      scoped.query(
        `INSERT INTO "scrapbook_images"
           (journal_id, image_url, public_id, display_order, is_cover)
         VALUES (:journalId, 'https://res.cloudinary.com/test/img2.jpg', 'scrapbooks/img2', 2, true)`,
        {
          replacements: { journalId: journal.id },
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

    // A cover for a different journal is allowed.
    const [journal2] = await scoped.query(
      `INSERT INTO "scrapbook_journals" (user_id, title, description, is_public)
       VALUES (:userId, 'Journal 2', 'Another journal', false)
       RETURNING id`,
      { replacements: { userId: user.id }, type: QueryTypes.SELECT, logging: false },
    )

    await scoped.query(
      `INSERT INTO "scrapbook_images"
         (journal_id, image_url, public_id, display_order, is_cover)
       VALUES (:journalId, 'https://res.cloudinary.com/test/img3.jpg', 'scrapbooks/img3', 1, true)`,
      { replacements: { journalId: journal2.id }, logging: false },
    )
  })
})

test('up cleans up duplicate covers before creating the index', async (t) => {
  if (!databaseAvailable) {
    return t.skip('PostgreSQL is unavailable; migration integration test skipped')
  }

  await withTemporarySchema(async (scoped, schema) => {
    await createUsersTable(scoped)
    await createTripsTable(scoped)
    await journalMigration.up(scoped.getQueryInterface(), Sequelize)
    await imageMigration.up(scoped.getQueryInterface(), Sequelize)

    const [user] = await scoped.query(
      `INSERT INTO users (full_name, email, password_hash)
       VALUES ('Test User', 'test@example.com', 'hash')
       RETURNING id`,
      { type: QueryTypes.SELECT, logging: false },
    )

    const [journal] = await scoped.query(
      `INSERT INTO "scrapbook_journals" (user_id, title, description, is_public)
       VALUES (:userId, 'My Journal', 'A journal', false)
       RETURNING id`,
      { replacements: { userId: user.id }, type: QueryTypes.SELECT, logging: false },
    )

    // Insert two covers for the same journal (duplicate before migration).
    await scoped.query(
      `INSERT INTO "scrapbook_images"
         (journal_id, image_url, public_id, display_order, is_cover)
       VALUES
         (:journalId, 'https://res.cloudinary.com/test/img1.jpg', 'scrapbooks/img1', 1, true),
         (:journalId, 'https://res.cloudinary.com/test/img2.jpg', 'scrapbooks/img2', 2, true)`,
      { replacements: { journalId: journal.id }, logging: false },
    )

    await coverIndexMigration.up(scoped.getQueryInterface(), Sequelize)

    // The index was created.
    const indexes = await getIndexes(scoped, schema, TABLE_IMAGES)
    const coverIndex = indexes.find(
      ({ indexname }) => indexname === 'scrapbook_images_one_cover_idx',
    )
    assert.ok(coverIndex, 'partial unique index must exist')

    // Only one cover remains: the one with lowest display_order.
    const covers = await countCovers(scoped, journal.id)
    assert.equal(Number(covers[0].cnt), 1, 'exactly one cover should remain after cleanup')

    const remainingCover = await scoped.query(
      `SELECT public_id FROM "scrapbook_images" WHERE journal_id = :journalId AND is_cover = true`,
      {
        replacements: { journalId: journal.id },
        type: QueryTypes.SELECT,
        logging: false,
      },
    )
    assert.equal(
      remainingCover[0].public_id,
      'scrapbooks/img1',
      'lowest display_order cover preserved',
    )
  })
})

test('down removes scrapbook_images table and cover index', async (t) => {
  if (!databaseAvailable) {
    return t.skip('PostgreSQL is unavailable; migration integration test skipped')
  }

  await withTemporarySchema(async (scoped, schema) => {
    await createUsersTable(scoped)
    await createTripsTable(scoped)
    await journalMigration.up(scoped.getQueryInterface(), Sequelize)
    await imageMigration.up(scoped.getQueryInterface(), Sequelize)
    await coverIndexMigration.up(scoped.getQueryInterface(), Sequelize)

    const queryInterface = scoped.getQueryInterface()
    await coverIndexMigration.down(queryInterface, Sequelize)
    await imageMigration.down(queryInterface, Sequelize)
    await journalMigration.down(queryInterface, Sequelize)

    // The scrapbook_images table no longer exists.
    const imageIndexes = await getIndexes(scoped, schema, TABLE_IMAGES)
    assert.equal(
      imageIndexes.length,
      0,
      'scrapbook_images table must be dropped',
    )

    // The scrapbook_journals table no longer exists.
    const journalIndexes = await getIndexes(scoped, schema, TABLE_JOURNALS)
    assert.equal(
      journalIndexes.length,
      0,
      'scrapbook_journals table must be dropped',
    )
  })
})
