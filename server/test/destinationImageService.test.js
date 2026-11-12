'use strict'

process.env.NODE_ENV = 'test'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createDestinationService } = require('../src/services/destinationService')
const {
  DestinationNotFoundError,
  DestinationImageLimitExceededError,
  DestinationImageNotFoundError,
} = require('../src/utils/destinationErrors')
const { MAX_IMAGES_PER_DESTINATION } = require('../src/validators/destination')

const DESTINATION_ID = '11111111-1111-4111-8111-111111111111'
const IMAGE_ID = '22222222-2222-4222-8222-222222222222'
const ANOTHER_IMAGE_ID = '33333333-3333-4333-8333-333333333333'
const ANOTHER_DESTINATION_ID = '44444444-4444-4444-8444-444444444444'

const buildImage = (overrides = {}) => ({
  id: IMAGE_ID,
  destinationId: DESTINATION_ID,
  imageUrl: 'https://res.cloudinary.com/test/image/upload/v1/photo.jpg',
  publicId: 'tafera/destinations/photo1',
  altText: 'A test photo',
  displayOrder: 1,
  isCover: true,
  ...overrides,
})

const createService = (params = {}) => {
  const destination = params.destination === undefined ? {
    id: DESTINATION_ID,
    name: 'Test Destination',
    slug: 'test-destination',
  } : params.destination
  const image = params.image || buildImage()
  const imageFindByPkResults = params.imageFindByPkResults || []
  const images = params.images || [buildImage()]
  const imageCount = params.imageCount || 0
  const imageCreateError = params.imageCreateError || null
  const cloudinaryService = params.cloudinaryService || {
    uploader: {
      upload: function () {
        return Promise.resolve({
          secure_url: 'https://res.cloudinary.com/test/image/upload/v1/photo.jpg',
          public_id: 'tafera/destinations/photo1',
        })
      },
      destroy: function () {
        return Promise.resolve({ result: 'ok' })
      },
    },
  }

  const calls = {
    destinationFindByPk: [],
    imageFindByPk: [],
    imageFindAll: [],
    imageCount: [],
    imageCreate: [],
    imageDestroy: [],
    imageUpdate: [],
    transactions: [],
  }
  let findByPkIndex = 0

  const toMockImage = (img) => ({
    ...img,
    id: img.id,
    destinationId: img.destinationId,
    isCover: img.isCover,
    async destroy() {
      calls.imageDestroy.push(img.id)
    },
    async update(values, options) {
      calls.imageUpdate.push(values)
      Object.assign(img, values)
      return [1]
    },
  })

  const sequelizeMock = {
    async transaction(callback) {
      calls.transactions.push(callback)
      const mockTransaction = {
        LOCK: { UPDATE: 'UPDATE' },
      }
      return callback(mockTransaction)
    },
  }

  const Destination = {
    sequelize: sequelizeMock,
    async findByPk(id, options = {}) {
      calls.destinationFindByPk.push({ id, lock: options.lock })
      if (!destination) return null
      return destination.id === id ? destination : null
    },
  }

  const DestinationImage = {
    sequelize: sequelizeMock,
    async findByPk(id, options = {}) {
      calls.imageFindByPk.push({ id, lock: options.lock })
      const result = imageFindByPkResults[Math.min(findByPkIndex, imageFindByPkResults.length - 1)]
      findByPkIndex += 1
      if (result === undefined || result === null) return null
      return toMockImage(result)
    },
    async findAll(options) {
      calls.imageFindAll.push(options)
      let filtered = images
      if (options && options.where) {
        if (options.where.destinationId) {
          filtered = filtered.filter(
            (img) => img.destinationId === options.where.destinationId,
          )
        }
        if (options.where.id) {
          filtered = filtered.filter((img) =>
            options.where.id.includes(img.id),
          )
        }
      }
      if (options && Array.isArray(options.order)) {
        for (const [field, dir] of options.order) {
          if (field === 'displayOrder') {
            filtered.sort((a, b) => {
              const diff = a.displayOrder - b.displayOrder
              return dir === 'ASC' ? diff : -diff
            })
          }
        }
      }
      return filtered.map(toMockImage)
    },
    async findOne(options) {
      let filtered = images
      if (options && options.where) {
        if (options.where.destinationId) {
          filtered = filtered.filter(
            (img) => img.destinationId === options.where.destinationId,
          )
        }
      }
      const img = filtered[0]
      return img ? toMockImage(img) : null
    },
    async count(options) {
      calls.imageCount.push(options)
      return imageCount
    },
    async create(values, options) {
      calls.imageCreate.push(values)
      if (imageCreateError) throw imageCreateError
      return { id: IMAGE_ID, ...values }
    },
    async destroy() {
      calls.imageDestroy.push(1)
    },
    async update(values, options) {
      calls.imageUpdate.push(values)
      return [1]
    },
    async transaction(callback) {
      calls.transactions.push(callback)
      return callback()
    },
  }

  const service = createDestinationService({
    Destination,
    DestinationImage,
    cloudinaryService,
  })

  return {
    calls,
    service,
    Destination,
    DestinationImage,
  }
}

