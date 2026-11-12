'use strict'

process.env.NODE_ENV = 'development'
process.env.SESSION_SECRET =
  'test-only-session-secret-0123456789abcdef'

const { test, before, after, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const { Sequelize, QueryTypes } = require('sequelize')
const { runtimeConfig } = require('../src/config/database')
const DestinationModel = require('../src/models/destination')
const DestinationImageModel = require('../src/models/destinationImage')
const { createDestinationService } = require('../src/services/destinationService')

const config = runtimeConfig()
const connection = {
  ...config.options,
  host: config.host,
  port: config.port,
  logging: false,
}

let base = null
let scoped = null
let Destination = null
let DestinationImage = null
let schema = null
let databaseAvailable = false

before(async () => {
  base = new Sequelize(config.database, config.username, config.password, connection)
  try {
    await base.authenticate()
    schema = 'tafera_destination_image_concurrency_' + process.pid + '_' + Date.now()
    await base.query('CREATE SCHEMA "' + schema + '"')

    await base.query(
      'CREATE TYPE "' + schema + '".enum_destinations_status AS ENUM (\'draft\', \'published\')'
    )

    await base.query(
      'CREATE TABLE "' + schema + '".destinations (' +
      'id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ' +
      'name varchar(255) NOT NULL, ' +
      'slug varchar(255) NOT NULL, ' +
      'country varchar(255) NOT NULL, ' +
      'state varchar(255), ' +
      'description text NOT NULL, ' +
      'location varchar(255), ' +
      'latitude decimal(10,7), ' +
      'longitude decimal(10,7), ' +
      'featured boolean NOT NULL DEFAULT false, ' +
      'created_by uuid, ' +
      'status "' + schema + '".enum_destinations_status NOT NULL DEFAULT \'published\', ' +
      'created_at timestamptz NOT NULL DEFAULT now(), ' +
      'updated_at timestamptz NOT NULL DEFAULT now()' +
      ')'
    )

    await base.query(
      'CREATE TABLE "' + schema + '".destination_images (' +
      'id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ' +
      'destination_id uuid NOT NULL REFERENCES "' + schema + '".destinations(id) ON DELETE CASCADE ON UPDATE CASCADE, ' +
      'image_url varchar(255) NOT NULL, ' +
      'public_id varchar(255) NOT NULL, ' +
      'alt_text varchar(255), ' +
      'display_order integer NOT NULL DEFAULT 0, ' +
      'is_cover boolean NOT NULL DEFAULT false, ' +
      'created_at timestamptz NOT NULL DEFAULT now(), ' +
      'updated_at timestamptz NOT NULL DEFAULT now()' +
      ')'
    )

    await base.query(
      'CREATE INDEX "destination_images_destination_id_idx" ' +
      'ON "' + schema + '".destination_images ("destination_id")'
    )

    scoped = new Sequelize(config.database, config.username, config.password, {
      ...connection,
      dialectOptions: { ...(config.options.dialectOptions || {}), prependSearchPath: true },
    })
    await scoped.authenticate()
    scoped.getQueryInterface().queryGenerator.options.schema = schema

    Destination = DestinationModel(scoped, Sequelize.DataTypes)
    DestinationImage = DestinationImageModel(scoped, Sequelize.DataTypes)

    Destination.hasMany(DestinationImage, {
      foreignKey: 'destinationId',
      as: 'images',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })
    DestinationImage.belongsTo(Destination, {
      foreignKey: 'destinationId',
      as: 'destination',
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
    await base.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE').catch(() => {})
  }
  if (scoped) await scoped.close().catch(() => {})
  if (base) await base.close().catch(() => {})
})

beforeEach(async () => {
  if (databaseAvailable) {
    await base.query(
      'TRUNCATE TABLE "' + schema + '".destination_images, "' + schema + '".destinations CASCADE'
    )
  }
})

const skip = (t) => {
  if (!databaseAvailable) {
    t.skip('PostgreSQL is unavailable; concurrency test skipped')
    return true
  }
  return false
}

const createTestDestinationRaw = async () => {
  const [row] = await scoped.query(
    `INSERT INTO destinations (name, slug, country, description, status, created_by)
     VALUES (:name, :slug, 'Test Country', 'A test destination', 'published', NULL)
     RETURNING id`,
    {
      replacements: {
        name: 'Test Destination',
        slug: 'test-dest-' + Date.now() + '-' + Math.random(),
      },
      type: QueryTypes.SELECT,
      logging: false,
    },
  )
  return row.id
}

const createTestImageRaw = async (destinationId, displayOrder, isCover) => {
  await scoped.query(
    `INSERT INTO destination_images
       (destination_id, image_url, public_id, display_order, is_cover)
     VALUES (:destinationId, :imageUrl, :publicId, :displayOrder, :isCover)`,
    {
      replacements: {
        destinationId,
        imageUrl: 'https://res.cloudinary.com/test/image/upload/v1/photo.jpg',
        publicId: 'tafera/destinations/photo',
        displayOrder,
        isCover,
      },
      logging: false,
    },
  )
}

const countImagesRaw = async (destinationId) => {
  const [row] = await scoped.query(
    `SELECT count(*) AS cnt FROM destination_images WHERE destination_id = :destinationId`,
    {
      replacements: { destinationId },
      type: QueryTypes.SELECT,
      logging: false,
    },
  )
  return Number(row.cnt)
}

const countCoversRaw = async (destinationId) => {
  const [row] = await scoped.query(
    `SELECT count(*) AS cnt FROM destination_images WHERE destination_id = :destinationId AND is_cover = true`,
    {
      replacements: { destinationId },
      type: QueryTypes.SELECT,
      logging: false,
    },
  )
  return Number(row.cnt)
}

const testService = createDestinationService({
  Destination,
  DestinationImage,
  cloudinaryService: {
    uploader: {
      upload: async function () {
        return {
          secure_url: 'https://res.cloudinary.com/test/image/upload/v1/photo.jpg',
          public_id: 'tafera/destinations/photo',
        }
      },
      destroy: async function () {
        return { result: 'ok' }
      },
    },
  },
})

test('concurrent uploads when 9 images exist: only one new image can be created', async (t) => {
  if (skip(t)) return

  const destinationId = await createTestDestinationRaw()

  // Create 9 existing images
  for (let i = 1; i <= 9; i++) {
    await createTestImageRaw(destinationId, i, i === 1)
  }

  const results = await Promise.allSettled([
    testService.uploadDestinationImage(destinationId, {
      buffer: Buffer.from('fake-image-data-10'),
    }),
    testService.uploadDestinationImage(destinationId, {
      buffer: Buffer.from('fake-image-data-11'),
    }),
  ])

  const fulfilled = results.filter((r) => r.status === 'fulfilled')
  const rejected = results.filter((r) => r.status === 'rejected')

  assert.equal(fulfilled.length, 1, 'exactly one upload should succeed')
  assert.equal(rejected.length, 1, 'exactly one upload should be rejected')

  const rejectedError = rejected[0].reason
  assert.equal(
    rejectedError.code,
    'DESTINATION_IMAGE_LIMIT_EXCEEDED',
    'Expected DESTINATION_IMAGE_LIMIT_EXCEEDED, got ' + (rejectedError && rejectedError.code)
  )

  const finalCount = await countImagesRaw(destinationId)
  assert.equal(finalCount, 10, 'exactly 10 images should exist after concurrent uploads')
})

test('concurrent cover changes: only one cover remains', async (t) => {
  if (skip(t)) return

  const destinationId = await createTestDestinationRaw()

  // Create 3 images, first is cover
  await createTestImageRaw(destinationId, 1, true)
  await createTestImageRaw(destinationId, 2, false)
  await createTestImageRaw(destinationId, 3, false)

  const imageRows = await scoped.query(
    `SELECT id FROM destination_images WHERE destination_id = :destinationId ORDER BY display_order`,
    {
      replacements: { destinationId },
      type: QueryTypes.SELECT,
      logging: false,
    },
  )

  const results = await Promise.allSettled([
    testService.updateDestinationImage(imageRows[1].id, { isCover: true }),
    testService.updateDestinationImage(imageRows[2].id, { isCover: true }),
  ])

  const fulfilled = results.filter((r) => r.status === 'fulfilled')
  const rejected = results.filter((r) => r.status === 'rejected')

  // At least one update should succeed; both may succeed if they serialize
  // properly (each unsets the previous cover before setting the new one).
  assert.ok(fulfilled.length >= 1, 'at least one cover update should succeed')

  const covers = await countCoversRaw(destinationId)
  assert.equal(covers, 1, 'exactly one cover should exist')
})

test('first image automatically becomes the cover', async (t) => {
  if (skip(t)) return

  const destinationId = await createTestDestinationRaw()

  // Upload the first image - it should become cover automatically
  // even when isCover is not specified.
  await testService.uploadDestinationImage(destinationId, {
    buffer: Buffer.from('fake-image-data-first'),
  })

  const count = await countImagesRaw(destinationId)
  assert.equal(count, 1, 'exactly one image should exist')

  const covers = await countCoversRaw(destinationId)
  assert.equal(covers, 1, 'first image should become cover')
})

test('images are scoped to their destination', async (t) => {
  if (skip(t)) return

  const dest1Id = await createTestDestinationRaw()
  const dest2Id = await createTestDestinationRaw()

  await createTestImageRaw(dest1Id, 1, true)
  await createTestImageRaw(dest2Id, 1, false)

  const count1 = await countImagesRaw(dest1Id)
  const count2 = await countImagesRaw(dest2Id)

  assert.equal(count1, 1, 'destination1 should have exactly one image')
  assert.equal(count2, 1, 'destination2 should have exactly one image')
})