'use strict'

process.env.NODE_ENV = 'test'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  createScrapbookImageController,
} = require('../src/controllers/scrapbookImageController')
const {
  ScrapbookNotFoundError,
  ScrapbookImageNotFoundError,
  ScrapbookImageLimitExceededError,
} = require('../src/utils/scrapbookErrors')
const { CloudinaryUploadError } = require('../src/utils/destinationErrors')

const JOURNAL_ID = '11111111-1111-4111-8111-111111111111'
const IMAGE_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'

// Helper to wait for the async handler to complete (asyncHandler does not
// return a promise, as it is designed for Express usage).
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
    addScrapbookImage: async (userId, journalId, file, input) => ({
      id: IMAGE_ID,
      journalId,
      imageUrl: 'https://res.cloudinary.com/test/image/upload/v1/photo.jpg',
      altText: input.altText || null,
      caption: input.caption || null,
      takenAt: input.takenAt || null,
      isCover: input.isCover === true,
      displayOrder: 1,
    }),
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
    updateScrapbookImage: async (userId, imageId, input) => ({
      id: imageId,
      imageUrl: 'https://res.cloudinary.com/test/image/upload/v1/photo.jpg',
      altText: input.altText || 'A test photo',
      caption: input.caption || null,
      takenAt: input.takenAt || null,
      displayOrder: input.displayOrder || 1,
      isCover: input.isCover === true,
    }),
    deleteScrapbookImage: async () => {},
    reorderScrapbookImages: async (userId, journalId, imageIds) =>
      imageIds.map((id, index) => ({
        id,
        journalId,
        imageUrl: 'https://res.cloudinary.com/test/image/upload/v1/photo.jpg',
        altText: null,
        caption: null,
        takenAt: null,
        displayOrder: index + 1,
        isCover: index === 0,
      })),
  }

  const service = { ...defaults, ...overrides }
  const calls = {
    addScrapbookImage: [],
    listScrapbookImages: [],
    updateScrapbookImage: [],
    deleteScrapbookImage: [],
    reorderScrapbookImages: [],
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

test('upload handler returns created image', async () => {
  const { service, calls } = createService()
  const controller = createScrapbookImageController({
    scrapbookImageService: service,
  })
  const { next, getError } = createNext()

  const req = {
    auth: { userId: USER_ID },
    params: { journalId: JOURNAL_ID },
    body: { altText: 'A scenic view', isCover: false },
    file: {
      buffer: Buffer.from('fake-image-data'),
      mimetype: 'image/jpeg',
      size: 100,
    },
  }
  const res = createResponse()

  controller.upload(req, res, next)
  await flushHandler()

  assert.equal(getError(), null)
  assert.equal(res.statusCode, 201)
  assert.equal(res.headers['Cache-Control'], 'no-store')
  assert.equal(res.body.data.image.id, IMAGE_ID)
  assert.equal(res.body.data.image.isCover, false)
  assert.equal(calls.addScrapbookImage.length, 1)
  assert.equal(calls.addScrapbookImage[0][0], USER_ID)
  assert.equal(calls.addScrapbookImage[0][1], JOURNAL_ID)
})

test('upload handler passes file, metadata and userId to service', async () => {
  const { service, calls } = createService()
  const controller = createScrapbookImageController({
    scrapbookImageService: service,
  })
  const { next, getError } = createNext()

  const file = { buffer: Buffer.from('fake-image-data'), mimetype: 'image/png' }
  const req = {
    auth: { userId: USER_ID },
    params: { journalId: JOURNAL_ID },
    body: { altText: 'Alt text', caption: 'A caption', isCover: true },
    file,
  }
  const res = createResponse()

  controller.upload(req, res, next)
  await flushHandler()

  assert.equal(getError(), null)
  assert.equal(calls.addScrapbookImage[0][0], USER_ID)
  assert.equal(calls.addScrapbookImage[0][1], JOURNAL_ID)
  assert.equal(calls.addScrapbookImage[0][2], file)
  assert.equal(calls.addScrapbookImage[0][3].altText, 'Alt text')
  assert.equal(calls.addScrapbookImage[0][3].caption, 'A caption')
  assert.equal(calls.addScrapbookImage[0][3].isCover, true)
})

test('upload handler does not accept client-supplied userId', async () => {
  const { service, calls } = createService()
  const controller = createScrapbookImageController({
    scrapbookImageService: service,
  })
  const { next, getError } = createNext()

  const req = {
    auth: { userId: USER_ID },
    params: { journalId: JOURNAL_ID },
    body: { altText: 'Alt text', userId: '99999999-9999-4999-8999-999999999999' },
    file: { buffer: Buffer.from('fake'), mimetype: 'image/jpeg' },
  }
  const res = createResponse()

  controller.upload(req, res, next)
  await flushHandler()

  assert.equal(getError(), null)
  // The service must receive the authenticated userId, not the body value.
  assert.equal(calls.addScrapbookImage[0][0], USER_ID)
  assert.notEqual(calls.addScrapbookImage[0][0], req.body.userId)
})

test('list handler returns images for a journal', async () => {
  const { service, calls } = createService()
  const controller = createScrapbookImageController({
    scrapbookImageService: service,
  })
  const { next, getError } = createNext()

  const req = {
    auth: { userId: USER_ID },
    params: { journalId: JOURNAL_ID },
  }
  const res = createResponse()

  controller.list(req, res, next)
  await flushHandler()

  assert.equal(getError(), null)
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['Cache-Control'], 'no-store')
  assert.equal(res.body.data.images.length, 1)
  assert.equal(res.body.data.images[0].id, IMAGE_ID)
  assert.equal(res.body.data.images[0].publicId, undefined)
  assert.equal(calls.listScrapbookImages[0][0], USER_ID)
  assert.equal(calls.listScrapbookImages[0][1], JOURNAL_ID)
})

