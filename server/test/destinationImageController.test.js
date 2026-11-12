'use strict'

process.env.NODE_ENV = 'test'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  createDestinationImageController,
} = require('../src/controllers/destinationImageController')
const {
  DestinationNotFoundError,
  DestinationImageLimitExceededError,
  DestinationImageNotFoundError,
} = require('../src/utils/destinationErrors')

const DESTINATION_ID = '11111111-1111-4111-8111-111111111111'
const IMAGE_ID = '22222222-2222-4222-8222-222222222222'

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
    uploadDestinationImage: async (destinationId, file, input) => ({
      id: IMAGE_ID,
      destinationId,
      imageUrl: 'https://res.cloudinary.com/test/image/upload/v1/photo.jpg',
      altText: input.altText || null,
      isCover: input.isCover === true,
      displayOrder: 1,
    }),
    listDestinationImages: async (destinationId) => [
      {
        id: IMAGE_ID,
        destinationId,
        imageUrl: 'https://res.cloudinary.com/test/image/upload/v1/photo.jpg',
        altText: 'A test photo',
        displayOrder: 1,
        isCover: true,
      },
    ],
    updateDestinationImage: async (imageId, input) => ({
      id: imageId,
      imageUrl: 'https://res.cloudinary.com/test/image/upload/v1/photo.jpg',
      altText: input.altText || 'A test photo',
      displayOrder: input.displayOrder || 1,
      isCover: input.isCover === true,
    }),
    deleteDestinationImage: async () => {},
    reorderDestinationImages: async (destinationId, imageIds) =>
      imageIds.map((id, index) => ({
        id,
        destinationId,
        imageUrl: 'https://res.cloudinary.com/test/image/upload/v1/photo.jpg',
        altText: null,
        displayOrder: index + 1,
        isCover: index === 0,
      })),
  }

  const service = { ...defaults, ...overrides }
  const calls = {
    uploadDestinationImage: [],
    listDestinationImages: [],
    updateDestinationImage: [],
    deleteDestinationImage: [],
    reorderDestinationImages: [],
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
  const controller = createDestinationImageController({
    destinationImageService: service,
  })
  const { next, getError } = createNext()

  const req = {
    params: { destinationId: DESTINATION_ID },
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
  assert.equal(calls.uploadDestinationImage.length, 1)
  assert.equal(calls.uploadDestinationImage[0][0], DESTINATION_ID)
})

test('upload handler passes file and metadata to service', async () => {
  const { service, calls } = createService()
  const controller = createDestinationImageController({
    destinationImageService: service,
  })
  const { next, getError } = createNext()

  const file = { buffer: Buffer.from('fake-image-data'), mimetype: 'image/png' }
  const req = {
    params: { destinationId: DESTINATION_ID },
    body: { altText: 'Alt text', isCover: true },
    file,
  }
  const res = createResponse()

  controller.upload(req, res, next)
  await flushHandler()

  assert.equal(getError(), null)
  assert.equal(calls.uploadDestinationImage[0][0], DESTINATION_ID)
  assert.equal(calls.uploadDestinationImage[0][1], file)
  assert.equal(calls.uploadDestinationImage[0][2].altText, 'Alt text')
  assert.equal(calls.uploadDestinationImage[0][2].isCover, true)
})

test('list handler returns images for destination', async () => {
  const { service, calls } = createService()
  const controller = createDestinationImageController({
    destinationImageService: service,
  })
  const { next, getError } = createNext()

  const req = {
    params: { destinationId: DESTINATION_ID },
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
})

test('update handler updates image metadata', async () => {
  const { service, calls } = createService()
  const controller = createDestinationImageController({
    destinationImageService: service,
  })
  const { next, getError } = createNext()

  const req = {
    params: { destinationId: DESTINATION_ID, imageId: IMAGE_ID },
    body: { altText: 'Updated alt', isCover: true },
  }
  const res = createResponse()

  controller.update(req, res, next)
  await flushHandler()

  assert.equal(getError(), null)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.data.image.id, IMAGE_ID)
  assert.equal(res.body.data.image.altText, 'Updated alt')
  assert.equal(res.body.data.image.isCover, true)
  assert.equal(calls.updateDestinationImage[0][0], IMAGE_ID)
})

