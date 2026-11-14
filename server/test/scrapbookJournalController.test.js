'use strict'

process.env.NODE_ENV = 'test'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  createScrapbookJournalController,
} = require('../src/controllers/scrapbookJournalController')
const {
  ScrapbookNotFoundError,
  ScrapbookImageNotFoundError,
} = require('../src/utils/scrapbookErrors')
const { ValidationError } = require('../src/utils/authErrors')

const JOURNAL_ID = '11111111-1111-4111-8111-111111111111'
const IMAGE_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const TRIP_ID = '44444444-4444-4444-8444-444444444444'

const flushHandler = () => new Promise(resolve => setImmediate(resolve))

const createResponse = () => {
  const headers = {}
  const res = {
    headers,
    statusCode: null,
    body: undefined,
    set(name, value) {
      headers[name] = value
      return res
    },
    status(code) {
      res.statusCode = code
      return res
    },
    json(payload) {
      res.body = payload
      return res
    },
    end() {
      return res
    },
  }

  return res
}

const createNext = () => {
  let error = null
  const next = (err) => {
    error = err
  }
  return { next, getError: () => error }
}

const createService = (overrides = {}) => {
  const defaults = {
    createScrapbookJournal: async (userId, input) => ({
      id: JOURNAL_ID,
      userId,
      tripId: input.tripId || null,
      title: input.title,
      description: input.description || null,
      isPublic: input.isPublic === true,
    }),
    listScrapbookJournals: async (userId, filters) => ({
      journals: [
        {
          id: JOURNAL_ID,
          userId,
          title: 'Test Journal',
          description: 'A test journal',
          isPublic: false,
          tripId: null,
          imageCount: 0,
          coverImage: null,
          createdAt: new Date(),
        },
      ],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    }),
    getScrapbookJournal: async (userId, journalId) => ({
      id: journalId,
      userId,
      title: 'Test Journal',
      description: 'A test journal',
      isPublic: false,
      tripId: null,
      images: [],
      createdAt: new Date(),
    }),
    updateScrapbookJournal: async (userId, journalId, input) => ({
      id: journalId,
      userId,
      title: input.title || 'Test Journal',
      description: input.description !== undefined ? input.description : 'A test journal',
      isPublic: false,
      tripId: null,
      images: [],
      createdAt: new Date(),
    }),
    setJournalVisibility: async (userId, journalId, isPublic) => ({
      id: journalId,
      userId,
      title: 'Test Journal',
      description: 'A test journal',
      isPublic: isPublic === true,
      tripId: null,
      images: [],
      createdAt: new Date(),
    }),
    linkTrip: async (userId, journalId, tripId) => ({
      id: journalId,
      userId,
      title: 'Test Journal',
      description: 'A test journal',
      isPublic: false,
      tripId,
      images: [],
      createdAt: new Date(),
    }),
    unlinkTrip: async (userId, journalId) => ({
      id: journalId,
      userId,
      title: 'Test Journal',
      description: 'A test journal',
      isPublic: false,
      tripId: null,
      images: [],
      createdAt: new Date(),
    }),
    deleteScrapbookJournal: async (userId, journalId) => {},
    listScrapbookImages: async (userId, journalId) => [
      {
        id: IMAGE_ID,
        journalId,
        imageUrl: 'https://res.cloudinary.com/test/image/upload/v1/photo.jpg',
        altText: 'A test photo',
        caption: null,
        takenAt: null,
        displayOrder: 1,
        isCover: true,
      },
    ],
  }

  const service = { ...defaults, ...overrides }
  const calls = {
    createScrapbookJournal: [],
    listScrapbookJournals: [],
    getScrapbookJournal: [],
    updateScrapbookJournal: [],
    setJournalVisibility: [],
    linkTrip: [],
    unlinkTrip: [],
    deleteScrapbookJournal: [],
    listScrapbookImages: [],
  }

  const wrapped = {}
  for (const [key, fn] of Object.entries(service)) {
    wrapped[key] = async (...args) => {
      calls[key].push(args)
      return fn(...args)
    }
  }

  return { service: wrapped, calls }
}

test('create handler returns created journal', async () => {
  const { service, calls } = createService()
  const controller = createScrapbookJournalController({
    scrapbookJournalService: service,
  })
  const { next, getError } = createNext()

  const req = {
    auth: { userId: USER_ID },
    body: { title: 'My Journal', description: 'My travel memories' },
  }
  const res = createResponse()

  controller.create(req, res, next)
  await flushHandler()

  assert.equal(getError(), null)
  assert.equal(res.statusCode, 201)
  assert.equal(res.headers['Cache-Control'], 'no-store')
  assert.equal(res.body.data.journal.id, JOURNAL_ID)
  assert.equal(res.body.data.journal.title, 'My Journal')
  assert.equal(res.body.data.journal.isPublic, false)
  assert.equal(calls.createScrapbookJournal.length, 1)
  assert.equal(calls.createScrapbookJournal[0][0], USER_ID)
  assert.equal(calls.createScrapbookJournal[0][1].title, 'My Journal')
})