test('update handler updates image metadata', async () => {
  const { service, calls } = createService()
  const controller = createScrapbookImageController({
    scrapbookImageService: service,
  })
  const { next, getError } = createNext()

  const req = {
    auth: { userId: USER_ID },
    params: { journalId: JOURNAL_ID, imageId: IMAGE_ID },
    body: { altText: 'Updated alt', caption: 'Updated caption', isCover: true },
  }
  const res = createResponse()

  controller.update(req, res, next)
  await flushHandler()

  assert.equal(getError(), null)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.data.image.id, IMAGE_ID)
  assert.equal(res.body.data.image.altText, 'Updated alt')
  assert.equal(res.body.data.image.caption, 'Updated caption')
  assert.equal(res.body.data.image.isCover, true)
  assert.equal(calls.updateScrapbookImage[0][0], USER_ID)
  assert.equal(calls.updateScrapbookImage[0][1], IMAGE_ID)
  assert.equal(calls.updateScrapbookImage[0][2].altText, 'Updated alt')
  assert.equal(calls.updateScrapbookImage[0][2].caption, 'Updated caption')
  assert.equal(calls.updateScrapbookImage[0][2].isCover, true)
})

test('update handler rejects empty body via next', async () => {
  const { service, calls } = createService()
  const controller = createScrapbookImageController({
    scrapbookImageService: service,
  })
  const { next, getError } = createNext()

  const req = {
    auth: { userId: USER_ID },
    params: { journalId: JOURNAL_ID, imageId: IMAGE_ID },
    body: {},
  }
  const res = createResponse()

  controller.update(req, res, next)
  await flushHandler()

  const error = getError()
  assert.ok(error, 'next should be called with a validation error')
  assert.equal(calls.updateScrapbookImage.length, 0)
})

test('delete handler returns 204', async () => {
  const { service, calls } = createService()
  const controller = createScrapbookImageController({
    scrapbookImageService: service,
  })
  const { next, getError } = createNext()

  const req = {
    auth: { userId: USER_ID },
    params: { journalId: JOURNAL_ID, imageId: IMAGE_ID },
  }
  const res = createResponse()

  controller.delete(req, res, next)
  await flushHandler()

  assert.equal(getError(), null)
  assert.equal(res.statusCode, 204)
  assert.equal(res.headers['Cache-Control'], 'no-store')
  assert.equal(calls.deleteScrapbookImage[0][0], USER_ID)
  assert.equal(calls.deleteScrapbookImage[0][1], IMAGE_ID)
})