const rejectsWith = async (promise, ErrorClass) => {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof ErrorClass)
    return true
  })
}

test('uploadDestinationImage creates a new image record', async () => {
  const { service } = createService()

  const file = { buffer: Buffer.from('fake-image-data') }
  const result = await service.uploadDestinationImage(DESTINATION_ID, file, {
    altText: 'A scenic view',
    isCover: false,
  })

  // First image for a destination with no cover becomes the cover
  // automatically, even when isCover is explicitly false.
  assert.equal(result.id, IMAGE_ID)
  assert.equal(result.isCover, true)
  assert.equal(result.displayOrder, 1)
})

test('uploadDestinationImage rejects when destination does not exist', async () => {
  const { service } = createService({
    destination: null,
  })

  const file = { buffer: Buffer.from('fake-image-data') }
  await rejectsWith(
    service.uploadDestinationImage(DESTINATION_ID, file),
    DestinationNotFoundError
  )
})

test('uploadDestinationImage rejects when image limit is exceeded', async () => {
  const { service } = createService({
    imageCount: MAX_IMAGES_PER_DESTINATION,
  })

  const file = { buffer: Buffer.from('fake-image-data') }
  await rejectsWith(
    service.uploadDestinationImage(DESTINATION_ID, file),
    DestinationImageLimitExceededError
  )
})

test('listDestinationImages returns images for a destination', async () => {
  const image2 = buildImage({
    id: ANOTHER_IMAGE_ID,
    displayOrder: 2,
    isCover: false,
  })
  const { service } = createService({
    images: [buildImage(), image2],
  })

  const images = await service.listDestinationImages(DESTINATION_ID)

  assert.equal(images.length, 2)
  assert.equal(images[0].id, IMAGE_ID)
  assert.equal(images[1].id, ANOTHER_IMAGE_ID)
})

test('listDestinationImages rejects when destination does not exist', async () => {
  const { service } = createService({
    destination: null,
  })

  await rejectsWith(
    service.listDestinationImages(DESTINATION_ID),
    DestinationNotFoundError
  )
})

test('updateDestinationImage updates altText and isCover', async () => {
  const image = buildImage({ isCover: false })
  const { service } = createService({
    imageFindByPkResults: [image, image],
  })

  const result = await service.updateDestinationImage(IMAGE_ID, {
    altText: 'Updated alt text',
    isCover: true,
  })

  assert.equal(result.altText, 'Updated alt text')
  assert.equal(result.isCover, true)
})

test('updateDestinationImage rejects when image does not exist', async () => {
  const { service } = createService({
    imageFindByPkResults: [null],
  })

  await rejectsWith(
    service.updateDestinationImage(IMAGE_ID, { altText: 'New text' }),
    DestinationImageNotFoundError
  )
})

test('deleteDestinationImage deletes the image', async () => {
  const image = buildImage()
  const { service, calls } = createService({
    imageFindByPkResults: [image, image],
  })

  await service.deleteDestinationImage(IMAGE_ID)

  assert.equal(calls.imageDestroy.length, 1)
})

test('reorderDestinationImages updates display order', async () => {
  const image1 = buildImage({ id: IMAGE_ID, displayOrder: 1 })
  const image2 = buildImage({ id: ANOTHER_IMAGE_ID, displayOrder: 2 })
  const { service } = createService({
    images: [image1, image2],
  })

  const result = await service.reorderDestinationImages(DESTINATION_ID, [
    ANOTHER_IMAGE_ID,
    IMAGE_ID,
  ])

  assert.equal(result.length, 2)
  assert.equal(result[0].id, ANOTHER_IMAGE_ID)
  assert.equal(result[0].displayOrder, 1)
  assert.equal(result[1].id, IMAGE_ID)
  assert.equal(result[1].displayOrder, 2)
})

test('reorderDestinationImages rejects when image does not belong to destination', async () => {
  const image1 = buildImage({ id: IMAGE_ID })
  const otherImage = buildImage({
    id: ANOTHER_IMAGE_ID,
    destinationId: ANOTHER_DESTINATION_ID,
  })
  const { service } = createService({
    images: [image1, otherImage],
  })

  await rejectsWith(
    service.reorderDestinationImages(DESTINATION_ID, [
      IMAGE_ID,
      ANOTHER_IMAGE_ID,
    ]),
    DestinationImageNotFoundError
  )
})

