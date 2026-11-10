'use strict'

process.env.NODE_ENV = 'development'
process.env.SESSION_SECRET =
  'test-only-session-secret-0123456789abcdef'
process.env.DB_NAME = process.env.DB_NAME || 'tafera'
process.env.DB_USER = process.env.DB_USER || 'tafera_user'
process.env.ARGON2_MAX_QUEUE = '50'

const { test, before, after, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const crypto = require('node:crypto')
const express = require('express')
const cookieParser = require('cookie-parser')
const { Sequelize, DataTypes } = require('sequelize')
const { createClient } = require('redis')

const { runtimeConfig } = require('../src/config/database')
const UserModel = require('../src/models/user')
const DestinationModel = require('../src/models/destination')
const DestinationImageModel = require('../src/models/destinationImage')
const passwordService = require('../src/services/passwordService')
const sessionService = require('../src/services/sessionService')
const {
  createSessionIndex,
} = require('../src/services/sessionIndex')
const {
  createSessionMiddleware,
} = require('../src/config/session')
const {
  createSessionPolicy,
} = require('../src/middlewares/sessionPolicy')
const { createAuthService } = require('../src/services/authService')
const {
  createAuthController,
} = require('../src/controllers/authController')
const {
  createCsrfProtection,
} = require('../src/middlewares/csrfProtection')
const {
  createDestinationsRouter,
} = require('../src/routes/destinations')
const {
  createDestinationService,
} = require('../src/services/destinationService')
const errorHandler = require('../src/middlewares/errorHandler')
const destinationSeeder = require('../src/seeders/20261110000002-seed-destinations')

const TEST_SECRET = 'test-only-session-secret-0123456789abcdef'
const SESSION_COOKIE = 'tafera.sid'
const PASSWORD = 'a sufficiently long passphrase'

let base = null
let scoped = null
let User = null
let Destination = null
let DestinationImage = null
let schema = null
let databaseAvailable = false
let redisClient = null
let redisAvailable = false

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

    schema = `tafera_destinations_${process.pid}_${Date.now()}`
    await base.query(`CREATE SCHEMA "${schema}"`)
    await base.query(
      `CREATE TYPE "${schema}".enum_users_role AS ENUM ('user', 'admin')`,
    )
    await base.query(
      `CREATE TYPE "${schema}".enum_users_status AS ENUM ('active', 'suspended')`,
    )
    await base.query(
      `CREATE TYPE "${schema}".enum_destinations_status AS ENUM ('draft', 'published')`,
    )
    await base.query(
      `CREATE TABLE "${schema}".users (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         full_name varchar(255) NOT NULL,
         email varchar(255) NOT NULL,
         password_hash varchar(255) NOT NULL,
         profile_image varchar(255),
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
      `CREATE TABLE "${schema}".destinations (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         name varchar(255) NOT NULL,
         slug varchar(255) NOT NULL,
         country varchar(255) NOT NULL,
         state varchar(255),
         description text NOT NULL,
         location varchar(255),
         latitude decimal(10,7),
         longitude decimal(10,7),
         featured boolean NOT NULL DEFAULT false,
         status "${schema}".enum_destinations_status NOT NULL DEFAULT 'draft',
         created_by uuid REFERENCES "${schema}".users(id)
           ON DELETE SET NULL ON UPDATE CASCADE,
         created_at timestamptz NOT NULL DEFAULT now(),
         updated_at timestamptz NOT NULL DEFAULT now()
       )`,
    )
    await base.query(
      `CREATE UNIQUE INDEX destinations_slug_unique
       ON "${schema}".destinations (slug)`,
    )
    await base.query(
      `CREATE TABLE "${schema}".destination_images (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         destination_id uuid NOT NULL REFERENCES "${schema}".destinations(id)
           ON DELETE CASCADE ON UPDATE CASCADE,
         image_url varchar(255) NOT NULL,
         public_id varchar(255) NOT NULL,
         alt_text varchar(255),
         display_order integer NOT NULL DEFAULT 0,
         is_cover boolean NOT NULL DEFAULT false,
         created_at timestamptz NOT NULL DEFAULT now(),
         updated_at timestamptz NOT NULL DEFAULT now()
       )`,
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
    Destination = DestinationModel(scoped, DataTypes)
    DestinationImage = DestinationImageModel(scoped, DataTypes)

    // Only the association needed by the public destination service. The
    // full model registry is not required in this isolated test schema.
    Destination.hasMany(DestinationImage, {
      foreignKey: 'destinationId',
      as: 'images',
    })

    databaseAvailable = true
  } catch {
    databaseAvailable = false
  }

  redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  })
  redisClient.on('error', () => {})

  try {
    await redisClient.connect()
    await redisClient.ping()
    redisAvailable = true
  } catch {
    redisAvailable = false
    try {
      redisClient.destroy()
    } catch {
      // ignore
    }
    redisClient = null
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
  if (redisClient && redisClient.isOpen) {
    await redisClient.quit().catch(() => {})
  }
})

beforeEach(async () => {
  if (databaseAvailable) {
    await base.query(
      `TRUNCATE TABLE "${schema}".destination_images,
         "${schema}".destinations,
         "${schema}".users CASCADE`,
    )
  }
})

const skip = (t) => {
  if (!databaseAvailable) {
    t.skip('PostgreSQL is unavailable; destination integration test skipped')
    return true
  }
  if (!redisAvailable) {
    t.skip('Redis is unavailable; destination integration test skipped')
    return true
  }
  return false
}

const request = ({ port, method = 'GET', path = '/', headers = {}, body }) =>
  new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body)
    const requestHeaders = { ...headers }

    if (payload !== undefined) {
      requestHeaders['Content-Type'] = 'application/json'
      requestHeaders['Content-Length'] = Buffer.byteLength(payload)
    }

    const req = http.request(
      { host: '127.0.0.1', port, method, path, headers: requestHeaders },
      (res) => {
        let raw = ''
        res.on('data', (chunk) => {
          raw += chunk
        })
        res.on('end', () => {
          let parsed = null

          if (raw.length > 0) {
            try {
              parsed = JSON.parse(raw)
            } catch {
              parsed = raw
            }
          }

          resolve({
            status: res.statusCode,
            headers: res.headers,
            setCookies: res.headers['set-cookie'] || [],
            body: parsed,
          })
        })
      },
    )

    req.on('error', reject)
    if (payload !== undefined) req.write(payload)
    req.end()
  })

const createHttpClient = (port) => {
  let cookie = null
  let csrfToken = null

  const send = async (method, path, { body } = {}) => {
    const headers = {}

    if (cookie) {
      headers.Cookie = cookie
    }

    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken
    }

    const response = await request({
      port,
      method,
      path,
      headers,
      body,
    })

    const setCookie = (response.setCookies || []).find((header) =>
      header.startsWith(`${SESSION_COOKIE}=`),
    )

    if (setCookie) {
      cookie = setCookie.split(';')[0]
    }

    if (response.body && response.body.data) {
      if (typeof response.body.data.csrfToken === 'string') {
        csrfToken = response.body.data.csrfToken
      }
    }

    return response
  }

  return {
    get: (path) => send('GET', path),
    post: (path, body) => send('POST', path, { body }),
    get cookie() {
      return cookie
    },
  }
}

const startServer = async (app) => {
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })

  return server
}

const cleanupNamespace = async (namespace) => {
  const keys = await redisClient.keys(`${namespace}:*`)
  if (keys.length > 0) {
    await redisClient.del(keys)
  }
}

const createHarness = async () => {
  const namespace = `tafera-destination-test-${crypto.randomUUID()}`
  const index = createSessionIndex({ client: redisClient, namespace })
  const nodeEnv = 'development'
  const sessions = {
    createAuthenticatedSession: (req, user, options = {}) =>
      sessionService.createAuthenticatedSession(req, user, {
        ...options,
        index,
        nodeEnv,
      }),
    createAnonymousSession: (req, options = {}) =>
      sessionService.createAnonymousSession(req, {
        ...options,
        index,
        nodeEnv,
      }),
    destroySession: (req, options = {}) =>
      sessionService.destroySession(req, {
        ...options,
        index,
        nodeEnv,
      }),
  }

  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use(
    createSessionMiddleware({
      nodeEnv,
      namespace,
      client: redisClient,
      secret: TEST_SECRET,
    }),
  )
  app.use(createSessionPolicy({ nodeEnv, index }))

  const authService = createAuthService({
    User,
    sessions,
    nodeEnv,
    verifications: {},
  })
  const authController = createAuthController({
    authService,
    sessions,
    nodeEnv,
    verifications: {},
  })
  const authRouter = express.Router()
  authRouter.get('/csrf', authController.csrf)
  authRouter.post(
    '/login',
    createCsrfProtection(),
    authController.login,
  )
  app.use('/api/auth', authRouter)
  app.use(
    '/api/destinations',
    createDestinationsRouter({
      destinationService: createDestinationService({
        Destination,
        DestinationImage,
      }),
    }),
  )
  app.use(errorHandler)

  const server = await startServer(app)

  return {
    namespace,
    port: server.address().port,
    client: () => createHttpClient(server.address().port),
    close: async () => {
      await new Promise((resolve) => server.close(resolve))
      await cleanupNamespace(namespace)
    },
  }
}

const createUser = async (overrides = {}) => {
  const passwordHash = await passwordService.hashPassword(PASSWORD)

  return User.create({
    fullName: 'Ada Lovelace',
    email: `ada-${crypto.randomUUID()}@example.com`,
    passwordHash,
    role: 'user',
    status: 'active',
    authVersion: 1,
    emailVerifiedAt: null,
    ...overrides,
    passwordHash,
  })
}

const loginUser = async (client, email) => {
  await client.get('/api/auth/csrf')
  return client.post('/api/auth/login', { email, password: PASSWORD })
}

const createDestination = async (overrides = {}) => {
  const id = overrides.id || crypto.randomUUID()
  const name = overrides.name || 'Kyoto'
  const country = overrides.country || 'Japan'

  return Destination.create({
    id,
    name,
    slug: `kyoto-${id.slice(0, 8)}`,
    country,
    state: 'Kyoto',
    description: 'Former imperial capital of Japan.',
    location: `${name}, ${country}`,
    latitude: 35.0116,
    longitude: 135.7681,
    featured: false,
    status: 'published',
    ...overrides,
    id,
  })
}

const createImage = async (destinationId, overrides = {}) =>
  DestinationImage.create({
    id: overrides.id || crypto.randomUUID(),
    destinationId,
    imageUrl: 'https://images.example.com/destination.jpg',
    publicId: `tafera/test/${crypto.randomUUID()}`,
    altText: 'Destination photograph',
    displayOrder: 0,
    isCover: false,
    ...overrides,
    destinationId,
  })

const publicDestinationKeys = [
  'country',
  'coverImage',
  'createdAt',
  'description',
  'featured',
  'id',
  'latitude',
  'location',
  'longitude',
  'name',
  'slug',
  'state',
]

test('anonymous callers receive only published destinations and public fields', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const published = await createDestination({
      slug: 'kyoto-japan',
      name: 'Kyoto',
      featured: true,
      createdBy: null,
    })
    const cover = await createImage(published.id, {
      displayOrder: 5,
      isCover: true,
      altText: 'Kyoto cover',
    })
    await createImage(published.id, {
      displayOrder: 0,
      isCover: false,
      publicId: 'tafera/test/hidden-public-id',
    })
    await createDestination({
      slug: 'draft-kyoto',
      name: 'Draft Kyoto',
      status: 'draft',
    })

    const response = await harness.client().get('/api/destinations')

    assert.equal(response.status, 200)
    assert.equal(response.headers['cache-control'], 'no-store')
    assert.equal(response.body.data.destinations.length, 1)

    const destination = response.body.data.destinations[0]
    assert.deepEqual(
      Object.keys(destination).sort(),
      [...publicDestinationKeys].sort(),
    )
    assert.equal(destination.id, published.id)
    assert.equal(destination.name, 'Kyoto')
    assert.equal(destination.latitude, 35.0116)
    assert.equal(destination.longitude, 135.7681)
    assert.equal(destination.coverImage.id, cover.id)

    const serialized = JSON.stringify(response.body)
    for (const sensitive of [
      'createdBy',
      'created_by',
      '"status"',
      'updatedAt',
      'publicId',
      'public_id',
      'hidden-public-id',
      'tafera/test/',
    ]) {
      assert.equal(serialized.includes(sensitive), false)
    }

    assert.deepEqual(response.body.data.pagination, {
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    })

    const statusBypass = await harness
      .client()
      .get('/api/destinations?status=draft')
    assert.equal(statusBypass.status, 200)
    assert.deepEqual(
      statusBypass.body.data.destinations.map((item) => item.slug),
      ['kyoto-japan'],
    )
  } finally {
    await harness.close()
  }
})

test('search and country, state and featured filters are case-insensitive', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    await createDestination({
      slug: 'kyoto-japan',
      name: 'Kyoto',
      country: 'Japan',
      state: 'Kyoto',
      description: 'Former imperial capital with temples.',
      featured: true,
    })
    await createDestination({
      slug: 'lisbon-portugal',
      name: 'Lisbon',
      country: 'Portugal',
      state: 'Lisbon',
      description: 'Hills above the Tagus River.',
      featured: false,
    })
    await createDestination({
      slug: 'draft-marrakech',
      name: 'Marrakech',
      country: 'Morocco',
      state: 'Marrakesh-Safi',
      description: 'Draft destination.',
      featured: true,
      status: 'draft',
    })

    const client = harness.client()
    const slugs = async (query) => {
      const response = await client.get(`/api/destinations?${query}`)
      assert.equal(response.status, 200, query)
      return response.body.data.destinations.map((item) => item.slug)
    }

    assert.deepEqual(await slugs('q=kyoto'), ['kyoto-japan'])
    assert.deepEqual(await slugs('q=KYOTO'), ['kyoto-japan'])
    assert.deepEqual(await slugs('q=PORTUGAL'), ['lisbon-portugal'])
    assert.deepEqual(await slugs('q=imperial'), ['kyoto-japan'])
    assert.deepEqual(await slugs('country=japan'), ['kyoto-japan'])
    assert.deepEqual(await slugs('state=KYOTO'), ['kyoto-japan'])
    assert.deepEqual(await slugs('featured=true'), ['kyoto-japan'])
    assert.deepEqual(await slugs('featured=false'), ['lisbon-portugal'])
    assert.deepEqual(await slugs('q=kyoto&country=Portugal'), [])
  } finally {
    await harness.close()
  }
})

test('sorting and page-based pagination are deterministic', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    await createDestination({
      slug: 'alpha-brazil',
      name: 'Alpha',
      country: 'Brazil',
      featured: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    })
    await createDestination({
      slug: 'beta-argentina',
      name: 'Beta',
      country: 'Argentina',
      featured: true,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    })
    await createDestination({
      slug: 'gamma-chile',
      name: 'Gamma',
      country: 'Chile',
      featured: false,
      createdAt: new Date('2026-01-03T00:00:00.000Z'),
    })
    const twinA = await createDestination({
      slug: 'twin-a',
      name: 'Twin',
      country: 'Zambia',
      createdAt: new Date('2026-01-04T00:00:00.000Z'),
    })
    const twinB = await createDestination({
      slug: 'twin-b',
      name: 'Twin',
      country: 'Yemen',
      createdAt: new Date('2026-01-05T00:00:00.000Z'),
    })

    const client = harness.client()
    const names = async (query) => {
      const response = await client.get(`/api/destinations?${query}`)
      assert.equal(response.status, 200, query)
      return response.body.data.destinations.map((item) => item.name)
    }

    assert.deepEqual(await names('sort=name&order=asc'), [
      'Alpha',
      'Beta',
      'Gamma',
      'Twin',
      'Twin',
    ])
    assert.deepEqual(await names('sort=country&order=desc'), [
      'Twin',
      'Twin',
      'Gamma',
      'Alpha',
      'Beta',
    ])
    assert.deepEqual(await names('sort=featured'), [
      'Beta',
      'Alpha',
      'Gamma',
      'Twin',
      'Twin',
    ])
    assert.deepEqual(await names('sort=createdAt&order=asc'), [
      'Alpha',
      'Beta',
      'Gamma',
      'Twin',
      'Twin',
    ])

    const secondPage = await client.get(
      '/api/destinations?sort=name&order=asc&page=2&limit=2',
    )
    assert.equal(secondPage.status, 200)
    assert.deepEqual(
      secondPage.body.data.destinations.map((item) => item.name),
      ['Gamma', 'Twin'],
    )
    assert.deepEqual(secondPage.body.data.pagination, {
      page: 2,
      limit: 2,
      total: 5,
      totalPages: 3,
      hasNextPage: true,
      hasPreviousPage: true,
    })

    const twins = await client.get(
      '/api/destinations?q=twin&sort=name&order=asc',
    )
    const twinIds = twins.body.data.destinations.map((item) => item.id)
    assert.deepEqual(twinIds, [twinA.id, twinB.id].sort())
  } finally {
    await harness.close()
  }
})

test('detail lookup supports UUID and slug and hides draft destinations', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const published = await createDestination({
      slug: 'kyoto-japan',
      name: 'Kyoto',
      featured: true,
    })
    await createImage(published.id, {
      displayOrder: 2,
      isCover: false,
      altText: 'Second image',
    })
    const cover = await createImage(published.id, {
      displayOrder: 5,
      isCover: true,
      altText: 'Cover image',
    })
    await createDestination({
      slug: 'draft-destination',
      name: 'Draft Destination',
      status: 'draft',
    })

    const client = harness.client()

    const byId = await client.get(`/api/destinations/${published.id}`)
    assert.equal(byId.status, 200)
    assert.equal(byId.body.data.destination.id, published.id)
    assert.equal(byId.body.data.destination.coverImage.id, cover.id)
    assert.deepEqual(
      byId.body.data.destination.images.map(
        (image) => image.displayOrder,
      ),
      [2, 5],
    )
    assert.deepEqual(
      Object.keys(byId.body.data.destination).sort(),
      [...publicDestinationKeys, 'images'].sort(),
    )

    for (const image of byId.body.data.destination.images) {
      assert.deepEqual(
        Object.keys(image).sort(),
        [
          'altText',
          'displayOrder',
          'id',
          'imageUrl',
          'isCover',
        ].sort(),
      )
    }

    const bySlug = await client.get('/api/destinations/kyoto-japan')
    assert.equal(bySlug.status, 200)
    assert.equal(bySlug.body.data.destination.id, published.id)

    const draft = await client.get('/api/destinations/draft-destination')
    assert.equal(draft.status, 404)
    assert.equal(draft.body.error.code, 'DESTINATION_NOT_FOUND')

    const missing = await client.get(
      '/api/destinations/00000000-0000-4000-8000-000000000099',
    )
    assert.equal(missing.status, 404)
    assert.equal(missing.body.error.code, 'DESTINATION_NOT_FOUND')
  } finally {
    await harness.close()
  }
})

test('cover images prefer isCover, then the lowest display order, then null', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const flagged = await createDestination({ slug: 'flagged-cover' })
    await createImage(flagged.id, {
      displayOrder: 0,
      isCover: false,
    })
    const flaggedCover = await createImage(flagged.id, {
      displayOrder: 9,
      isCover: true,
    })

    const ordered = await createDestination({ slug: 'ordered-cover' })
    await createImage(ordered.id, {
      displayOrder: 4,
      isCover: false,
    })
    const orderedCover = await createImage(ordered.id, {
      displayOrder: 1,
      isCover: false,
    })

    await createDestination({ slug: 'no-images' })

    const response = await harness.client().get('/api/destinations')
    assert.equal(response.status, 200)

    const bySlug = new Map(
      response.body.data.destinations.map((item) => [item.slug, item]),
    )
    assert.equal(bySlug.get('flagged-cover').coverImage.id, flaggedCover.id)
    assert.equal(
      bySlug.get('ordered-cover').coverImage.id,
      orderedCover.id,
    )
    assert.equal(bySlug.get('no-images').coverImage, null)
  } finally {
    await harness.close()
  }
})

test('invalid query values and malformed identifiers return validation errors', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const client = harness.client()
    const cases = [
      ['/api/destinations?page=0', 'page'],
      ['/api/destinations?limit=51', 'limit'],
      ['/api/destinations?featured=yes', 'featured'],
      ['/api/destinations?sort=popular', 'sort'],
      ['/api/destinations?order=up', 'order'],
      ['/api/destinations?q=' + 'x'.repeat(101), 'q'],
      ['/api/destinations/Not-A-Slug', 'idOrSlug'],
      ['/api/destinations/kyoto--japan', 'idOrSlug'],
    ]

    for (const [path, field] of cases) {
      const response = await client.get(path)

      assert.equal(response.status, 400, path)
      assert.equal(response.body.error.code, 'VALIDATION_ERROR', path)
      assert.equal(
        response.body.error.details.some(
          (detail) => detail.field === field,
        ),
        true,
        `expected a ${field} error for ${path}`,
      )
    }

    const emptySearch = await client.get('/api/destinations?q=')
    assert.equal(emptySearch.status, 200)

    const maxLimit = await client.get('/api/destinations?limit=50')
    assert.equal(maxLimit.status, 200)
  } finally {
    await harness.close()
  }
})

test('destination seeder is idempotent and seeds public published data', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const queryInterface = scoped.getQueryInterface()

    await destinationSeeder.up(queryInterface, Sequelize)
    const firstDestinations = await Destination.count()
    const firstImages = await DestinationImage.count()

    assert.ok(firstDestinations >= 8 && firstDestinations <= 12)
    assert.ok(firstImages >= firstDestinations)
    assert.ok(firstImages <= firstDestinations * 3)

    await destinationSeeder.up(queryInterface, Sequelize)
    assert.equal(await Destination.count(), firstDestinations)
    assert.equal(await DestinationImage.count(), firstImages)

    const destinations = await Destination.findAll()
    assert.equal(
      destinations.every(
        (destination) => destination.status === 'published',
      ),
      true,
    )
    assert.equal(
      new Set(destinations.map((destination) => destination.slug)).size,
      firstDestinations,
    )
    assert.equal(
      destinations.some((destination) => destination.featured),
      true,
    )
    assert.equal(
      destinations.some((destination) => !destination.featured),
      true,
    )

    const imageCounts = await DestinationImage.findAll({
      attributes: [
        'destinationId',
        [
          Sequelize.fn('COUNT', Sequelize.col('id')),
          'imageCount',
        ],
      ],
      group: ['destinationId'],
    })
    assert.equal(imageCounts.length, firstDestinations)

    const response = await harness
      .client()
      .get('/api/destinations?limit=50')
    assert.equal(response.status, 200)
    assert.equal(
      response.body.data.destinations.length,
      firstDestinations,
    )
    assert.deepEqual(
      Object.keys(response.body.data.destinations[0]).sort(),
      [...publicDestinationKeys].sort(),
    )

    await destinationSeeder.down(queryInterface, Sequelize)
    assert.equal(await Destination.count(), 0)
    assert.equal(await DestinationImage.count(), 0)

    await destinationSeeder.up(queryInterface, Sequelize)
    assert.equal(await Destination.count(), firstDestinations)
    assert.equal(await DestinationImage.count(), firstImages)
  } finally {
    await harness.close()
  }
})

test('unverified authenticated users can read destinations', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser({ emailVerifiedAt: null })
    const destination = await createDestination({
      slug: 'unverified-readable',
      name: 'Unverified Readable',
    })
    const client = harness.client()

    const login = await loginUser(client, user.email)
    assert.equal(login.status, 200)
    assert.equal(login.body.data.user.emailVerified, false)

    const list = await client.get('/api/destinations')
    assert.equal(list.status, 200)
    assert.equal(list.body.data.destinations.length, 1)

    const detail = await client.get(
      `/api/destinations/${destination.slug}`,
    )
    assert.equal(detail.status, 200)
    assert.equal(
      detail.body.data.destination.id,
      destination.id,
    )
  } finally {
    await harness.close()
  }
})
