'use strict'

process.env.NODE_ENV = 'development'
process.env.SESSION_SECRET =
  'test-only-session-secret-0123456789abcdef'
process.env.DB_NAME = process.env.DB_NAME || 'tafera'
process.env.DB_USER = process.env.DB_USER || 'tafera_user'
process.env.ARGON2_MAX_QUEUE = '50'

const { test, before, after, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { Sequelize, DataTypes, QueryTypes } = require('sequelize')
const { runtimeConfig } = require('../src/config/database')
const UserModel = require('../src/models/user')
const TripModel = require('../src/models/trip')
const ScrapbookJournalModel = require('../src/models/scrapbookJournal')
const ScrapbookImageModel = require('../src/models/scrapbookImage')

let base = null
let scoped = null
let User = null
let Trip = null
let ScrapbookJournal = null
let ScrapbookImage = null
let schema = null
let databaseAvailable = false

before(async () => {
  const config = runtimeConfig()
  const connection = {
    ...config.options,
    host: config.host,
    port: config.port,
    logging: false,
  }

  base = new Sequelize(
    config.database,
    config.username,
    config.password,
    connection,
  )

  try {
    await base.authenticate()

    schema = `tafera_scrapbook_model_${process.pid}_${Date.now()}`
    await base.query(`CREATE SCHEMA "${schema}"`)
    await base.query(
      `CREATE TYPE "${schema}".enum_users_role AS ENUM ('user', 'admin')`,
    )
    await base.query(
      `CREATE TYPE "${schema}".enum_users_status AS ENUM ('active', 'suspended')`,
    )
    await base.query(
      `CREATE TYPE "${schema}".enum_trips_trip_type AS ENUM ('personal', 'group')`,
    )
    await base.query(
      `CREATE TYPE "${schema}".enum_trips_status AS ENUM ('draft', 'published', 'cancelled', 'completed')`,
    )
    await base.query(
      `CREATE TABLE "${schema}".users (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         full_name varchar(255) NOT NULL,
          username varchar(30),
          city varchar(100),
          state varchar(100),
          website_url varchar(500),
          instagram_url varchar(500),
          tiktok_url varchar(500),
          youtube_url varchar(500),
         email varchar(255) NOT NULL,
         password_hash varchar(255) NOT NULL,
         profile_image varchar(255),
         profile_image_public_id varchar(255),
         bio text,
         role "${schema}".enum_users_role NOT NULL DEFAULT 'user',
         status "${schema}".enum_users_status NOT NULL DEFAULT 'active',
         auth_version integer NOT NULL DEFAULT 1,
         email_verified_at timestamptz,
         created_at timestamptz NOT NULL DEFAULT now(),
         updated_at timestamptz NOT NULL DEFAULT now()
       )`,
    )
    await base.query(
      `CREATE UNIQUE INDEX users_email_lower_unique
       ON "${schema}".users (lower(email))`,
    )
    await base.query(
      `CREATE TABLE "${schema}".trips (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         user_id uuid NOT NULL REFERENCES "${schema}".users(id)
           ON DELETE CASCADE ON UPDATE CASCADE,
         title varchar(255) NOT NULL,
         description text,
         trip_type "${schema}".enum_trips_trip_type NOT NULL DEFAULT 'personal',
         start_date date NOT NULL,
         end_date date NOT NULL,
         max_participants integer,
         status "${schema}".enum_trips_status NOT NULL DEFAULT 'draft',
         created_at timestamptz NOT NULL DEFAULT now(),
         updated_at timestamptz NOT NULL DEFAULT now()
       )`,
    )
    await base.query(
      `CREATE TABLE "${schema}".scrapbook_journals (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         user_id uuid NOT NULL REFERENCES "${schema}".users(id)
           ON DELETE CASCADE ON UPDATE CASCADE,
         trip_id uuid REFERENCES "${schema}".trips(id)
           ON DELETE SET NULL ON UPDATE CASCADE,
         title varchar(255) NOT NULL,
         description text,
         is_public boolean NOT NULL DEFAULT false,
         created_at timestamptz NOT NULL DEFAULT now(),
         updated_at timestamptz NOT NULL DEFAULT now()
       )`,
    )
    await base.query(
      `CREATE TABLE "${schema}".scrapbook_images (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         journal_id uuid NOT NULL REFERENCES "${schema}".scrapbook_journals(id)
           ON DELETE CASCADE ON UPDATE CASCADE,
         image_url varchar(255) NOT NULL,
         public_id varchar(255) NOT NULL,
         alt_text varchar(255),
         caption text,
         taken_at timestamptz,
         display_order integer NOT NULL DEFAULT 0,
         is_cover boolean NOT NULL DEFAULT false,
         created_at timestamptz NOT NULL DEFAULT now(),
         updated_at timestamptz NOT NULL DEFAULT now()
       )`,
    )

    // Create partial unique index: at most one cover per journal.
    await base.query(
      `CREATE UNIQUE INDEX "scrapbook_images_one_cover_idx"
       ON "${schema}".scrapbook_images ("journal_id")
       WHERE "is_cover" = true`,
    )

    scoped = new Sequelize(
      config.database,
      config.username,
      config.password,
      {
        ...connection,
        searchPath: schema,
        dialectOptions: {
          ...(config.options.dialectOptions || {}),
          prependSearchPath: true,
        },
      },
    )

    await scoped.authenticate()
    User = UserModel(scoped, DataTypes)
    Trip = TripModel(scoped, DataTypes)
    ScrapbookJournal = ScrapbookJournalModel(scoped, DataTypes)
    ScrapbookImage = ScrapbookImageModel(scoped, DataTypes)

    User.hasMany(ScrapbookJournal, {
      foreignKey: 'userId',
      as: 'scrapbooks',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })
    ScrapbookJournal.belongsTo(User, {
      foreignKey: 'userId',
      as: 'user',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })

    Trip.hasMany(ScrapbookJournal, {
      foreignKey: 'tripId',
      as: 'scrapbooks',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })
    ScrapbookJournal.belongsTo(Trip, {
      foreignKey: 'tripId',
      as: 'trip',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })

    ScrapbookJournal.hasMany(ScrapbookImage, {
      foreignKey: 'journalId',
      as: 'images',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })
    ScrapbookImage.belongsTo(ScrapbookJournal, {
      foreignKey: 'journalId',
      as: 'journal',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })

    databaseAvailable = true
  } catch {
    databaseAvailable = false
  }
})

after(async () => {
  if (base && schema) {
    await base
      .query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      .catch(() => {})
  }
  if (scoped) {
    await scoped.close().catch(() => {})
  }
  if (base) {
    await base.close().catch(() => {})
  }
})

beforeEach(async () => {
  if (databaseAvailable) {
    await base.query(
      `TRUNCATE TABLE "${schema}".scrapbook_images,
         "${schema}".scrapbook_journals,
         "${schema}".trips,
         "${schema}".users CASCADE`,
    )
  }
})

const skip = (t) => {
  if (!databaseAvailable) {
    t.skip('PostgreSQL is unavailable; scrapbook model integration test skipped')
    return true
  }
  return false
}

const createUser = async (overrides = {}) => {
  return User.create({
    fullName: 'Ada Lovelace',
    email: `ada-${crypto.randomUUID()}@example.com`,
    passwordHash: 'hash',
    role: 'user',
    status: 'active',
    authVersion: 1,
    emailVerifiedAt: null,
    ...overrides,
  })
}

const createTrip = async (userId, overrides = {}) => {
  return Trip.create({
    userId,
    title: 'Japan Spring 2027',
    description: 'A trip to Japan',
    tripType: 'personal',
    startDate: '2027-03-28',
    endDate: '2027-04-10',
    status: 'published',
    ...overrides,
  })
}

test('user can create a scrapbook journal without a trip', async (t) => {
  if (skip(t)) return

  const user = await createUser()

  const journal = await ScrapbookJournal.create({
    userId: user.id,
    title: 'My Travel Journal',
    description: 'My personal travel memories',
    isPublic: false,
  })

  assert.equal(journal.title, 'My Travel Journal')
  assert.equal(journal.description, 'My personal travel memories')
  assert.equal(journal.isPublic, false)
  assert.equal(journal.userId, user.id)
  assert.equal(journal.tripId, null)
})

test('user can create a scrapbook journal with a trip', async (t) => {
  if (skip(t)) return

  const user = await createUser()
  const trip = await createTrip(user.id)

  const journal = await ScrapbookJournal.create({
    userId: user.id,
    tripId: trip.id,
    title: 'Japan Journal',
    description: 'Memories from Japan',
    isPublic: false,
  })

  assert.equal(journal.title, 'Japan Journal')
  assert.equal(journal.tripId, trip.id)
})

test('journal is preserved when linked trip is deleted', async (t) => {
  if (skip(t)) return

  const user = await createUser()
  const trip = await createTrip(user.id)
  const journal = await ScrapbookJournal.create({
    userId: user.id,
    tripId: trip.id,
    title: 'Japan Journal',
    description: 'Memories from Japan',
    isPublic: false,
  })

  await Trip.destroy({ where: { id: trip.id } })

  // Journal should still exist.
  const remainingJournal = await ScrapbookJournal.findByPk(journal.id)
  assert.ok(remainingJournal, 'journal should still exist after trip deletion')
  assert.equal(
    remainingJournal.tripId,
    null,
    'tripId should be null after trip deletion',
  )
})

test('images are cascaded when journal is deleted', async (t) => {
  if (skip(t)) return

  const user = await createUser()
  const journal = await ScrapbookJournal.create({
    userId: user.id,
    title: 'My Journal',
    description: 'A journal',
    isPublic: false,
  })

  await ScrapbookImage.create({
    journalId: journal.id,
    imageUrl: 'https://res.cloudinary.com/test/img1.jpg',
    publicId: 'scrapbooks/img1',
    altText: 'Image 1',
    displayOrder: 1,
    isCover: true,
  })
  await ScrapbookImage.create({
    journalId: journal.id,
    imageUrl: 'https://res.cloudinary.com/test/img2.jpg',
    publicId: 'scrapbooks/img2',
    altText: 'Image 2',
    displayOrder: 2,
    isCover: false,
  })

  await ScrapbookJournal.destroy({ where: { id: journal.id } })

  const remainingImages = await ScrapbookImage.count({
    where: { journalId: journal.id },
  })
  assert.equal(remainingImages, 0, 'all images should be deleted when journal is deleted')
})

test('only one cover image per journal is allowed', async (t) => {
  if (skip(t)) return

  const user = await createUser()
  const journal = await ScrapbookJournal.create({
    userId: user.id,
    title: 'My Journal',
    description: 'A journal',
    isPublic: false,
  })

  await ScrapbookImage.create({
    journalId: journal.id,
    imageUrl: 'https://res.cloudinary.com/test/img1.jpg',
    publicId: 'scrapbooks/img1',
    altText: 'Image 1',
    displayOrder: 1,
    isCover: true,
  })

  // Creating a second cover should fail.
  await assert.rejects(
    ScrapbookImage.create({
      journalId: journal.id,
      imageUrl: 'https://res.cloudinary.com/test/img2.jpg',
      publicId: 'scrapbooks/img2',
      altText: 'Image 2',
      displayOrder: 2,
      isCover: true,
    }),
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

test('journal belongs to user and can have optional trip association', async (t) => {
  if (skip(t)) return

  const user = await createUser()
  const trip = await createTrip(user.id)
  const journal = await ScrapbookJournal.create({
    userId: user.id,
    tripId: trip.id,
    title: 'Japan Journal',
    description: 'Memories from Japan',
    isPublic: true,
  })

  // Test belongsTo association.
  const journalWithUser = await ScrapbookJournal.findByPk(journal.id, {
    include: [{ model: User, as: 'user' }],
  })
  assert.ok(journalWithUser.user, 'journal should have a user association')
  assert.equal(journalWithUser.user.id, user.id)

  const journalWithTrip = await ScrapbookJournal.findByPk(journal.id, {
    include: [{ model: Trip, as: 'trip' }],
  })
  assert.ok(journalWithTrip.trip, 'journal should have a trip association')
  assert.equal(journalWithTrip.trip.id, trip.id)

  // Test user.hasMany scrapbooks.
  const userWithScrapbooks = await User.findByPk(user.id, {
    include: [{ model: ScrapbookJournal, as: 'scrapbooks' }],
  })
  assert.ok(userWithScrapbooks.scrapbooks, 'user should have scrapbooks association')
  assert.equal(userWithScrapbooks.scrapbooks.length, 1)

  // Test trip.hasMany scrapbooks.
  const tripWithScrapbooks = await Trip.findByPk(trip.id, {
    include: [{ model: ScrapbookJournal, as: 'scrapbooks' }],
  })
  assert.ok(tripWithScrapbooks.scrapbooks, 'trip should have scrapbooks association')
  assert.equal(tripWithScrapbooks.scrapbooks.length, 1)
})