test('create handler defaults to private', async () => {
  const { service, calls } = createService()
  const controller = createScrapbookJournalController({
    scrapbookJournalService: service,
  })
  const { next, getError } = createNext()

  const req = {
    auth: { userId: USER_ID },
    body: { title: 'Private Journal' },
  }
  const res = createResponse()

  controller.create(req, res, next)
  await flushHandler()

  assert.equal(getError(), null)
  // The mock service coerces isPublic with === true, so undefined becomes false.
  assert.equal(calls.createScrapbookJournal[0][1].isPublic, undefined)
  assert.equal(res.body.data.journal.isPublic, false)
})

test('create handler with explicit public visibility', async () => {
  const { service, calls } = createService()
  const controller = createScrapbookJournalController({
    scrapbookJournalService: service,
  })
  const { next, getError } = createNext()

  const req = {
    auth: { userId: USER_ID },
    body: { title: 'Public Journal', isPublic: true },
  }
  const res = createResponse()

  controller.create(req, res, next)
  await flushHandler()

  assert.equal(getError(), null)
  assert.equal(calls.createScrapbookJournal[0][1].isPublic, true)
})

test('create handler links a trip', async () => {
  const { service, calls } = createService()
  const controller = createScrapbookJournalController({
    scrapbookJournalService: service,
  })
  const { next, getError } = createNext()

  const req = {
    auth: { userId: USER_ID },
    body: { title: 'Trip Journal', tripId: TRIP_ID },
  }
  const res = createResponse()

  controller.create(req, res, next)
  await flushHandler()

  assert.equal(getError(), null)
  assert.equal(calls.createScrapbookJournal[0][1].tripId, TRIP_ID)
})

test('create handler propagates validation error', async () => {
  const { service } = createService({
    createScrapbookJournal: async () => {
      throw new ValidationError([{ field: 'title', message: 'Title is required.' }])
    },
  })
  const controller = createScrapbookJournalController({
    scrapbookJournalService: service,
  })
  const { next, getError } = createNext()

  const req = {
    auth: { userId: USER_ID },
    body: { title: '' },
  }
  const res = createResponse()

  controller.create(req, res, next)
  await flushHandler()

  const error = getError()
  assert.ok(error instanceof ValidationError)
})

test('list handler returns user journals', async () => {
  const { service, calls } = createService()
  const controller = createScrapbookJournalController({
    scrapbookJournalService: service,
  })
  const { next, getError } = createNext()

  const req = {
    auth: { userId: USER_ID },
    query: {},
  }
  const res = createResponse()

  controller.list(req, res, next)
  await flushHandler()

  assert.equal(getError(), null)
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['Cache-Control'], 'no-store')
  assert.equal(res.body.data.journals.length, 1)
  assert.equal(res.body.data.journals[0].id, JOURNAL_ID)
  assert.equal(calls.listScrapbookJournals.length, 1)
  assert.equal(calls.listScrapbookJournals[0][0], USER_ID)
})

test('get handler returns own journal', async () => {
  const { service, calls } = createService()
  const controller = createScrapbookJournalController({
    scrapbookJournalService: service,
  })
  const { next, getError } = createNext()

  const req = {
    auth: { userId: USER_ID },
    params: { journalId: JOURNAL_ID },
  }
  const res = createResponse()

  controller.get(req, res, next)
  await flushHandler()

  assert.equal(getError(), null)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.data.journal.id, JOURNAL_ID)
  assert.equal(calls.getScrapbookJournal.length, 1)
  assert.equal(calls.getScrapbookJournal[0][0], USER_ID)
  assert.equal(calls.getScrapbookJournal[0][1], JOURNAL_ID)
})

test('get handler propagates not found error', async () => {
  const { service } = createService({
    getScrapbookJournal: async () => {
      throw new ScrapbookNotFoundError()
    },
  })
  const controller = createScrapbookJournalController({
    scrapbookJournalService: service,
  })
  const { next, getError } = createNext()

  const req = {
    auth: { userId: USER_ID },
    params: { journalId: JOURNAL_ID },
  }
  const res = createResponse()

  controller.get(req, res, next)
  await flushHandler()

  const error = getError()
  assert.ok(error instanceof ScrapbookNotFoundError)
})