test('reorder handler returns reordered images', async () => {
  const { service, calls } = createService()
  const controller = createScrapbookImageController({
    scrapbookImageService: service,
  })
  const { next, getError } = createNext()

  const req = {
    auth: { userId: USER_ID },
    params: { journalId: JOURNAL_ID },
    body: [IMAGE_ID, '33333333-3333-4333-8333-333333333333'],
  }
  const res = createResponse()

  controller.reorder(req, res, next)
  await flushHandler()

  assert.equal(getError(), null)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.data.images.length, 2)
  assert.equal(calls.reorderScrapbookImages[0][0], USER_ID)
  assert.equal(calls.reorderScrapbookImages[0][1], JOURNAL_ID)
  assert.deepEqual(calls.reorderScrapbookImages[0][2], [
    IMAGE_ID,
    '33333333-3333-4333-8333-333333333333',
  ])
})

test('upload handler propagates journal not found via next', async () => {
  const { service } = createService({
    addScrapbookImage: async () => {
      throw new ScrapbookNotFoundError()
    },
  })
  const controller = createScrapbookImageController({
    scrapbookImageService: service,
  })
  const { next, getError } = createNext()

  const req = {
    auth: { userId: USER_ID },
    params: { journalId: JOURNAL_ID },
    body: {},
    file: { buffer: Buffer.from('fake'), mimetype: 'image/jpeg' },
  }
  const res = createResponse()

  controller.upload(req, res, next)
  await flushHandler()

  const error = getError()
  assert.ok(error instanceof ScrapbookNotFoundError)
})

test('upload handler propagates image limit exceeded via next', async () => {
  const { service } = createService({
    addScrapbookImage: async () => {
      throw new ScrapbookImageLimitExceededError()
    },
  })
  const controller = createScrapbookImageController({
    scrapbookImageService: service,
  })
  const { next, getError } = createNext()

  const req = {
    auth: { userId: USER_ID },
    params: { journalId: JOURNAL_ID },
    body: {},
    file: { buffer: Buffer.from('fake'), mimetype: 'image/jpeg' },
  }
  const res = createResponse()

  controller.upload(req, res, next)
  await flushHandler()

  const error = getError()
  assert.ok(error instanceof ScrapbookImageLimitExceededError)
})

test('upload handler propagates Cloudinary upload error via next', async () => {
  const { service } = createService({
    addScrapbookImage: async () => {
      throw new CloudinaryUploadError()
    },
  })
  const controller = createScrapbookImageController({
    scrapbookImageService: service,
  })
  const { next, getError } = createNext()

  const req = {
    auth: { userId: USER_ID },
    params: { journalId: JOURNAL_ID },
    body: {},
    file: { buffer: Buffer.from('fake'), mimetype: 'image/jpeg' },
  }
  const res = createResponse()

  controller.upload(req, res, next)
  await flushHandler()

  const error = getError()
  assert.ok(error instanceof CloudinaryUploadError)
})

test('update handler propagates image not found via next', async () => {
  const { service } = createService({
    updateScrapbookImage: async () => {
      throw new ScrapbookImageNotFoundError()
    },
  })
  const controller = createScrapbookImageController({
    scrapbookImageService: service,
  })
  const { next, getError } = createNext()

  const req = {
    auth: { userId: USER_ID },
    params: { journalId: JOURNAL_ID, imageId: IMAGE_ID },
    body: { altText: 'New alt' },
  }
  const res = createResponse()

  controller.update(req, res, next)
  await flushHandler()

  const error = getError()
  assert.ok(error instanceof ScrapbookImageNotFoundError)
})

test('delete handler propagates image not found via next', async () => {
  const { service } = createService({
    deleteScrapbookImage: async () => {
      throw new ScrapbookImageNotFoundError()
    },
  })
  const controller = createScrapbookImageController({
    scrapbookImageService: service,
  })
  const { next, getError } = createNext()

  const req = {
    auth: { userId: USER_ID },
    params: { journalId: JOURNAL_ID, imageId: IMAGE_ID },
  }
  const res = createResponse()

  controller.delete(req, res, next)
  await flushHandler()

  const error = getError()
  assert.ok(error instanceof ScrapbookImageNotFoundError)
})