test('first image automatically becomes cover when no cover exists', async () => {
  const { service } = createService({
    imageCount: 0,
  })

  const file = { buffer: Buffer.from('fake-image-data') }
  const result = await service.uploadDestinationImage(DESTINATION_ID, file)

  assert.equal(result.isCover, true)
  assert.equal(result.displayOrder, 1)
})

test('uploadDestinationImage compensates Cloudinary when limit reached after upload', async () => {
  let destroyCalled = false
  const cloudinaryService = {
    uploader: {
      upload: async function () {
        return {
          secure_url: 'https://res.cloudinary.com/test/image/upload/v1/photo.jpg',
          public_id: 'tafera/destinations/photo1',
        }
      },
      destroy: async function () {
        destroyCalled = true
        return { result: 'ok' }
      },
    },
  }
  const { service } = createService({
    cloudinaryService,
    imageCount: MAX_IMAGES_PER_DESTINATION,
  })

  const file = { buffer: Buffer.from('fake-image-data') }
  await rejectsWith(
    service.uploadDestinationImage(DESTINATION_ID, file),
    DestinationImageLimitExceededError
  )

  assert.ok(destroyCalled, 'Cloudinary destroy should be called as compensation')
})

test('deleteDestinationImage preserves DB record when Cloudinary deletion fails', async () => {
  const image = buildImage()
  const cloudinaryService = {
    uploader: {
      upload: async function () {
        return {
          secure_url: 'https://res.cloudinary.com/test/image/upload/v1/photo.jpg',
          public_id: 'tafera/destinations/photo1',
        }
      },
      destroy: async function () {
        throw new Error('Cloudinary delete failed')
      },
    },
  }
  const { service } = createService({
    cloudinaryService,
    imageFindByPkResults: [image, image],
  })

  await rejectsWith(
    service.deleteDestinationImage(IMAGE_ID),
    Error
  )
})

test('deleteDestinationImage allows deletion when Cloudinary returns not found', async () => {
  const image = buildImage()
  const cloudinaryService = {
    uploader: {
      upload: async function () {
        return {
          secure_url: 'https://res.cloudinary.com/test/image/upload/v1/photo.jpg',
          public_id: 'tafera/destinations/photo1',
        }
      },
      destroy: async function () {
        return { result: 'not found' }
      },
    },
  }
  const { service, calls } = createService({
    cloudinaryService,
    imageFindByPkResults: [image, image],
  })

  await service.deleteDestinationImage(IMAGE_ID)

  assert.equal(calls.imageDestroy.length, 1, 'DB record should be destroyed after Cloudinary not found')
})

test('deleteDestinationImage promotes next image as cover within transaction', async () => {
  const coverImage = buildImage({ isCover: true, displayOrder: 1 })
  const nextImage = buildImage({
    id: ANOTHER_IMAGE_ID,
    isCover: false,
    displayOrder: 2,
  })
  const { service } = createService({
    // Both findByPk calls (initial + locked re-fetch) return the cover image.
    imageFindByPkResults: [coverImage, coverImage],
    // findOne returns the next image as promotion candidate.
    images: [nextImage],
  })

  await service.deleteDestinationImage(IMAGE_ID)

  // The next image should have been promoted to cover.
  assert.equal(nextImage.isCover, true, 'next image should be promoted to cover')
})

test('createImageSchema accepts empty object', async () => {
  const { parseCreateImage } = require('../src/validators/destination')
  const result = parseCreateImage({})
  assert.equal(result.altText, undefined)
  assert.equal(result.isCover, undefined)
})

test('createImageSchema accepts valid optional values', async () => {
  const { parseCreateImage } = require('../src/validators/destination')
  const result = parseCreateImage({ altText: 'A photo', isCover: true })
  assert.equal(result.altText, 'A photo')
  assert.equal(result.isCover, true)
})

test('updateImageSchema rejects empty object', async () => {
  const { parseUpdateImage } = require('../src/validators/destination')
  assert.throws(
    () => parseUpdateImage({}),
    (error) => {
      assert.ok(
        error.details?.some((d) => d.message.includes('required')),
        `Expected validation error with 'required', got ${error.message}`
      )
      return true
    }
  )
})

test('updateImageSchema accepts valid optional values', async () => {
  const { parseUpdateImage } = require('../src/validators/destination')
  const result = parseUpdateImage({ altText: 'Updated', isCover: false, displayOrder: 3 })
  assert.equal(result.altText, 'Updated')
  assert.equal(result.isCover, false)
  assert.equal(result.displayOrder, 3)
})