test('update handler updates journal fields', async () => {
  const { service, calls } = createService()
  const controller = createScrapbookJournalController({
    scrapbookJournalService: service,
  })
  const { next, getError } = createNext()

  const req = {
    auth: { userId: USER_ID },
    params: { journalId: JOURNAL_ID },
    body: { title: 'Updated Title', description: 'Updated description' },
  }
  const res = createResponse()

  controller.update(req, res, next)
  await flushHandler()

  assert.equal(getError(), null)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.data.journal.title, 'Updated Title')
  assert.equal(res.body.data.journal.description, 'Updated description')
  assert.equal(calls.updateScrapbookJournal.length, 1)
  assert.equal(calls.updateScrapbookJournal[0][0], USER_ID)
  assert.equal(calls.updateScrapbookJournal[0][1], JOURNAL_ID)
  assert.equal(calls.updateScrapbookJournal[0][2].title, 'Updated Title')
})

test('update handler rejects empty body', async () => {
  const { service, calls } = createService()
  const controller = createScrapbookJournalController({
    scrapbookJournalService: service,
  })
  const { next, getError } = createNext()

  const req = {
    auth: { userId: USER_ID },
    params: { journalId: JOURNAL_ID },
    body: {},
  }
  const res = createResponse()

  controller.update(req, res, next)
  await flushHandler()

  const error = getError()
  assert.ok(error, 'next should be called with a validation error')
  assert.equal(calls.updateScrapbookJournal.length, 0)
})

test('setVisibility handler changes isPublic', async () => {
  const { service, calls } = createService()
  const controller = createScrapbookJournalController({
    scrapbookJournalService: service,
  })
  const { next, getError } = createNext()

  const req = {
    auth: { userId: USER_ID },
    params: { journalId: JOURNAL_ID },
    body: { isPublic: true },
  }
  const res = createResponse()

  controller.setVisibility(req, res, next)
  await flushHandler()

  assert.equal(getError(), null)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.data.journal.isPublic, true)
  assert.equal(calls.setJournalVisibility.length, 1)
  assert.equal(calls.setJournalVisibility[0][0], USER_ID)
  assert.equal(calls.setJournalVisibility[0][1], JOURNAL_ID)
  assert.equal(calls.setJournalVisibility[0][2], true)
})

test('linkTrip handler links a trip', async () => {
  const { service, calls } = createService()
  const controller = createScrapbookJournalController({
    scrapbookJournalService: service,
  })
  const { next, getError } = createNext()

  const req = {
    auth: { userId: USER_ID },
    params: { journalId: JOURNAL_ID },
    body: { tripId: TRIP_ID },
  }
  const res = createResponse()

  controller.linkTrip(req, res, next)
  await flushHandler()

  assert.equal(getError(), null)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.data.journal.tripId, TRIP_ID)
  assert.equal(calls.linkTrip.length, 1)
  assert.equal(calls.linkTrip[0][0], USER_ID)
  assert.equal(calls.linkTrip[0][1], JOURNAL_ID)
  assert.equal(calls.linkTrip[0][2], TRIP_ID)
})

test('unlinkTrip handler removes trip association', async () => {
  const { service, calls } = createService()
  const controller = createScrapbookJournalController({
    scrapbookJournalService: service,
  })
  const { next, getError } = createNext()

  const req = {
    auth: { userId: USER_ID },
    params: { journalId: JOURNAL_ID },
  }
  const res = createResponse()

  controller.unlinkTrip(req, res, next)
  await flushHandler()

  assert.equal(getError(), null)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.data.journal.tripId, null)
  assert.equal(calls.unlinkTrip.length, 1)
  assert.equal(calls.unlinkTrip[0][0], USER_ID)
  assert.equal(calls.unlinkTrip[0][1], JOURNAL_ID)
})

test('delete handler returns 204', async () => {
  const { service, calls } = createService()
  const controller = createScrapbookJournalController({
    scrapbookJournalService: service,
  })
  const { next, getError } = createNext()

  const req = {
    auth: { userId: USER_ID },
    params: { journalId: JOURNAL_ID },
  }
  const res = createResponse()

  controller.delete(req, res, next)
  await flushHandler()

  assert.equal(getError(), null)
  assert.equal(res.statusCode, 204)
  assert.equal(res.headers['Cache-Control'], 'no-store')
  assert.equal(calls.deleteScrapbookJournal.length, 1)
  assert.equal(calls.deleteScrapbookJournal[0][0], USER_ID)
  assert.equal(calls.deleteScrapbookJournal[0][1], JOURNAL_ID)
})

test('delete handler propagates not found error', async () => {
  const { service } = createService({
    deleteScrapbookJournal: async () => {
      throw new ScrapbookNotFoundError()
    },
  })
  const controller = createScrapbookJournalController({
    scrapbookJournalService: service,
  })
  const { next, getError } = createNext()

  const req = {
    auth: { userId: USER_ID },
    params: { journalId: JOURNAL_ID },
  }
  const res = createResponse()

  controller.delete(req, res, next)
  await flushHandler()

  const error = getError()
  assert.ok(error instanceof ScrapbookNotFoundError)
})
