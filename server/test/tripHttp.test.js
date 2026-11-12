'use strict'

process.env.NODE_ENV = 'development'
process.env.SESSION_SECRET =
  'test-only-session-secret-0123456789abcdef'
process.env.DB_NAME = process.env.DB_NAME || 'tafera'
process.env.DB_USER = process.env.DB_USER || 'tafera_user'
process.env.ARGON2_MAX_QUEUE = '50'

const {
  test,
  before,
  after,
  beforeEach,
} = require('node:test')
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
const TripModel = require('../src/models/trip')
const TripDestinationModel = require('../src/models/tripDestination')
const TripItineraryModel = require('../src/models/tripItinerary')
const TripParticipantModel = require('../src/models/tripParticipant')
const NotificationModel = require('../src/models/notification')
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
  createTripsRouter,
} = require('../src/routes/trips')
const {
  createTripService,
} = require('../src/services/tripService')
const {
  createTripParticipationService,
} = require('../src/services/tripParticipationService')
const {
  PUBLIC_TRIP_FIELDS,
  PUBLIC_TRIP_STOP_FIELDS,
} = require('../src/utils/safeTrip')
const {
  PUBLIC_TRIP_PARTICIPANT_FIELDS,
} = require('../src/utils/safeTripParticipant')
const { PUBLIC_PROFILE_FIELDS } = require('../src/utils/safeUser')
const errorHandler = require('../src/middlewares/errorHandler')

const TEST_SECRET = 'test-only-session-secret-0123456789abcdef'
const SESSION_COOKIE = 'tafera.sid'
const PASSWORD = 'a sufficiently long passphrase'

let base = null
let scoped = null
let User = null
let Destination = null
let DestinationImage = null
let Trip = null
let TripDestination = null
let TripItinerary = null
let TripParticipant = null
let Notification = null
let schema = null
let databaseAvailable = false
let redisClient = null
let redisAvailable = false
let passwordHashPromise = null