test('update handler rejects empty body via next', async () => {
  const { service, calls } = createService()
  const controller = createDestinationImageController({
    destinationImageService: service,
  })
  const { next, getError } = createNext()

  const req = {
    params: { destinationId: DESTINATION_ID, imageId: IMAGE_ID },
    body: {},
  }
  const res = createResponse()

  controller.update(req, res, next)
  await flushHandler()

  const error = getError()
  assert.ok(error, 'next should be called with a validation error')
  assert.equal(calls.updateDestinationImage.length, 0)
})

test('delete handler returns 204', async () => {
  const { service, calls } = createService()
  const controller = createDestinationImageController({
    destinationImageService: service,
  })
  const { next, getError } = createNext()

  const req = {
    params: { destinationId: DESTINATION_ID, imageId: IMAGE_ID },
  }
  const res = createResponse()

  controller.delete(req, res, next)
  await flushHandler()

  assert.equal(getError(), null)
  assert.equal(res.statusCode, 204)
  assert.equal(res.headers['Cache-Control'], 'no-store')
  assert.equal(calls.deleteDestinationImage[0][0], IMAGE_ID)
})

test('reorder handler returns reordered images', async () => {
  const { service, calls } = createService()
  const controller = createDestinationImageController({
    destinationImageService: service,
  })
  const { next, getError } = createNext()

  const req = {
    params: { destinationId: DESTINATION_ID },
    body: [IMAGE_ID, '33333333-3333-4333-8333-333333333333'],
  }
  const res = createResponse()

  controller.reorder(req, res, next)
  await flushHandler()

  assert.equal(getError(), null)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.data.images.length, 2)
  assert.equal(calls.reorderDestinationImages[0][0], DESTINATION_ID)
  assert.deepEqual(calls.reorderDestinationImages[0][1], [
    IMAGE_ID,
    '33333333-3333-4333-8333-333333333333',
  ])
})

test('upload handler propagates destination not found via next', async () => {
  const { service } = createService({
    uploadDestinationImage: async () => {
      throw new DestinationNotFoundError()
    },
  })
  const controller = createDestinationImageController({
    destinationImageService: service,
  })
  const { next, getError } = createNext()

  const req = {
    params: { destinationId: DESTINATION_ID },
    body: {},
    file: { buffer: Buffer.from('fake'), mimetype: 'image/jpeg' },
  }
  const res = createResponse()

  controller.upload(req, res, next)
  await flushHandler()

  const error = getError()
  assert.ok(error instanceof DestinationNotFoundError)
})

test('upload handler propagates image limit exceeded via next', async () => {
  const { service } = createService({
    uploadDestinationImage: async () => {
      throw new DestinationImageLimitExceededError()
    },
  })
  const controller = createDestinationImageController({
    destinationImageService: service,
  })
  const { next, getError } = createNext()

  const req = {
    params: { destinationId: DESTINATION_ID },
    body: {},
    file: { buffer: Buffer.from('fake'), mimetype: 'image/jpeg' },
  }
  const res = createResponse()

  controller.upload(req, res, next)
  await flushHandler()

  const error = getError()
  assert.ok(error instanceof DestinationImageLimitExceededError)
})

test('update handler propagates image not found via next', async () => {
  const { service } = createService({
    updateDestinationImage: async () => {
      throw new DestinationImageNotFoundError()
    },
  })
  const controller = createDestinationImageController({
    destinationImageService: service,
  })
  const { next, getError } = createNext()

  const req = {
    params: { destinationId: DESTINATION_ID, imageId: IMAGE_ID },
    body: { altText: 'New alt' },
  }
  const res = createResponse()

  controller.update(req, res, next)
  await flushHandler()

  const error = getError()
  assert.ok(error instanceof DestinationImageNotFoundError)
})