const getPasswordHash = () => {
  if (!passwordHashPromise) {
    passwordHashPromise = passwordService.hashPassword(PASSWORD)
  }

  return passwordHashPromise
}

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

    schema = `tafera_trips_${process.pid}_${Date.now()}`
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
      `CREATE TYPE "${schema}".enum_trips_trip_type AS ENUM ('personal', 'group')`,
    )
    await base.query(
      `CREATE TYPE "${schema}".enum_trips_status AS ENUM ('draft', 'published', 'cancelled', 'completed')`,
    )
    await base.query(
      `CREATE TYPE "${schema}".enum_trip_participants_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled')`,
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
      `CREATE TYPE "${schema}".enum_notifications_type AS ENUM (
         'new_follower',
         'post_like',
         'post_comment',
         'trip_join_request',
         'trip_join_approved',
         'trip_join_rejected'
       )`,
    )
    await base.query(
      `CREATE TYPE "${schema}".enum_notifications_reference_type AS ENUM (
         'user',
         'post',
         'comment',
         'trip'
       )`,
    )
    await base.query(
      `CREATE TABLE "${schema}".notifications (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         user_id uuid NOT NULL REFERENCES "${schema}".users(id)
           ON DELETE CASCADE ON UPDATE CASCADE,
         actor_id uuid REFERENCES "${schema}".users(id)
           ON DELETE SET NULL ON UPDATE CASCADE,
         type "${schema}".enum_notifications_type NOT NULL,
         message text NOT NULL,
         reference_type "${schema}".enum_notifications_reference_type,
         reference_id uuid,
         is_read boolean NOT NULL DEFAULT false,
         read_at timestamptz,
         created_at timestamptz NOT NULL DEFAULT now(),
         updated_at timestamptz NOT NULL DEFAULT now(),
         CONSTRAINT notifications_reference_pair_check CHECK (
           ("reference_type" IS NULL AND "reference_id" IS NULL)
           OR ("reference_type" IS NOT NULL AND "reference_id" IS NOT NULL)
         )
       )`,
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
         updated_at timestamptz NOT NULL DEFAULT now(),
         CONSTRAINT trips_end_date_check CHECK (end_date >= start_date),
         CONSTRAINT trips_max_participants_check
           CHECK (max_participants IS NULL OR max_participants > 0)
       )`,
    )
    await base.query(
      `CREATE TABLE "${schema}".trip_destinations (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         trip_id uuid NOT NULL REFERENCES "${schema}".trips(id)
           ON DELETE CASCADE ON UPDATE CASCADE,
         destination_id uuid NOT NULL REFERENCES "${schema}".destinations(id)
           ON DELETE RESTRICT ON UPDATE CASCADE,
         stop_order integer NOT NULL DEFAULT 1,
         arrival_date date,
         departure_date date,
         created_at timestamptz NOT NULL DEFAULT now(),
         updated_at timestamptz NOT NULL DEFAULT now(),
         CONSTRAINT trip_destinations_trip_id_destination_id_unique
           UNIQUE (trip_id, destination_id),
         CONSTRAINT trip_destinations_trip_id_stop_order_unique
           UNIQUE (trip_id, stop_order),
         CONSTRAINT trip_destinations_stop_order_check
           CHECK (stop_order > 0),
         CONSTRAINT trip_destinations_dates_check
           CHECK (
             arrival_date IS NULL OR
             departure_date IS NULL OR
             departure_date >= arrival_date
           )
       )`,
    )
    await base.query(
      `CREATE TABLE "${schema}".trip_itineraries (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         trip_id uuid NOT NULL REFERENCES "${schema}".trips(id)
           ON DELETE CASCADE ON UPDATE CASCADE,
         trip_destination_id uuid REFERENCES "${schema}".trip_destinations(id)
           ON DELETE SET NULL ON UPDATE CASCADE,
         title varchar(255) NOT NULL,
         description text,
         activity_date date NOT NULL,
         start_time time,
         end_time time,
         location varchar(255),
         created_at timestamptz NOT NULL DEFAULT now(),
         updated_at timestamptz NOT NULL DEFAULT now(),
         CONSTRAINT trip_itineraries_time_order_check
           CHECK (
             start_time IS NULL OR
             end_time IS NULL OR
             end_time > start_time
           )
       )`,
    )
    await base.query(
      `CREATE TABLE "${schema}".trip_participants (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         trip_id uuid NOT NULL REFERENCES "${schema}".trips(id)
           ON DELETE CASCADE ON UPDATE CASCADE,
         user_id uuid NOT NULL REFERENCES "${schema}".users(id)
           ON DELETE CASCADE ON UPDATE CASCADE,
         status "${schema}".enum_trip_participants_status
           NOT NULL DEFAULT 'pending',
         joined_at timestamptz,
         created_at timestamptz NOT NULL DEFAULT now(),
         updated_at timestamptz NOT NULL DEFAULT now(),
         CONSTRAINT trip_participants_trip_id_user_id_unique
           UNIQUE (trip_id, user_id)
       )`,
    )
    await base.query(
      `CREATE INDEX trip_participants_trip_id_idx
       ON "${schema}".trip_participants (trip_id)`,
    )
    await base.query(
      `CREATE INDEX trip_participants_user_id_idx
       ON "${schema}".trip_participants (user_id)`,
    )
    await base.query(
      `CREATE INDEX trip_participants_status_idx
       ON "${schema}".trip_participants (status)`,
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
    Trip = TripModel(scoped, DataTypes)
    TripDestination = TripDestinationModel(scoped, DataTypes)
    TripItinerary = TripItineraryModel(scoped, DataTypes)
    TripParticipant = TripParticipantModel(scoped, DataTypes)
    Notification = NotificationModel(scoped, DataTypes)

    Destination.hasMany(DestinationImage, {
      foreignKey: 'destinationId',
      as: 'images',
    })
    DestinationImage.belongsTo(Destination, {
      foreignKey: 'destinationId',
      as: 'destination',
    })
    Trip.hasMany(TripDestination, {
      foreignKey: 'tripId',
      as: 'destinations',
    })
    TripDestination.belongsTo(Trip, {
      foreignKey: 'tripId',
      as: 'trip',
    })
    TripDestination.belongsTo(Destination, {
      foreignKey: 'destinationId',
      as: 'destination',
    })
    Destination.hasMany(TripDestination, {
      foreignKey: 'destinationId',
      as: 'tripDestinations',
    })
    Trip.hasMany(TripParticipant, {
      foreignKey: 'tripId',
      as: 'participants',
    })
    TripParticipant.belongsTo(Trip, {
      foreignKey: 'tripId',
      as: 'trip',
    })
    TripParticipant.belongsTo(User, {
      foreignKey: 'userId',
      as: 'participant',
    })
    User.hasMany(TripParticipant, {
      foreignKey: 'userId',
      as: 'tripParticipation',
    })

    databaseAvailable = true
  } catch (error) {
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
      `TRUNCATE TABLE "${schema}".notifications,
         "${schema}".trip_participants,
         "${schema}".trip_itineraries,
         "${schema}".trip_destinations,
         "${schema}".trips,
         "${schema}".destination_images,
         "${schema}".destinations,
         "${schema}".users CASCADE`,
    )
  }
})

const skip = (t) => {
  if (!databaseAvailable) {
    t.skip('PostgreSQL is unavailable; trip integration test skipped')
    return true
  }
  if (!redisAvailable) {
    t.skip('Redis is unavailable; trip integration test skipped')
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
    patch: (path, body) => send('PATCH', path, { body }),
    put: (path, body) => send('PUT', path, { body }),
    delete: (path, body) => send('DELETE', path, { body }),
    get cookie() {
      return cookie
    },
    get csrfToken() {
      return csrfToken
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

const createHarness = async ({ notificationCreationService } = {}) => {
  const namespace = `tafera-trip-test-${crypto.randomUUID()}`
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
    '/api/trips',
    createTripsRouter({
      tripService: createTripService({
        Trip,
        TripDestination,
        TripParticipant,
        Destination,
        DestinationImage,
        sequelize: scoped,
      }),
      tripParticipationService: createTripParticipationService({
        Trip,
        TripParticipant,
        User,
        Notification,
        sequelize: scoped,
        notificationCreationService,
      }),
      sessions,
      nodeEnv,
      User,
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
  const passwordHash = await getPasswordHash()

  return User.create({
    fullName: 'Ada Lovelace',
    email: `ada-${crypto.randomUUID()}@example.com`,
    passwordHash,
    role: 'user',
    status: 'active',
    authVersion: 1,
    emailVerifiedAt: new Date(),
    ...overrides,
    passwordHash,
  })
}

const loginUser = async (client, email) => {
  await client.get('/api/auth/csrf')
  return client.post('/api/auth/login', { email, password: PASSWORD })
}

const createVerifiedClient = async (harness, overrides = {}) => {
  const user = await createUser({
    emailVerifiedAt: new Date(),
    ...overrides,
  })
  const client = harness.client()
  const login = await loginUser(client, user.email)

  assert.equal(login.status, 200)

  return { user, client }
}

const createDestination = async (overrides = {}) => {
  const id = overrides.id || crypto.randomUUID()

  return Destination.create({
    id,
    name: 'Kyoto',
    slug: `kyoto-${id.slice(0, 8)}`,
    country: 'Japan',
    state: 'Kyoto',
    description: 'Former imperial capital of Japan.',
    location: 'Kyoto, Japan',
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

const createTrip = (client, overrides = {}) =>
  client.post('/api/trips', {
    title: 'Japan Spring 2027',
    tripType: 'personal',
    startDate: '2027-03-28',
    endDate: '2027-04-10',
    ...overrides,
  })

const addStop = (client, tripId, destinationId, overrides = {}) =>
  client.post(`/api/trips/${tripId}/stops`, {
    destinationId,
    ...overrides,
  })

const createGroupTrip = async (client, overrides = {}) => {
  const response = await createTrip(client, {
    tripType: 'group',
    status: 'published',
    maxParticipants: 10,
    ...overrides,
  })

  assert.equal(response.status, 201)
  return response.body.data.trip
}

const joinTrip = (client, tripId, body = {}) =>
  client.post(`/api/trips/${tripId}/join`, body)

const leaveTrip = (client, tripId) =>
  client.delete(`/api/trips/${tripId}/join`)

const getParticipation = (client, tripId) =>
  client.get(`/api/trips/${tripId}/participation`)

const getParticipants = (client, tripId, query = '') =>
  client.get(`/api/trips/${tripId}/participants${query}`)

const moderateParticipant = (client, tripId, participantId, status) =>
  client.patch(
    `/api/trips/${tripId}/participants/${participantId}`,
    { status },
  )

const participantKeys = [
  ...PUBLIC_TRIP_PARTICIPANT_FIELDS,
  'user',
].sort()
const participantUserKeys = [...PUBLIC_PROFILE_FIELDS].sort()

const assertPublicParticipant = (participant) => {
  assert.deepEqual(Object.keys(participant).sort(), participantKeys)
  assert.deepEqual(
    Object.keys(participant.user).sort(),
    participantUserKeys,
  )

  const serialized = JSON.stringify(participant)
  for (const sensitive of [
    'userId',
    'tripId',
    'passwordHash',
    'authVersion',
    'emailVerifiedAt',
    'email',
    '"role"',
  ]) {
    assert.equal(
      serialized.includes(sensitive),
      false,
      `expected ${sensitive} not to be serialized`,
    )
  }
}

const tripKeys = [...PUBLIC_TRIP_FIELDS, 'stops'].sort()
const stopKeys = [...PUBLIC_TRIP_STOP_FIELDS, 'destination'].sort()
const destinationKeys = [
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
].sort()

test('verified owner creates a trip with defaults and a public shape', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { user, client } = await createVerifiedClient(harness)
    const response = await createTrip(client, {
      id: '10000000-0000-4000-8000-000000000099',
      userId: '20000000-0000-4000-8000-000000000099',
      description: '',
      maxParticipants: null,
    })

    assert.equal(response.status, 201)
    assert.equal(response.headers['cache-control'], 'no-store')

    const trip = response.body.data.trip
    assert.deepEqual(Object.keys(trip).sort(), tripKeys)
    assert.equal(trip.title, 'Japan Spring 2027')
    assert.equal(trip.description, null)
    assert.equal(trip.tripType, 'personal')
    assert.equal(trip.status, 'draft')
    assert.equal(trip.startDate, '2027-03-28')
    assert.equal(trip.endDate, '2027-04-10')
    assert.equal(trip.maxParticipants, null)
    assert.deepEqual(trip.stops, [])
    assert.notEqual(trip.id, '10000000-0000-4000-8000-000000000099')

    const stored = await Trip.findByPk(trip.id)
    assert.equal(stored.userId, user.id)

    const serialized = JSON.stringify(response.body)
    assert.equal(serialized.includes('userId'), false)
    assert.equal(serialized.includes('creator'), false)
  } finally {
    await harness.close()
  }
})

test('trip writes require authentication, CSRF and a verified email', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const body = {
      title: 'A trip',
      startDate: '2027-03-28',
      endDate: '2027-04-10',
    }

    const anonymous = await request({
      port: harness.port,
      method: 'POST',
      path: '/api/trips',
      body,
    })
    assert.equal(anonymous.status, 401)
    assert.equal(anonymous.body.error.code, 'AUTH_REQUIRED')

    const { client } = await createVerifiedClient(harness)
    const missingCsrf = await request({
      port: harness.port,
      method: 'POST',
      path: '/api/trips',
      headers: { Cookie: client.cookie },
      body,
    })
    assert.equal(missingCsrf.status, 403)
    assert.equal(
      missingCsrf.body.error.code,
      'CSRF_TOKEN_INVALID',
    )

    const unverified = await createUser({ emailVerifiedAt: null })
    const unverifiedClient = harness.client()
    const login = await loginUser(unverifiedClient, unverified.email)
    assert.equal(login.status, 200)

    const unverifiedCreate = await createTrip(unverifiedClient)
    assert.equal(unverifiedCreate.status, 403)
    assert.equal(
      unverifiedCreate.body.error.code,
      'EMAIL_VERIFICATION_REQUIRED',
    )

    const anonymousList = await harness.client().get('/api/trips')
    assert.equal(anonymousList.status, 401)
  } finally {
    await harness.close()
  }
})

test('owner trip list is scoped, ordered and paginated', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { client } = await createVerifiedClient(harness)
    const other = await createVerifiedClient(harness)

    const first = await createTrip(client, {
      title: 'First',
      startDate: '2027-01-01',
      endDate: '2027-01-05',
      status: 'draft',
    })
    const second = await createTrip(client, {
      title: 'Second',
      startDate: '2027-02-01',
      endDate: '2027-02-05',
      status: 'published',
    })
    const third = await createTrip(client, {
      title: 'Third',
      startDate: '2027-03-01',
      endDate: '2027-03-05',
      status: 'published',
    })
    await createTrip(other.client, {
      title: 'Other user trip',
      startDate: '2027-04-01',
      endDate: '2027-04-05',
    })

    const list = await client.get('/api/trips')
    assert.equal(list.status, 200)
    assert.deepEqual(
      list.body.data.trips.map((trip) => trip.title),
      ['Third', 'Second', 'First'],
    )
    assert.equal(list.body.data.pagination.total, 3)
    assert.equal(list.body.data.trips[0].stops, undefined)

    const filtered = await client.get(
      '/api/trips?status=published&limit=1&page=2',
    )
    assert.equal(filtered.status, 200)
    assert.deepEqual(
      filtered.body.data.trips.map((trip) => trip.title),
      ['Second'],
    )
    assert.deepEqual(filtered.body.data.pagination, {
      page: 2,
      limit: 1,
      total: 2,
      totalPages: 2,
      hasNextPage: false,
      hasPreviousPage: true,
    })

    const invalid = await client.get('/api/trips?status=archived')
    assert.equal(invalid.status, 400)
    assert.equal(invalid.body.error.code, 'VALIDATION_ERROR')

    assert.equal(first.status, 201)
    assert.equal(second.status, 201)
    assert.equal(third.status, 201)
  } finally {
    await harness.close()
  }
})

test('trip detail is public for non-drafts and owner-visible for drafts', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { client: ownerClient } = await createVerifiedClient(harness)
    const { client: otherClient } = await createVerifiedClient(harness)
    const destination = await createDestination()
    const cover = await createImage(destination.id, {
      displayOrder: 5,
      isCover: true,
      altText: 'Kyoto cover',
      publicId: 'tafera/test/hidden-public-id',
    })
    await createImage(destination.id, {
      displayOrder: 0,
      isCover: false,
    })

    const draft = await createTrip(ownerClient, {
      title: 'Draft trip',
      status: 'draft',
    })
    const published = await createTrip(ownerClient, {
      title: 'Published trip',
      status: 'published',
    })
    const cancelled = await createTrip(ownerClient, {
      title: 'Cancelled trip',
      status: 'cancelled',
    })

    const stop = await addStop(
      ownerClient,
      published.body.data.trip.id,
      destination.id,
      {
        arrivalDate: '2027-03-29',
        departureDate: '2027-04-01',
      },
    )
    assert.equal(stop.status, 201)

    const draftId = draft.body.data.trip.id
    const publishedId = published.body.data.trip.id
    const cancelledId = cancelled.body.data.trip.id

    const anonymous = harness.client()
    assert.equal(
      (await anonymous.get(`/api/trips/${draftId}`)).status,
      404,
    )
    assert.equal(
      (await anonymous.get(`/api/trips/${publishedId}`)).status,
      200,
    )
    assert.equal(
      (await anonymous.get(`/api/trips/${cancelledId}`)).status,
      200,
    )

    assert.equal(
      (await otherClient.get(`/api/trips/${draftId}`)).status,
      404,
    )
    assert.equal(
      (await otherClient.get(`/api/trips/${publishedId}`)).status,
      200,
    )
    assert.equal(
      (await ownerClient.get(`/api/trips/${draftId}`)).status,
      200,
    )

    const detail = await anonymous.get(`/api/trips/${publishedId}`)
    assert.equal(detail.status, 200)
    const trip = detail.body.data.trip
    assert.deepEqual(Object.keys(trip).sort(), tripKeys)
    assert.equal(trip.stops.length, 1)
    assert.deepEqual(
      Object.keys(trip.stops[0]).sort(),
      stopKeys,
    )
    assert.deepEqual(
      Object.keys(trip.stops[0].destination).sort(),
      destinationKeys,
    )
    assert.equal(
      Object.hasOwn(trip.stops[0].destination, 'status'),
      false,
    )
    assert.equal(trip.stops[0].destination.coverImage.id, cover.id)
    assert.equal(
      JSON.stringify(detail.body).includes('hidden-public-id'),
      false,
    )
    assert.equal(
      JSON.stringify(detail.body).includes('createdBy'),
      false,
    )

    const missing = await anonymous.get(
      '/api/trips/00000000-0000-4000-8000-000000000099',
    )
    assert.equal(missing.status, 404)
    assert.equal(missing.body.error.code, 'TRIP_NOT_FOUND')

    const malformed = await anonymous.get('/api/trips/not-a-uuid')
    assert.equal(malformed.status, 400)
  } finally {
    await harness.close()
  }
})

test('updateTrip enforces ownership and stops cannot fall outside changed dates', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { client: ownerClient } = await createVerifiedClient(harness)
    const { client: otherClient } = await createVerifiedClient(harness)
    const destination = await createDestination()
    const created = await createTrip(ownerClient)
    const tripId = created.body.data.trip.id

    const stop = await addStop(ownerClient, tripId, destination.id, {
      arrivalDate: '2027-03-29',
      departureDate: '2027-04-05',
    })
    assert.equal(stop.status, 201)

    const otherUpdate = await otherClient.patch(`/api/trips/${tripId}`, {
      title: 'Hijacked',
    })
    assert.equal(otherUpdate.status, 404)
    assert.equal(otherUpdate.body.error.code, 'TRIP_NOT_FOUND')

    const rename = await ownerClient.patch(`/api/trips/${tripId}`, {
      title: 'Renamed trip',
      description: 'Updated description.',
      status: 'published',
      maxParticipants: 4,
      tripType: 'group',
    })
    assert.equal(rename.status, 200)
    assert.equal(rename.body.data.trip.title, 'Renamed trip')
    assert.equal(rename.body.data.trip.status, 'published')
    assert.equal(rename.body.data.trip.maxParticipants, 4)

    const shorterEnd = await ownerClient.patch(`/api/trips/${tripId}`, {
      endDate: '2027-04-01',
    })
    assert.equal(shorterEnd.status, 409)
    assert.equal(
      shorterEnd.body.error.code,
      'TRIP_DATES_CONFLICT',
    )

    const laterStart = await ownerClient.patch(`/api/trips/${tripId}`, {
      startDate: '2027-03-30',
    })
    assert.equal(laterStart.status, 409)
    assert.equal(
      laterStart.body.error.code,
      'TRIP_DATES_CONFLICT',
    )

    const validDates = await ownerClient.patch(`/api/trips/${tripId}`, {
      startDate: '2027-03-29',
      endDate: '2027-04-05',
    })
    assert.equal(validDates.status, 200)
    assert.equal(validDates.body.data.trip.startDate, '2027-03-29')
    assert.equal(validDates.body.data.trip.endDate, '2027-04-05')

    const empty = await ownerClient.patch(`/api/trips/${tripId}`, {})
    assert.equal(empty.status, 400)
    assert.equal(
      empty.body.error.details.some(
        (detail) => detail.field === 'request',
      ),
      true,
    )

    const missing = await ownerClient.patch(
      '/api/trips/00000000-0000-4000-8000-000000000099',
      { title: 'Missing' },
    )
    assert.equal(missing.status, 404)
  } finally {
    await harness.close()
  }
})

test('adding stops assigns order and rejects duplicates, drafts and out-of-range dates', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { client: ownerClient } = await createVerifiedClient(harness)
    const { client: otherClient } = await createVerifiedClient(harness)
    const first = await createDestination({ name: 'Kyoto' })
    const second = await createDestination({ name: 'Lisbon' })
    const draftDestination = await createDestination({
      name: 'Draft place',
      status: 'draft',
    })
    const created = await createTrip(ownerClient)
    const tripId = created.body.data.trip.id

    const firstStop = await addStop(ownerClient, tripId, first.id, {
      arrivalDate: '2027-03-29',
      departureDate: '2027-04-01',
    })
    assert.equal(firstStop.status, 201)
    assert.equal(firstStop.body.data.trip.stops[0].stopOrder, 1)

    const secondStop = await addStop(
      ownerClient,
      tripId,
      second.id,
    )
    assert.equal(secondStop.status, 201)
    assert.deepEqual(
      secondStop.body.data.trip.stops.map((stop) => stop.stopOrder),
      [1, 2],
    )

    const duplicate = await addStop(ownerClient, tripId, first.id)
    assert.equal(duplicate.status, 409)
    assert.equal(duplicate.body.error.code, 'TRIP_STOP_EXISTS')

    const draft = await addStop(
      ownerClient,
      tripId,
      draftDestination.id,
    )
    assert.equal(draft.status, 404)
    assert.equal(draft.body.error.code, 'DESTINATION_NOT_FOUND')

    const missingDestination = await addStop(
      ownerClient,
      tripId,
      '00000000-0000-4000-8000-000000000099',
    )
    assert.equal(missingDestination.status, 404)
    assert.equal(
      missingDestination.body.error.code,
      'DESTINATION_NOT_FOUND',
    )

    const otherDestination = await createDestination({ name: 'Banff' })
    const tooEarly = await addStop(
      ownerClient,
      tripId,
      otherDestination.id,
      { arrivalDate: '2027-03-27' },
    )
    assert.equal(tooEarly.status, 400)
    assert.equal(
      tooEarly.body.error.details.some(
        (detail) => detail.field === 'arrivalDate',
      ),
      true,
    )

    const tooLate = await addStop(
      ownerClient,
      tripId,
      otherDestination.id,
      { departureDate: '2027-04-11' },
    )
    assert.equal(tooLate.status, 400)

    const reversed = await addStop(
      ownerClient,
      tripId,
      otherDestination.id,
      {
        arrivalDate: '2027-04-02',
        departureDate: '2027-04-01',
      },
    )
    assert.equal(reversed.status, 400)

    const otherAdd = await addStop(
      otherClient,
      tripId,
      otherDestination.id,
    )
    assert.equal(otherAdd.status, 404)
    assert.equal(otherAdd.body.error.code, 'TRIP_NOT_FOUND')

    const invalidDestination = await addStop(
      ownerClient,
      tripId,
      'not-a-uuid',
    )
    assert.equal(invalidDestination.status, 400)
  } finally {
    await harness.close()
  }
})

test('updating stop dates validates merged values and trip scope', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { client: ownerClient } = await createVerifiedClient(harness)
    const { client: otherClient } = await createVerifiedClient(harness)
    const destination = await createDestination()
    const otherDestination = await createDestination({ name: 'Lisbon' })
    const created = await createTrip(ownerClient)
    const tripId = created.body.data.trip.id
    const added = await addStop(ownerClient, tripId, destination.id, {
      arrivalDate: '2027-03-29',
      departureDate: '2027-04-05',
    })
    const stopId = added.body.data.trip.stops[0].id

    const otherTrip = await createTrip(otherClient)
    const otherAdded = await addStop(
      otherClient,
      otherTrip.body.data.trip.id,
      otherDestination.id,
    )
    const otherStopId = otherAdded.body.data.trip.stops[0].id

    const otherUpdate = await otherClient.patch(
      `/api/trips/${tripId}/stops/${stopId}`,
      { arrivalDate: '2027-03-30' },
    )
    assert.equal(otherUpdate.status, 404)
    assert.equal(otherUpdate.body.error.code, 'TRIP_NOT_FOUND')

    const update = await ownerClient.patch(
      `/api/trips/${tripId}/stops/${stopId}`,
      {
        arrivalDate: '2027-03-30',
        departureDate: '2027-04-02',
      },
    )
    assert.equal(update.status, 200)
    assert.equal(
      update.body.data.trip.stops[0].arrivalDate,
      '2027-03-30',
    )
    assert.equal(
      update.body.data.trip.stops[0].departureDate,
      '2027-04-02',
    )

    const clearDeparture = await ownerClient.patch(
      `/api/trips/${tripId}/stops/${stopId}`,
      { departureDate: null },
    )
    assert.equal(clearDeparture.status, 200)
    assert.equal(
      clearDeparture.body.data.trip.stops[0].departureDate,
      null,
    )

    const outside = await ownerClient.patch(
      `/api/trips/${tripId}/stops/${stopId}`,
      { arrivalDate: '2027-04-11' },
    )
    assert.equal(outside.status, 400)

    const reversed = await ownerClient.patch(
      `/api/trips/${tripId}/stops/${stopId}`,
      { departureDate: '2027-03-29' },
    )
    assert.equal(reversed.status, 400)

    const missing = await ownerClient.patch(
      `/api/trips/${tripId}/stops/00000000-0000-4000-8000-000000000099`,
      { arrivalDate: null },
    )
    assert.equal(missing.status, 404)
    assert.equal(missing.body.error.code, 'TRIP_STOP_NOT_FOUND')

    const wrongTrip = await ownerClient.patch(
      `/api/trips/${tripId}/stops/${otherStopId}`,
      { arrivalDate: null },
    )
    assert.equal(wrongTrip.status, 404)
    assert.equal(wrongTrip.body.error.code, 'TRIP_STOP_NOT_FOUND')

    const empty = await ownerClient.patch(
      `/api/trips/${tripId}/stops/${stopId}`,
      {},
    )
    assert.equal(empty.status, 400)
  } finally {
    await harness.close()
  }
})

test('removing a stop compacts the remaining order', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { client: ownerClient } = await createVerifiedClient(harness)
    const { client: otherClient } = await createVerifiedClient(harness)
    const destinations = await Promise.all([
      createDestination({ name: 'One' }),
      createDestination({ name: 'Two' }),
      createDestination({ name: 'Three' }),
    ])
    const created = await createTrip(ownerClient)
    const tripId = created.body.data.trip.id

    for (const destination of destinations) {
      const added = await addStop(
        ownerClient,
        tripId,
        destination.id,
      )
      assert.equal(added.status, 201)
    }

    const before = await ownerClient.get(`/api/trips/${tripId}`)
    assert.deepEqual(
      before.body.data.trip.stops.map((stop) => stop.stopOrder),
      [1, 2, 3],
    )
    const middleStopId = before.body.data.trip.stops[1].id

    const otherDelete = await otherClient.delete(
      `/api/trips/${tripId}/stops/${middleStopId}`,
    )
    assert.equal(otherDelete.status, 404)

    const removed = await ownerClient.delete(
      `/api/trips/${tripId}/stops/${middleStopId}`,
    )
    assert.equal(removed.status, 200)
    assert.deepEqual(
      removed.body.data.trip.stops.map((stop) => stop.stopOrder),
      [1, 2],
    )
    assert.equal(removed.body.data.trip.stops.length, 2)

    const repeated = await ownerClient.delete(
      `/api/trips/${tripId}/stops/${middleStopId}`,
    )
    assert.equal(repeated.status, 404)
    assert.equal(repeated.body.error.code, 'TRIP_STOP_NOT_FOUND')
  } finally {
    await harness.close()
  }
})

test('reordering stops is transactional and rejects mismatched lists', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { client: ownerClient } = await createVerifiedClient(harness)
    const { client: otherClient } = await createVerifiedClient(harness)
    const destinations = await Promise.all([
      createDestination({ name: 'One' }),
      createDestination({ name: 'Two' }),
      createDestination({ name: 'Three' }),
    ])
    const created = await createTrip(ownerClient)
    const tripId = created.body.data.trip.id

    for (const destination of destinations) {
      const added = await addStop(
        ownerClient,
        tripId,
        destination.id,
      )
      assert.equal(added.status, 201)
    }

    const initial = await ownerClient.get(`/api/trips/${tripId}`)
    const [firstStop, secondStop, thirdStop] =
      initial.body.data.trip.stops

    const reordered = await ownerClient.put(
      `/api/trips/${tripId}/stops/reorder`,
      {
        stopIds: [thirdStop.id, firstStop.id, secondStop.id],
      },
    )
    assert.equal(reordered.status, 200)
    assert.deepEqual(
      reordered.body.data.trip.stops.map((stop) => stop.id),
      [thirdStop.id, firstStop.id, secondStop.id],
    )
    assert.deepEqual(
      reordered.body.data.trip.stops.map((stop) => stop.stopOrder),
      [1, 2, 3],
    )

    const stored = await TripDestination.findAll({
      where: { tripId },
      order: [['stopOrder', 'ASC']],
    })
    assert.deepEqual(
      stored.map((stop) => stop.id),
      [thirdStop.id, firstStop.id, secondStop.id],
    )
    assert.deepEqual(
      stored.map((stop) => stop.stopOrder),
      [1, 2, 3],
    )

    const missing = await ownerClient.put(
      `/api/trips/${tripId}/stops/reorder`,
      { stopIds: [firstStop.id, secondStop.id] },
    )
    assert.equal(missing.status, 409)
    assert.equal(
      missing.body.error.code,
      'TRIP_STOP_ORDER_CONFLICT',
    )

    const extra = await ownerClient.put(
      `/api/trips/${tripId}/stops/reorder`,
      {
        stopIds: [
          firstStop.id,
          secondStop.id,
          thirdStop.id,
          '00000000-0000-4000-8000-000000000099',
        ],
      },
    )
    assert.equal(extra.status, 409)

    const duplicate = await ownerClient.put(
      `/api/trips/${tripId}/stops/reorder`,
      {
        stopIds: [firstStop.id, firstStop.id, secondStop.id],
      },
    )
    assert.equal(duplicate.status, 400)
    assert.equal(duplicate.body.error.code, 'VALIDATION_ERROR')

    const empty = await ownerClient.put(
      `/api/trips/${tripId}/stops/reorder`,
      { stopIds: [] },
    )
    assert.equal(empty.status, 409)

    const otherReorder = await otherClient.put(
      `/api/trips/${tripId}/stops/reorder`,
      {
        stopIds: [firstStop.id, secondStop.id, thirdStop.id],
      },
    )
    assert.equal(otherReorder.status, 404)

    const unchanged = await ownerClient.get(`/api/trips/${tripId}`)
    assert.deepEqual(
      unchanged.body.data.trip.stops.map((stop) => stop.id),
      [thirdStop.id, firstStop.id, secondStop.id],
    )
  } finally {
    await harness.close()
  }
})

test('deleting a trip is owner-only and cascades stops and itineraries', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { client: ownerClient } = await createVerifiedClient(harness)
    const { client: otherClient } = await createVerifiedClient(harness)
    const destination = await createDestination()
    const created = await createTrip(ownerClient)
    const tripId = created.body.data.trip.id
    await addStop(ownerClient, tripId, destination.id, {
      arrivalDate: '2027-03-29',
    })
    await TripItinerary.create({
      tripId,
      title: 'Visit a temple',
      activityDate: '2027-03-29',
    })

    const otherDelete = await otherClient.delete(
      `/api/trips/${tripId}`,
    )
    assert.equal(otherDelete.status, 404)
    assert.equal(await Trip.count({ where: { id: tripId } }), 1)

    const removed = await ownerClient.delete(`/api/trips/${tripId}`)
    assert.equal(removed.status, 204)
    assert.equal(removed.headers['cache-control'], 'no-store')

    assert.equal(await Trip.count({ where: { id: tripId } }), 0)
    assert.equal(
      await TripDestination.count({ where: { tripId } }),
      0,
    )
    assert.equal(
      await TripItinerary.count({ where: { tripId } }),
      0,
    )

    const missing = await ownerClient.delete(`/api/trips/${tripId}`)
    assert.equal(missing.status, 404)
    assert.equal(missing.body.error.code, 'TRIP_NOT_FOUND')

    const anonymous = await request({
      port: harness.port,
      method: 'DELETE',
      path: `/api/trips/${tripId}`,
    })
    assert.equal(anonymous.status, 401)
  } finally {
    await harness.close()
  }
})

test('trip validation rejects malformed payloads and query values', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { client } = await createVerifiedClient(harness)
    const cases = [
      [
        {
          title: 'Trip',
          startDate: '2027-04-10',
          endDate: '2027-03-28',
        },
        'endDate',
      ],
      [
        {
          title: '',
          startDate: '2027-03-28',
          endDate: '2027-04-10',
        },
        'title',
      ],
      [
        {
          title: 'Trip',
          startDate: '2027-02-30',
          endDate: '2027-04-10',
        },
        'startDate',
      ],
      [
        {
          title: 'Trip',
          startDate: '2027-03-28',
          endDate: '2027-04-10',
          maxParticipants: 0,
        },
        'maxParticipants',
      ],
      [
        {
          title: 'Trip',
          startDate: '2027-03-28',
          endDate: '2027-04-10',
          status: 'archived',
        },
        'status',
      ],
    ]

    for (const [body, field] of cases) {
      const response = await createTrip(client, body)
      assert.equal(response.status, 400)
      assert.equal(response.body.error.code, 'VALIDATION_ERROR')
      assert.equal(
        response.body.error.details.some(
          (detail) => detail.field === field,
        ),
        true,
        `expected a ${field} error for ${JSON.stringify(body)}`,
      )
    }

    assert.equal(
      (await client.get('/api/trips?page=0')).status,
      400,
    )
    assert.equal(
      (await client.get('/api/trips?limit=51')).status,
      400,
    )
    assert.equal(
      (await client.get('/api/trips?page=abc')).status,
      400,
    )
    assert.equal(
      (await client.get('/api/trips?limit=50')).status,
      200,
    )
    assert.equal(
      (await client.get('/api/trips/not-a-uuid')).status,
      400,
    )
  } finally {
    await harness.close()
  }
})

test('unverified users can read trips but cannot modify them', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const user = await createUser({ emailVerifiedAt: null })
    const client = harness.client()
    const login = await loginUser(client, user.email)
    assert.equal(login.status, 200)

    const trip = await Trip.create({
      userId: user.id,
      title: 'Private draft',
      tripType: 'personal',
      startDate: '2027-03-28',
      endDate: '2027-04-10',
      status: 'draft',
    })

    const list = await client.get('/api/trips')
    assert.equal(list.status, 200)
    assert.equal(list.body.data.trips.length, 1)

    const detail = await client.get(`/api/trips/${trip.id}`)
    assert.equal(detail.status, 200)
    assert.equal(detail.body.data.trip.title, 'Private draft')

    const update = await client.patch(`/api/trips/${trip.id}`, {
      title: 'Changed',
    })
    assert.equal(update.status, 403)
    assert.equal(
      update.body.error.code,
      'EMAIL_VERIFICATION_REQUIRED',
    )

    const remove = await client.delete(`/api/trips/${trip.id}`)
    assert.equal(remove.status, 403)
  } finally {
    await harness.close()
  }
})

test('participation endpoints require authentication, CSRF and a verified email', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { client: ownerClient } = await createVerifiedClient(harness)
    const { user: joiner, client: joinerClient } =
      await createVerifiedClient(harness)
    const trip = await createGroupTrip(ownerClient)
    const tripId = trip.id

    const anonymousRequests = [
      ['POST', `/api/trips/${tripId}/join`, {}],
      ['DELETE', `/api/trips/${tripId}/join`, undefined],
      ['GET', `/api/trips/${tripId}/participation`, undefined],
      ['GET', `/api/trips/${tripId}/participants`, undefined],
      [
        'PATCH',
        `/api/trips/${tripId}/participants/${crypto.randomUUID()}`,
        { status: 'approved' },
      ],
    ]

    for (const [method, path, body] of anonymousRequests) {
      const response = await request({
        port: harness.port,
        method,
        path,
        body,
      })

      assert.equal(response.status, 401, `${method} ${path}`)
      assert.equal(response.body.error.code, 'AUTH_REQUIRED')
    }

    const missingCsrf = await request({
      port: harness.port,
      method: 'POST',
      path: `/api/trips/${tripId}/join`,
      headers: { Cookie: joinerClient.cookie },
      body: {},
    })
    assert.equal(missingCsrf.status, 403)
    assert.equal(missingCsrf.body.error.code, 'CSRF_TOKEN_INVALID')

    const invalidCsrf = await request({
      port: harness.port,
      method: 'POST',
      path: `/api/trips/${tripId}/join`,
      headers: {
        Cookie: joinerClient.cookie,
        'X-CSRF-Token': 'not-a-valid-token',
      },
      body: {},
    })
    assert.equal(invalidCsrf.status, 403)
    assert.equal(invalidCsrf.body.error.code, 'CSRF_TOKEN_INVALID')

    const join = await joinTrip(joinerClient, tripId)
    assert.equal(join.status, 201)
    const participantId = join.body.data.participation.id

    const missingDeleteCsrf = await request({
      port: harness.port,
      method: 'DELETE',
      path: `/api/trips/${tripId}/join`,
      headers: { Cookie: joinerClient.cookie },
    })
    assert.equal(missingDeleteCsrf.status, 403)
    assert.equal(
      missingDeleteCsrf.body.error.code,
      'CSRF_TOKEN_INVALID',
    )

    const missingPatchCsrf = await request({
      port: harness.port,
      method: 'PATCH',
      path: `/api/trips/${tripId}/participants/${participantId}`,
      headers: { Cookie: ownerClient.cookie },
      body: { status: 'approved' },
    })
    assert.equal(missingPatchCsrf.status, 403)

    const unverified = await createUser({ emailVerifiedAt: null })
    const unverifiedClient = harness.client()
    const login = await loginUser(unverifiedClient, unverified.email)
    assert.equal(login.status, 200)

    const unverifiedJoin = await joinTrip(unverifiedClient, tripId)
    assert.equal(unverifiedJoin.status, 403)
    assert.equal(
      unverifiedJoin.body.error.code,
      'EMAIL_VERIFICATION_REQUIRED',
    )

    const unverifiedLeave = await leaveTrip(unverifiedClient, tripId)
    assert.equal(unverifiedLeave.status, 403)

    const unverifiedModerate = await moderateParticipant(
      unverifiedClient,
      tripId,
      participantId,
      'approved',
    )
    assert.equal(unverifiedModerate.status, 403)
    assert.equal(
      unverifiedModerate.body.error.code,
      'EMAIL_VERIFICATION_REQUIRED',
    )

    const unverifiedStatus = await getParticipation(
      unverifiedClient,
      tripId,
    )
    assert.equal(unverifiedStatus.status, 200)
    assert.equal(unverifiedStatus.body.data.participation, null)

    const stored = await TripParticipant.findOne({
      where: { tripId, userId: joiner.id },
    })
    assert.equal(stored.status, 'pending')
    assert.equal(stored.joinedAt, null)
  } finally {
    await harness.close()
  }
})

test('joining creates a pending participation with a public shape', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { user: owner, client: ownerClient } =
      await createVerifiedClient(harness)
    const { user: joiner, client: joinerClient } =
      await createVerifiedClient(harness)
    const trip = await createGroupTrip(ownerClient, {
      maxParticipants: 5,
    })
    const tripId = trip.id

    const joined = await joinTrip(joinerClient, tripId, {
      userId: owner.id,
      tripId: '10000000-0000-4000-8000-000000000099',
      participantId: '20000000-0000-4000-8000-000000000099',
      status: 'approved',
      joinedAt: '2026-11-11T00:00:00.000Z',
    })

    assert.equal(joined.status, 201)
    assert.equal(joined.headers['cache-control'], 'no-store')
    const participation = joined.body.data.participation
    assertPublicParticipant(participation)
    assert.equal(participation.status, 'pending')
    assert.equal(participation.joinedAt, null)
    assert.equal(participation.user.id, joiner.id)
    assert.equal(participation.user.fullName, 'Ada Lovelace')

    const stored = await TripParticipant.findByPk(participation.id)
    assert.equal(stored.userId, joiner.id)
    assert.equal(stored.tripId, tripId)
    assert.equal(stored.status, 'pending')
    assert.equal(stored.joinedAt, null)

    const duplicatePending = await joinTrip(joinerClient, tripId)
    assert.equal(duplicatePending.status, 409)
    assert.equal(
      duplicatePending.body.error.code,
      'TRIP_PARTICIPATION_EXISTS',
    )

    const own = await getParticipation(joinerClient, tripId)
    assert.equal(own.status, 200)
    assert.equal(own.headers['cache-control'], 'no-store')
    assert.equal(own.body.data.participation.id, participation.id)
    assertPublicParticipant(own.body.data.participation)

    const approved = await moderateParticipant(
      ownerClient,
      tripId,
      participation.id,
      'approved',
    )
    assert.equal(approved.status, 200)
    assert.notEqual(approved.body.data.participation.joinedAt, null)

    const duplicateApproved = await joinTrip(joinerClient, tripId)
    assert.equal(duplicateApproved.status, 409)
    assert.equal(
      duplicateApproved.body.error.code,
      'TRIP_PARTICIPATION_EXISTS',
    )
    assert.equal(
      await TripParticipant.count({ where: { tripId, userId: joiner.id } }),
      1,
    )
  } finally {
    await harness.close()
  }
})

test('rejoining reuses rejected and cancelled participation rows', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { client: ownerClient } = await createVerifiedClient(harness)
    const { user: joiner, client: joinerClient } =
      await createVerifiedClient(harness)
    const trip = await createGroupTrip(ownerClient)
    const tripId = trip.id

    const first = await joinTrip(joinerClient, tripId)
    assert.equal(first.status, 201)
    const participantId = first.body.data.participation.id

    const rejected = await moderateParticipant(
      ownerClient,
      tripId,
      participantId,
      'rejected',
    )
    assert.equal(rejected.status, 200)
    assert.equal(rejected.body.data.participation.status, 'rejected')
    assert.equal(rejected.body.data.participation.joinedAt, null)

    const afterRejection = await joinTrip(joinerClient, tripId)
    assert.equal(afterRejection.status, 200)
    assert.equal(afterRejection.body.data.participation.id, participantId)
    assert.equal(afterRejection.body.data.participation.status, 'pending')
    assert.equal(afterRejection.body.data.participation.joinedAt, null)

    const cancelled = await moderateParticipant(
      ownerClient,
      tripId,
      participantId,
      'cancelled',
    )
    assert.equal(cancelled.status, 200)

    const afterModerationCancellation = await joinTrip(
      joinerClient,
      tripId,
    )
    assert.equal(afterModerationCancellation.status, 200)
    assert.equal(
      afterModerationCancellation.body.data.participation.id,
      participantId,
    )
    assert.equal(
      afterModerationCancellation.body.data.participation.status,
      'pending',
    )

    const left = await leaveTrip(joinerClient, tripId)
    assert.equal(left.status, 200)
    assert.equal(left.body.data.participation.status, 'cancelled')

    const afterLeave = await joinTrip(joinerClient, tripId)
    assert.equal(afterLeave.status, 200)
    assert.equal(afterLeave.body.data.participation.id, participantId)
    assert.equal(afterLeave.body.data.participation.status, 'pending')

    assert.equal(
      await TripParticipant.count({ where: { tripId, userId: joiner.id } }),
      1,
    )
  } finally {
    await harness.close()
  }
})

test('joining a group trip notifies the trip owner', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { user: owner, client: ownerClient } =
      await createVerifiedClient(harness)
    const { user: joiner, client: joinerClient } =
      await createVerifiedClient(harness, { fullName: 'Grace Hopper' })
    const trip = await createGroupTrip(ownerClient)
    const tripId = trip.id

    const joined = await joinTrip(joinerClient, tripId)
    assert.equal(joined.status, 201)

    const notifications = await Notification.findAll()
    assert.equal(notifications.length, 1)

    const notification = notifications[0]
    assert.equal(notification.userId, owner.id)
    assert.equal(notification.actorId, joiner.id)
    assert.equal(notification.type, 'trip_join_request')
    assert.equal(
      notification.message,
      'Grace Hopper requested to join your trip.',
    )
    assert.equal(notification.referenceType, 'trip')
    assert.equal(notification.referenceId, tripId)
    assert.equal(notification.isRead, false)
    assert.equal(notification.readAt, null)
  } finally {
    await harness.close()
  }
})

test('reactivating a cancelled request creates a fresh notification', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { user: owner, client: ownerClient } =
      await createVerifiedClient(harness)
    const { user: joiner, client: joinerClient } =
      await createVerifiedClient(harness, { fullName: 'Grace Hopper' })
    const trip = await createGroupTrip(ownerClient)
    const tripId = trip.id

    const joined = await joinTrip(joinerClient, tripId)
    assert.equal(joined.status, 201)
    const participantId = joined.body.data.participation.id

    const cancelled = await moderateParticipant(
      ownerClient,
      tripId,
      participantId,
      'cancelled',
    )
    assert.equal(cancelled.status, 200)

    const reactivated = await joinTrip(joinerClient, tripId)
    assert.equal(reactivated.status, 200)

    const notifications = await Notification.findAll({
      where: { type: 'trip_join_request', referenceId: tripId },
    })
    // One request notification for the initial join and one fresh
    // notification for the cancellation reactivation.
    assert.equal(notifications.length, 2)
    for (const notification of notifications) {
      assert.equal(notification.userId, owner.id)
      assert.equal(notification.actorId, joiner.id)
      assert.equal(
        notification.message,
        'Grace Hopper requested to join your trip.',
      )
      assert.equal(notification.referenceType, 'trip')
      assert.equal(notification.referenceId, tripId)
    }
  } finally {
    await harness.close()
  }
})

test('reactivating a rejected request does not create a fresh notification', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { user: owner, client: ownerClient } =
      await createVerifiedClient(harness)
    const { user: joiner, client: joinerClient } =
      await createVerifiedClient(harness, { fullName: 'Grace Hopper' })
    const trip = await createGroupTrip(ownerClient)
    const tripId = trip.id

    const joined = await joinTrip(joinerClient, tripId)
    assert.equal(joined.status, 201)
    const participantId = joined.body.data.participation.id

    const rejected = await moderateParticipant(
      ownerClient,
      tripId,
      participantId,
      'rejected',
    )
    assert.equal(rejected.status, 200)

    const reactivated = await joinTrip(joinerClient, tripId)
    assert.equal(reactivated.status, 200)

    // Only the initial join created a trip_join_request notification;
    // rejecting then reactivating must not add another.
    const notifications = await Notification.findAll({
      where: { type: 'trip_join_request', referenceId: tripId },
    })
    assert.equal(notifications.length, 1)
    assert.equal(notifications[0].userId, owner.id)
    assert.equal(notifications[0].actorId, joiner.id)
    assert.equal(notifications[0].type, 'trip_join_request')
    assert.equal(
      notifications[0].message,
      'Grace Hopper requested to join your trip.',
    )
    assert.equal(notifications[0].referenceType, 'trip')
    assert.equal(notifications[0].referenceId, tripId)
  } finally {
    await harness.close()
  }
})

test('joining does not notify for duplicate requests or a full trip', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { user: owner, client: ownerClient } =
      await createVerifiedClient(harness)
    const { user: joiner, client: joinerClient } = await createVerifiedClient(
      harness,
    )
    const trip = await createGroupTrip(ownerClient, { maxParticipants: 1 })
    const tripId = trip.id

    const joined = await joinTrip(joinerClient, tripId)
    assert.equal(joined.status, 201)
    // A successful join notifies the owner once.
    assert.equal(await Notification.count(), 1)

    const duplicate = await joinTrip(joinerClient, tripId)
    assert.equal(duplicate.status, 409)
    assert.equal(duplicate.body.error.code, 'TRIP_PARTICIPATION_EXISTS')
    assert.equal(await Notification.count(), 1)

    const full = await createGroupTrip(ownerClient, { maxParticipants: 1 })
    const fullTripId = full.id
    const { user: joiner2, client: joiner2Client } =
      await createVerifiedClient(harness)
    const fullJoined = await joinTrip(joiner2Client, fullTripId)
    assert.equal(fullJoined.status, 201)
    assert.equal(await Notification.count(), 2)
    const fullDuplicate = await joinTrip(joiner2Client, fullTripId)
    assert.equal(fullDuplicate.status, 409)
    assert.equal(await Notification.count(), 2)
  } finally {
    await harness.close()
  }
})

test('approving a request notifies the participant', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { user: owner, client: ownerClient } =
      await createVerifiedClient(harness)
    const { user: joiner, client: joinerClient } =
      await createVerifiedClient(harness)
    const trip = await createGroupTrip(ownerClient)
    const tripId = trip.id

    const joined = await joinTrip(joinerClient, tripId)
    assert.equal(joined.status, 201)
    const participantId = joined.body.data.participation.id

    const approved = await moderateParticipant(
      ownerClient,
      tripId,
      participantId,
      'approved',
    )
    assert.equal(approved.status, 200)

    const notifications = await Notification.findAll()
    assert.equal(notifications.length, 2)

    const notification = notifications.find(
      (n) => n.type === 'trip_join_approved',
    )
    assert.ok(notification)
    assert.equal(notification.userId, joiner.id)
    assert.equal(notification.actorId, owner.id)
    assert.equal(
      notification.message,
      'The trip owner approved your request to join.',
    )
    assert.equal(notification.referenceType, 'trip')
    assert.equal(notification.referenceId, tripId)
  } finally {
    await harness.close()
  }
})

test('rejecting a request notifies the participant', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { user: owner, client: ownerClient } =
      await createVerifiedClient(harness)
    const { user: joiner, client: joinerClient } =
      await createVerifiedClient(harness)
    const trip = await createGroupTrip(ownerClient)
    const tripId = trip.id

    const joined = await joinTrip(joinerClient, tripId)
    assert.equal(joined.status, 201)
    const participantId = joined.body.data.participation.id

    const rejected = await moderateParticipant(
      ownerClient,
      tripId,
      participantId,
      'rejected',
    )
    assert.equal(rejected.status, 200)

    const notifications = await Notification.findAll()
    assert.equal(notifications.length, 2)

    const notification = notifications.find(
      (n) => n.type === 'trip_join_rejected',
    )
    assert.ok(notification)
    assert.equal(notification.userId, joiner.id)
    assert.equal(notification.actorId, owner.id)
    assert.equal(
      notification.message,
      'The trip owner rejected your request to join.',
    )
    assert.equal(notification.referenceType, 'trip')
    assert.equal(notification.referenceId, tripId)
  } finally {
    await harness.close()
  }
})

test('cancelling a request does not notify', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { user: owner, client: ownerClient } =
      await createVerifiedClient(harness)
    const { user: joiner, client: joinerClient } =
      await createVerifiedClient(harness)
    const trip = await createGroupTrip(ownerClient)
    const tripId = trip.id

    const joined = await joinTrip(joinerClient, tripId)
    assert.equal(joined.status, 201)
    const participantId = joined.body.data.participation.id

    const cancelled = await moderateParticipant(
      ownerClient,
      tripId,
      participantId,
      'cancelled',
    )
    assert.equal(cancelled.status, 200)

    // The join notified the owner once; cancelling must not add another.
    assert.equal(await Notification.count(), 1)
    const notification = await Notification.findOne()
    assert.equal(notification.type, 'trip_join_request')
  } finally {
    await harness.close()
  }
})

test('notification failure rolls back a join request', async (t) => {
  if (skip(t)) return
  const harness = await createHarness({
    notificationCreationService: {
      async createNotification() {
        throw new Error('notification write failed')
      },
    },
  })

  try {
    const { user: owner, client: ownerClient } =
      await createVerifiedClient(harness)
    const { user: joiner, client: joinerClient } =
      await createVerifiedClient(harness)
    const trip = await createGroupTrip(ownerClient)
    const tripId = trip.id

    const joined = await joinTrip(joinerClient, tripId)

    assert.equal(joined.status, 500)
    assert.equal(joined.body.error.code, 'INTERNAL_ERROR')
    assert.equal(await TripParticipant.count({ where: { tripId } }), 0)
    assert.equal(await Notification.count(), 0)
  } finally {
    await harness.close()
  }
})

test('notification failure rolls back an approval', async (t) => {
  if (skip(t)) return
  let attempts = 0
  const harness = await createHarness({
    notificationCreationService: {
      async createNotification() {
        attempts += 1
        if (attempts >= 2) throw new Error('notification write failed')
        return { id: 'notification-id' }
      },
    },
  })

  try {
    const { user: owner, client: ownerClient } =
      await createVerifiedClient(harness)
    const { user: joiner, client: joinerClient } =
      await createVerifiedClient(harness)
    const trip = await createGroupTrip(ownerClient)
    const tripId = trip.id

    const joined = await joinTrip(joinerClient, tripId)
    assert.equal(joined.status, 201)
    assert.equal(attempts, 1)
    const participantId = joined.body.data.participation.id

    const approved = await moderateParticipant(
      ownerClient,
      tripId,
      participantId,
      'approved',
    )

    assert.equal(approved.status, 500)
    assert.equal(approved.body.error.code, 'INTERNAL_ERROR')
    assert.equal(attempts, 2)
    // The approval must be rolled back: the participation stays pending.
    const stored = await TripParticipant.findByPk(participantId)
    assert.equal(stored.status, 'pending')
    // The join's participation committed; only the approval update rolled back.
    assert.equal(await TripParticipant.count({ where: { tripId } }), 1)
  } finally {
    await harness.close()
  }
})

test('notification failure rolls back a rejection', async (t) => {
  if (skip(t)) return
  let attempts = 0
  const harness = await createHarness({
    notificationCreationService: {
      async createNotification() {
        attempts += 1
        if (attempts >= 2) throw new Error('notification write failed')
        return { id: 'notification-id' }
      },
    },
  })

  try {
    const { user: owner, client: ownerClient } =
      await createVerifiedClient(harness)
    const { user: joiner, client: joinerClient } =
      await createVerifiedClient(harness)
    const trip = await createGroupTrip(ownerClient)
    const tripId = trip.id

    const joined = await joinTrip(joinerClient, tripId)
    assert.equal(joined.status, 201)
    assert.equal(attempts, 1)
    const participantId = joined.body.data.participation.id

    const rejected = await moderateParticipant(
      ownerClient,
      tripId,
      participantId,
      'rejected',
    )

    assert.equal(rejected.status, 500)
    assert.equal(rejected.body.error.code, 'INTERNAL_ERROR')
    assert.equal(attempts, 2)
    // The rejection must be rolled back: the participation stays pending.
    const stored = await TripParticipant.findByPk(participantId)
    assert.equal(stored.status, 'pending')
    // The join's participation committed; only the rejection update rolled back.
    assert.equal(await TripParticipant.count({ where: { tripId } }), 1)
  } finally {
    await harness.close()
  }
})

test('join restrictions cover owners, trip type, status and visibility', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { client: ownerClient } = await createVerifiedClient(harness)
    const { client: otherClient } = await createVerifiedClient(harness)

    const published = await createGroupTrip(ownerClient)
    const ownerJoin = await joinTrip(ownerClient, published.id)
    assert.equal(ownerJoin.status, 409)
    assert.equal(
      ownerJoin.body.error.code,
      'TRIP_OWNER_CANNOT_JOIN',
    )

    const personal = await createGroupTrip(ownerClient, {
      tripType: 'personal',
    })
    const personalJoin = await joinTrip(otherClient, personal.id)
    assert.equal(personalJoin.status, 409)
    assert.equal(personalJoin.body.error.code, 'TRIP_NOT_JOINABLE')

    for (const status of ['cancelled', 'completed']) {
      const closed = await createGroupTrip(ownerClient, { status })
      const closedJoin = await joinTrip(otherClient, closed.id)
      assert.equal(closedJoin.status, 409, status)
      assert.equal(
        closedJoin.body.error.code,
        'TRIP_NOT_JOINABLE',
        status,
      )
    }

    const draft = await createGroupTrip(ownerClient, {
      status: 'draft',
    })
    const draftJoin = await joinTrip(otherClient, draft.id)
    assert.equal(draftJoin.status, 404)
    assert.equal(draftJoin.body.error.code, 'TRIP_NOT_FOUND')

    const ownerDraftJoin = await joinTrip(ownerClient, draft.id)
    assert.equal(ownerDraftJoin.status, 409)
    assert.equal(
      ownerDraftJoin.body.error.code,
      'TRIP_OWNER_CANNOT_JOIN',
    )

    const missingJoin = await joinTrip(
      otherClient,
      '00000000-0000-4000-8000-000000000099',
    )
    assert.equal(missingJoin.status, 404)
    assert.equal(missingJoin.body.error.code, 'TRIP_NOT_FOUND')

    const malformedJoin = await joinTrip(otherClient, 'not-a-uuid')
    assert.equal(malformedJoin.status, 400)
    assert.equal(malformedJoin.body.error.code, 'VALIDATION_ERROR')
  } finally {
    await harness.close()
  }
})

test('a full trip rejects new joins and counts approved participants only', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { client: ownerClient } = await createVerifiedClient(harness)
    const { client: firstClient } = await createVerifiedClient(harness)
    const { client: secondClient } = await createVerifiedClient(harness)
    const { client: thirdClient } = await createVerifiedClient(harness)
    const trip = await createGroupTrip(ownerClient, {
      maxParticipants: 1,
    })
    const tripId = trip.id

    const firstJoin = await joinTrip(firstClient, tripId)
    assert.equal(firstJoin.status, 201)

    const secondPending = await joinTrip(secondClient, tripId)
    assert.equal(secondPending.status, 201)

    const approval = await moderateParticipant(
      ownerClient,
      tripId,
      firstJoin.body.data.participation.id,
      'approved',
    )
    assert.equal(approval.status, 200)

    const full = await joinTrip(thirdClient, tripId)
    assert.equal(full.status, 409)
    assert.equal(full.body.error.code, 'TRIP_FULL')

    const stillPending = await TripParticipant.findByPk(
      secondPending.body.data.participation.id,
    )
    assert.equal(stillPending.status, 'pending')
  } finally {
    await harness.close()
  }
})

test('leaving cancels pending and approved participation and retains the row', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { client: ownerClient } = await createVerifiedClient(harness)
    const { client: pendingClient } = await createVerifiedClient(harness)
    const { client: approvedClient } = await createVerifiedClient(harness)
    const { client: missingClient } = await createVerifiedClient(harness)
    const { client: rejectedClient } = await createVerifiedClient(harness)
    const trip = await createGroupTrip(ownerClient)
    const tripId = trip.id

    const pendingJoin = await joinTrip(pendingClient, tripId)
    const pendingId = pendingJoin.body.data.participation.id

    const cancelled = await leaveTrip(pendingClient, tripId)
    assert.equal(cancelled.status, 200)
    assert.equal(cancelled.headers['cache-control'], 'no-store')
    assert.equal(cancelled.body.data.participation.id, pendingId)
    assert.equal(cancelled.body.data.participation.status, 'cancelled')
    assert.equal(cancelled.body.data.participation.joinedAt, null)
    assertPublicParticipant(cancelled.body.data.participation)

    const storedPending = await TripParticipant.findByPk(pendingId)
    assert.equal(storedPending.status, 'cancelled')
    assert.equal(storedPending.joinedAt, null)

    const repeated = await leaveTrip(pendingClient, tripId)
    assert.equal(repeated.status, 409)
    assert.equal(
      repeated.body.error.code,
      'TRIP_PARTICIPATION_STATE_CONFLICT',
    )

    const approvedJoin = await joinTrip(approvedClient, tripId)
    const approvedId = approvedJoin.body.data.participation.id
    const approval = await moderateParticipant(
      ownerClient,
      tripId,
      approvedId,
      'approved',
    )
    assert.equal(approval.status, 200)

    const leftApproved = await leaveTrip(approvedClient, tripId)
    assert.equal(leftApproved.status, 200)
    assert.equal(leftApproved.body.data.participation.status, 'cancelled')
    assert.equal(leftApproved.body.data.participation.joinedAt, null)

    const storedApproved = await TripParticipant.findByPk(approvedId)
    assert.equal(storedApproved.status, 'cancelled')
    assert.equal(storedApproved.joinedAt, null)

    const missing = await leaveTrip(missingClient, tripId)
    assert.equal(missing.status, 404)
    assert.equal(
      missing.body.error.code,
      'TRIP_PARTICIPATION_NOT_FOUND',
    )

    const ownerLeave = await leaveTrip(ownerClient, tripId)
    assert.equal(ownerLeave.status, 409)
    assert.equal(
      ownerLeave.body.error.code,
      'TRIP_OWNER_CANNOT_JOIN',
    )

    const rejectedJoin = await joinTrip(rejectedClient, tripId)
    await moderateParticipant(
      ownerClient,
      tripId,
      rejectedJoin.body.data.participation.id,
      'rejected',
    )
    const rejectedLeave = await leaveTrip(rejectedClient, tripId)
    assert.equal(rejectedLeave.status, 409)
    assert.equal(
      rejectedLeave.body.error.code,
      'TRIP_PARTICIPATION_STATE_CONFLICT',
    )
  } finally {
    await harness.close()
  }
})

test('own participation returns null when absent and preserves visibility', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { client: ownerClient } = await createVerifiedClient(harness)
    const { client: otherClient } = await createVerifiedClient(harness)
    const published = await createGroupTrip(ownerClient)

    const none = await getParticipation(otherClient, published.id)
    assert.equal(none.status, 200)
    assert.equal(none.headers['cache-control'], 'no-store')
    assert.equal(none.body.data.participation, null)

    const ownerNone = await getParticipation(ownerClient, published.id)
    assert.equal(ownerNone.status, 200)
    assert.equal(ownerNone.body.data.participation, null)

    const join = await joinTrip(otherClient, published.id)
    assert.equal(join.status, 201)

    const own = await getParticipation(otherClient, published.id)
    assert.equal(own.status, 200)
    assert.equal(own.body.data.participation.status, 'pending')
    assert.equal(own.body.data.participation.id, join.body.data.participation.id)

    const draft = await createGroupTrip(ownerClient, {
      status: 'draft',
    })
    const draftOther = await getParticipation(otherClient, draft.id)
    assert.equal(draftOther.status, 404)
    assert.equal(draftOther.body.error.code, 'TRIP_NOT_FOUND')

    const draftOwner = await getParticipation(ownerClient, draft.id)
    assert.equal(draftOwner.status, 200)
    assert.equal(draftOwner.body.data.participation, null)

    const missing = await getParticipation(
      otherClient,
      '00000000-0000-4000-8000-000000000099',
    )
    assert.equal(missing.status, 404)
  } finally {
    await harness.close()
  }
})

test('owner roster is owner-only, filtered, paginated and public', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { client: ownerClient } = await createVerifiedClient(harness)
    const joiners = []

    for (let index = 0; index < 3; index += 1) {
      joiners.push(await createVerifiedClient(harness))
    }

    const trip = await createGroupTrip(ownerClient)
    const tripId = trip.id
    const participantIds = []

    for (const joiner of joiners) {
      const join = await joinTrip(joiner.client, tripId)
      assert.equal(join.status, 201)
      participantIds.push(join.body.data.participation.id)
    }

    const expectedOrder = await TripParticipant.findAll({
      where: { tripId },
      order: [
        ['createdAt', 'ASC'],
        ['id', 'ASC'],
      ],
    })

    const roster = await getParticipants(ownerClient, tripId)
    assert.equal(roster.status, 200)
    assert.equal(roster.headers['cache-control'], 'no-store')
    assert.deepEqual(
      roster.body.data.participants.map((participant) => participant.id),
      expectedOrder.map((participant) => participant.id),
    )
    assert.deepEqual(roster.body.data.pagination, {
      page: 1,
      limit: 20,
      total: 3,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    })

    for (const participant of roster.body.data.participants) {
      assertPublicParticipant(participant)
    }

    const nonOwner = await getParticipants(joiners[0].client, tripId)
    assert.equal(nonOwner.status, 404)
    assert.equal(nonOwner.body.error.code, 'TRIP_NOT_FOUND')

    const missing = await getParticipants(
      ownerClient,
      '00000000-0000-4000-8000-000000000099',
    )
    assert.equal(missing.status, 404)

    await moderateParticipant(
      ownerClient,
      tripId,
      participantIds[0],
      'approved',
    )
    await moderateParticipant(
      ownerClient,
      tripId,
      participantIds[1],
      'rejected',
    )

    const approved = await getParticipants(
      ownerClient,
      tripId,
      '?status=approved',
    )
    assert.equal(approved.status, 200)
    assert.deepEqual(
      approved.body.data.participants.map(
        (participant) => participant.id,
      ),
      [participantIds[0]],
    )

    const pending = await getParticipants(
      ownerClient,
      tripId,
      '?status=pending',
    )
    assert.deepEqual(
      pending.body.data.participants.map(
        (participant) => participant.id,
      ),
      [participantIds[2]],
    )

    const cancelled = await getParticipants(
      ownerClient,
      tripId,
      '?status=cancelled',
    )
    assert.equal(cancelled.body.data.participants.length, 0)
    assert.equal(cancelled.body.data.pagination.total, 0)
    assert.equal(cancelled.body.data.pagination.totalPages, 0)

    const firstPage = await getParticipants(
      ownerClient,
      tripId,
      '?limit=2&page=1',
    )
    assert.equal(firstPage.body.data.participants.length, 2)
    assert.deepEqual(firstPage.body.data.pagination, {
      page: 1,
      limit: 2,
      total: 3,
      totalPages: 2,
      hasNextPage: true,
      hasPreviousPage: false,
    })

    const secondPage = await getParticipants(
      ownerClient,
      tripId,
      '?limit=2&page=2',
    )
    assert.equal(secondPage.body.data.participants.length, 1)
    assert.equal(secondPage.body.data.pagination.hasPreviousPage, true)
    assert.equal(secondPage.body.data.pagination.hasNextPage, false)

    const invalidStatus = await getParticipants(
      ownerClient,
      tripId,
      '?status=joined',
    )
    assert.equal(invalidStatus.status, 400)
    assert.equal(
      invalidStatus.body.error.code,
      'VALIDATION_ERROR',
    )

    const invalidLimit = await getParticipants(
      ownerClient,
      tripId,
      '?limit=51',
    )
    assert.equal(invalidLimit.status, 400)

    const injected = await getParticipants(
      ownerClient,
      tripId,
      '?status=approved&userId=00000000-0000-4000-8000-000000000099',
    )
    assert.equal(injected.status, 200)
    assert.deepEqual(
      injected.body.data.participants.map(
        (participant) => participant.id,
      ),
      [participantIds[0]],
    )
  } finally {
    await harness.close()
  }
})

test('owner moderation enforces transitions, trip scope and capacity', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { client: ownerClient } = await createVerifiedClient(harness)
    const { client: otherClient } = await createVerifiedClient(harness)
    const joiners = []

    for (let index = 0; index < 4; index += 1) {
      joiners.push(await createVerifiedClient(harness))
    }

    const trip = await createGroupTrip(ownerClient, {
      maxParticipants: 2,
    })
    const tripId = trip.id

    const ids = []
    for (const joiner of joiners) {
      const join = await joinTrip(joiner.client, tripId)
      assert.equal(join.status, 201)
      ids.push(join.body.data.participation.id)
    }

    const approved = await moderateParticipant(
      ownerClient,
      tripId,
      ids[0],
      'approved',
    )
    assert.equal(approved.status, 200)
    assert.equal(approved.headers['cache-control'], 'no-store')
    assert.equal(approved.body.data.participation.status, 'approved')
    assert.notEqual(approved.body.data.participation.joinedAt, null)
    assertPublicParticipant(approved.body.data.participation)

    const rejected = await moderateParticipant(
      ownerClient,
      tripId,
      ids[1],
      'rejected',
    )
    assert.equal(rejected.status, 200)
    assert.equal(rejected.body.data.participation.status, 'rejected')
    assert.equal(rejected.body.data.participation.joinedAt, null)

    const cancelledPending = await moderateParticipant(
      ownerClient,
      tripId,
      ids[2],
      'cancelled',
    )
    assert.equal(cancelledPending.status, 200)
    assert.equal(
      cancelledPending.body.data.participation.status,
      'cancelled',
    )
    assert.equal(
      cancelledPending.body.data.participation.joinedAt,
      null,
    )

    const approvedFourth = await moderateParticipant(
      ownerClient,
      tripId,
      ids[3],
      'approved',
    )
    assert.equal(approvedFourth.status, 200)

    const removeApproved = await moderateParticipant(
      ownerClient,
      tripId,
      ids[3],
      'cancelled',
    )
    assert.equal(removeApproved.status, 200)
    assert.equal(
      removeApproved.body.data.participation.status,
      'cancelled',
    )
    assert.equal(removeApproved.body.data.participation.joinedAt, null)

    for (const [participantId, status] of [
      [ids[0], 'approved'],
      [ids[0], 'rejected'],
      [ids[1], 'approved'],
      [ids[2], 'approved'],
      [ids[3], 'approved'],
    ]) {
      const conflict = await moderateParticipant(
        ownerClient,
        tripId,
        participantId,
        status,
      )
      assert.equal(conflict.status, 409, `${participantId} ${status}`)
      assert.equal(
        conflict.body.error.code,
        'TRIP_PARTICIPATION_STATE_CONFLICT',
      )
    }

    const invalidTarget = await moderateParticipant(
      ownerClient,
      tripId,
      ids[1],
      'pending',
    )
    assert.equal(invalidTarget.status, 400)
    assert.equal(
      invalidTarget.body.error.code,
      'VALIDATION_ERROR',
    )

    const missing = await moderateParticipant(
      ownerClient,
      tripId,
      '20000000-0000-4000-8000-000000000099',
      'approved',
    )
    assert.equal(missing.status, 404)
    assert.equal(
      missing.body.error.code,
      'TRIP_PARTICIPATION_NOT_FOUND',
    )

    const otherTrip = await createGroupTrip(ownerClient)
    const otherJoin = await joinTrip(otherClient, otherTrip.id)
    const wrongTrip = await moderateParticipant(
      ownerClient,
      tripId,
      otherJoin.body.data.participation.id,
      'approved',
    )
    assert.equal(wrongTrip.status, 404)
    assert.equal(
      wrongTrip.body.error.code,
      'TRIP_PARTICIPATION_NOT_FOUND',
    )

    const nonOwner = await moderateParticipant(
      otherClient,
      tripId,
      ids[1],
      'cancelled',
    )
    assert.equal(nonOwner.status, 404)
    assert.equal(nonOwner.body.error.code, 'TRIP_NOT_FOUND')

    const stored = await TripParticipant.findByPk(ids[1])
    assert.equal(stored.status, 'rejected')
  } finally {
    await harness.close()
  }
})

test('moderation rechecks capacity inside the transaction', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { client: ownerClient } = await createVerifiedClient(harness)
    const { client: firstClient } = await createVerifiedClient(harness)
    const { client: secondClient } = await createVerifiedClient(harness)
    const trip = await createGroupTrip(ownerClient, {
      maxParticipants: 1,
    })

    const first = await joinTrip(firstClient, trip.id)
    const second = await joinTrip(secondClient, trip.id)

    const approval = await moderateParticipant(
      ownerClient,
      trip.id,
      first.body.data.participation.id,
      'approved',
    )
    assert.equal(approval.status, 200)

    const full = await moderateParticipant(
      ownerClient,
      trip.id,
      second.body.data.participation.id,
      'approved',
    )
    assert.equal(full.status, 409)
    assert.equal(full.body.error.code, 'TRIP_FULL')

    const stored = await TripParticipant.findByPk(
      second.body.data.participation.id,
    )
    assert.equal(stored.status, 'pending')
    assert.equal(stored.joinedAt, null)
  } finally {
    await harness.close()
  }
})

test('participation responses are private and never cached', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { client: ownerClient } = await createVerifiedClient(harness)
    const { user: joiner, client: joinerClient } =
      await createVerifiedClient(harness)
    const trip = await createGroupTrip(ownerClient)

    const join = await joinTrip(joinerClient, trip.id)
    const participantId = join.body.data.participation.id
    const own = await getParticipation(joinerClient, trip.id)
    const roster = await getParticipants(ownerClient, trip.id)
    const moderation = await moderateParticipant(
      ownerClient,
      trip.id,
      participantId,
      'approved',
    )
    const leave = await leaveTrip(joinerClient, trip.id)

    for (const response of [join, own, roster, moderation, leave]) {
      assert.equal(response.headers['cache-control'], 'no-store')
    }

    const bodies = [
      join.body.data.participation,
      own.body.data.participation,
      moderation.body.data.participation,
      leave.body.data.participation,
      ...roster.body.data.participants,
    ]

    for (const participant of bodies) {
      assertPublicParticipant(participant)
    }

    const serialized = JSON.stringify([
      join.body,
      own.body,
      roster.body,
      moderation.body,
      leave.body,
    ])
    assert.equal(serialized.includes(joiner.email), false)
    assert.equal(serialized.includes(PASSWORD), false)
    assert.equal(serialized.includes('passwordHash'), false)
    assert.equal(serialized.includes('authVersion'), false)
    assert.equal(serialized.includes('emailVerifiedAt'), false)
  } finally {
    await harness.close()
  }
})

test('the unique trip and user participation constraint is enforced', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { client: ownerClient } = await createVerifiedClient(harness)
    const { user: joiner, client: joinerClient } =
      await createVerifiedClient(harness)
    const trip = await createGroupTrip(ownerClient)

    const join = await joinTrip(joinerClient, trip.id)
    assert.equal(join.status, 201)

    await assert.rejects(
      () =>
        TripParticipant.create({
          tripId: trip.id,
          userId: joiner.id,
          status: 'pending',
        }),
      (error) => {
        assert.equal(error.name, 'SequelizeUniqueConstraintError')
        return true
      },
    )

    assert.equal(
      await TripParticipant.count({
        where: { tripId: trip.id, userId: joiner.id },
      }),
      1,
    )
  } finally {
    await harness.close()
  }
})

// Two authenticated owner sessions dispatch approvals together. The service
// locks the trip row and recounts approved participants inside the same
// transaction, so regardless of which request wins, the database must end with
// exactly one approved participant and the other request must see TRIP_FULL.
test('concurrent approvals cannot exceed maxParticipants', async (t) => {
  if (skip(t)) return
  const harness = await createHarness()

  try {
    const { user: owner, client: ownerClient } =
      await createVerifiedClient(harness)
    const concurrentOwner = harness.client()
    const ownerLogin = await loginUser(concurrentOwner, owner.email)
    assert.equal(ownerLogin.status, 200)

    const { client: firstClient } = await createVerifiedClient(harness)
    const { client: secondClient } = await createVerifiedClient(harness)
    const trip = await createGroupTrip(ownerClient, {
      maxParticipants: 1,
    })

    const first = await joinTrip(firstClient, trip.id)
    const second = await joinTrip(secondClient, trip.id)

    const responses = await Promise.all([
      moderateParticipant(
        ownerClient,
        trip.id,
        first.body.data.participation.id,
        'approved',
      ),
      moderateParticipant(
        concurrentOwner,
        trip.id,
        second.body.data.participation.id,
        'approved',
      ),
    ])

    const statuses = responses.map((response) => response.status).sort()
    assert.deepEqual(statuses, [200, 409])

    const conflict = responses.find(
      (response) => response.status === 409,
    )
    assert.equal(conflict.body.error.code, 'TRIP_FULL')

    assert.equal(
      await TripParticipant.count({
        where: { tripId: trip.id, status: 'approved' },
      }),
      1,
    )
  } finally {
    await harness.close()
  }
})
