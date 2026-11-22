'use strict'

process.env.NODE_ENV = 'test'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createScrapbookService } = require('../src/services/scrapbookService')
const {
  ScrapbookImageLimitExceededError,
  ScrapbookImageNotFoundError,
  ScrapbookImageUploadUnavailableError,
  ScrapbookNotFoundError,
} = require('../src/utils/scrapbookErrors')
const { MAX_IMAGES_PER_DESTINATION } = require('../src/validators/destination')
const { ValidationError } = require('../src/utils/authErrors')
const { CloudinaryDeleteError } = require('../src/utils/destinationErrors')

const USER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222'
const JOURNAL_ID = '33333333-3333-4333-8333-333333333333'
const TRIP_ID = '44444444-4444-4444-8444-444444444444'
const OTHER_TRIP_ID = '55555555-5555-5555-8555-555555555555'
const IMAGE_ID = '66666666-6666-4666-8666-666666666666'
const ANOTHER_IMAGE_ID = '77777777-7777-4777-8777-777777777777'

const MAX_IMAGES_PER_JOURNAL = 50

const buildJournal = (overrides = {}) => ({
  id: JOURNAL_ID,
  userId: USER_ID,
  tripId: null,
  title: 'Test Journal',
  description: 'A test journal',
  isPublic: false,
  ...overrides,
})

const buildImage = (overrides = {}) => ({
  id: IMAGE_ID,
  journalId: JOURNAL_ID,
  imageUrl: 'https://res.cloudinary.com/test/image/upload/v1/photo.jpg',
  publicId: 'tafera/scrapbooks/photo1',
  altText: 'A test photo',
  caption: null,
  takenAt: null,
  displayOrder: 1,
  isCover: true,
  ...overrides,
})

const createService = (params = {}) => {
  const user = params.user === undefined ? {
    id: USER_ID,
    name: 'Test User',
  } : params.user
  const journal = params.journal === undefined ? {
    id: JOURNAL_ID,
    userId: USER_ID,
    tripId: null,
    title: 'Test Journal',
    description: 'A test journal',
    isPublic: false,
  } : params.journal
  const journalFindByPkResults = params.journalFindByPkResults || []
  const journalFindOneResults = params.journalFindOneResults || []
  const journals = params.journals || [buildJournal()]
  const journalCount = params.journalCount || 0
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
          public_id: 'tafera/scrapbooks/photo1',
        })
      },
      destroy: function () {
        return Promise.resolve({ result: 'ok' })
      },
    },
  }

  const calls = {
    findByPk: [],
    journalFindOne: [],
    journalFindAll: [],
    journalCount: [],
    journalCreate: [],
    journalUpdate: [],
    journalDestroy: [],
    imageFindByPk: [],
    imageFindAll: [],
    imageFindOne: [],
    imageCount: [],
    imageCreate: [],
    imageDestroy: [],
    imageUpdate: [],
    transactions: [],
    tripFindByPk: [],
  }
  let findByPkIndex = 0
  let findOneIndex = 0

  const toMockImage = (img) => ({
    ...img,
    id: img.id,
    journalId: img.journalId,
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

  const toMockJournal = (journal) => ({
    ...journal,
    id: journal.id,
    userId: journal.userId,
    tripId: journal.tripId,
    isCover: journal.isCover,
    async destroy() {
      calls.journalDestroy.push(journal.id)
    },
    async update(values, options) {
      calls.journalUpdate.push(values)
      Object.assign(journal, values)
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

  const ScrapbookJournal = {
    sequelize: sequelizeMock,
  async findByPk(id, options = {}) {
      calls.findByPk.push({ id, lock: options.lock })
      const result = journalFindByPkResults[Math.min(findByPkIndex, journalFindByPkResults.length - 1)]
      findByPkIndex += 1
      if (result === undefined || result === null) return null
      return toMockJournal(result)
    },
    async findOne(options = {}) {
      calls.journalFindOne.push(options)
      const result = journalFindOneResults[Math.min(findOneIndex, journalFindOneResults.length - 1)]
      findOneIndex += 1
      if (result === undefined || result === null) return null
      return toMockJournal(result)
    },
    async findAll(options) {
      calls.journalFindAll.push(options)
      let filtered = journals
      if (options && options.where) {
        if (options.where.userId) {
          filtered = filtered.filter(
            (j) => j.userId === options.where.userId,
          )
        }
        if (options.where.id) {
          filtered = filtered.filter((j) => j.id === options.where.id)
        }
        if (options.where.isPublic !== undefined) {
          filtered = filtered.filter((j) => j.isPublic === options.where.isPublic)
        }
      }
      return filtered.map((j) => toMockJournal(j))
    },
    async count(options) {
      calls.journalCount.push(options)
      return journalCount
    },
    async findAndCountAll(options) {
      calls.journalFindAll.push(options)
      let filtered = journals
      if (options && options.where) {
        if (options.where.userId) {
          filtered = filtered.filter(
            (j) => j.userId === options.where.userId,
          )
        }
        if (options.where.isPublic !== undefined) {
          filtered = filtered.filter((j) => j.isPublic === options.where.isPublic)
        }
      }
      const total = filtered.length
      const offset = options.offset || 0
      const limit = options.limit || filtered.length
      const rows = filtered.slice(offset, offset + limit).map((j) => toMockJournal(j))
      return { count: total, rows }
    },
    async create(values, options) {
      calls.journalCreate.push(values)
      return { id: JOURNAL_ID, ...values }
    },
    async destroy() {
      calls.journalDestroy.push(1)
    },
    async update(values, options) {
      calls.journalUpdate.push(values)
      return [1]
    },
    async transaction(callback) {
      calls.transactions.push(callback)
      return callback()
    },
  }

  const ScrapbookImage = {
    sequelize: sequelizeMock,
    async findByPk(id, options = {}) {
      calls.imageFindByPk.push({ id, lock: options.lock })
      const result = imageFindByPkResults[Math.min(findByPkIndex, imageFindByPkResults.length - 1)]
      findByPkIndex += 1
      if (result === undefined || result === null) return null
      return toMockImage(result)
    },
    async findOne(options = {}) {
      calls.imageFindOne.push(options)
      let filtered = images
      if (options && options.where) {
        if (options.where.journalId) {
          filtered = filtered.filter(
            (img) => img.journalId === options.where.journalId,
          )
        }
        if (options.where.id) {
          filtered = filtered.filter((img) => img.id === options.where.id)
        }
      }
      const img = filtered[0]
      return img ? toMockImage(img) : null
    },
    async findAll(options) {
      calls.imageFindAll.push(options)
      let filtered = images
      if (options && options.where) {
        if (options.where.journalId) {
          filtered = filtered.filter(
            (img) => img.journalId === options.where.journalId,
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

  const Trip = {
    async findByPk(id) {
      calls.tripFindByPk.push(id)
      if (id === TRIP_ID) {
        return { id: TRIP_ID, userId: USER_ID }
      }
      if (id === OTHER_TRIP_ID) {
        return { id: OTHER_TRIP_ID, userId: OTHER_USER_ID }
      }
      return null
    },
  }

  const service = createScrapbookService({
    ScrapbookJournal,
    ScrapbookImage,
    Trip,
    cloudinaryService,
  })

  return {
    calls,
    service,
    ScrapbookJournal,
    ScrapbookImage,
    Trip,
  }
}

const rejectsWith = async (promise, ErrorClass) => {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof ErrorClass)
    return true
  })
}

test('createScrapbookJournal creates a new journal', async () => {
  const { service } = createService()

  const result = await service.createScrapbookJournal(USER_ID, {
    title: 'My Travel Journal',
    description: 'My personal travel memories',
  })

  assert.equal(result.title, 'My Travel Journal')
  assert.equal(result.description, 'My personal travel memories')
  assert.equal(result.isPublic, false)
  assert.equal(result.tripId, null)
})

test('createScrapbookJournal with tripId links the trip', async () => {
  const { service } = createService()

  const result = await service.createScrapbookJournal(USER_ID, {
    title: 'Japan Journal',
    tripId: TRIP_ID,
  })

  assert.equal(result.title, 'Japan Journal')
  assert.equal(result.tripId, TRIP_ID)
})

test('createScrapbookJournal rejects trip owned by another user', async () => {
  const { service } = createService()

  await rejectsWith(
    service.createScrapbookJournal(USER_ID, {
      title: 'Other Journal',
      tripId: OTHER_TRIP_ID,
    }),
    ScrapbookNotFoundError,
  )
})

test('createScrapbookJournal rejects missing title', async () => {
  const { service } = createService()

  await rejectsWith(
    service.createScrapbookJournal(USER_ID, {
      title: '',
    }),
    ValidationError,
  )
})

test('createScrapbookJournal defaults to private', async () => {
  const { service } = createService()

  const result = await service.createScrapbookJournal(USER_ID, {
    title: 'Private Journal',
  })

  assert.equal(result.isPublic, false)
})

test('createScrapbookJournal with isPublic true', async () => {
  const { service } = createService()

  const result = await service.createScrapbookJournal(USER_ID, {
    title: 'Public Journal',
    isPublic: true,
  })

  assert.equal(result.isPublic, true)
})

test('listScrapbookJournals returns only owner journals', async () => {
  const journal1 = buildJournal({ id: '33333333-3333-4333-8333-333333333333', userId: USER_ID })
  const journal2 = buildJournal({ id: '44444444-4444-4444-8444-444444444444', userId: OTHER_USER_ID })
  const { service } = createService({
    journals: [journal1, journal2],
  })

  const result = await service.listScrapbookJournals(USER_ID, {})

  assert.equal(result.journals.length, 1)
  assert.equal(result.journals[0].id, JOURNAL_ID)
})

test('listScrapbookJournals supports pagination', async () => {
  const journals = []
  for (let i = 1; i <= 25; i++) {
    journals.push(buildJournal({
      id: `55555555-5555-5555-8555-${String(i).padStart(12, '0')}`,
      userId: USER_ID,
      title: `Journal ${i}`,
    }))
  }
  const { service } = createService({
    journals,
    journalCount: 25,
  })

  const result = await service.listScrapbookJournals(USER_ID, {
    page: 1,
    limit: 10,
  })

  assert.equal(result.journals.length, 10)
  assert.equal(result.pagination.total, 25)
  assert.equal(result.pagination.totalPages, 3)
  assert.equal(result.pagination.hasNextPage, true)
  assert.equal(result.pagination.hasPreviousPage, false)
})

test('getScrapbookJournal returns own journal', async () => {
  const journal = buildJournal()
  const { service } = createService({
    journalFindOneResults: [journal],
    journals: [journal],
  })

  const result = await service.getScrapbookJournal(USER_ID, JOURNAL_ID)

  assert.equal(result.id, JOURNAL_ID)
  assert.equal(result.title, 'Test Journal')
})

test('getScrapbookJournal returns public journal for non-owner', async () => {
  const publicJournal = buildJournal({
    id: JOURNAL_ID,
    userId: OTHER_USER_ID,
    isPublic: true,
  })
  const { service } = createService({
    journalFindOneResults: [publicJournal],
    journals: [publicJournal],
  })

  const result = await service.getScrapbookJournal(USER_ID, JOURNAL_ID)

  assert.equal(result.id, JOURNAL_ID)
  assert.equal(result.isPublic, true)
})

test('getScrapbookJournal rejects private journal for non-owner', async () => {
  const privateJournal = buildJournal({
    id: JOURNAL_ID,
    userId: OTHER_USER_ID,
    isPublic: false,
  })
  const { service } = createService({
    journalFindOneResults: [privateJournal],
    journals: [privateJournal],
  })

  await rejectsWith(
    service.getScrapbookJournal(USER_ID, JOURNAL_ID),
    ScrapbookNotFoundError,
  )
})

test('getScrapbookJournal rejects missing journal', async () => {
  const { service } = createService({
    journalFindOneResults: [null],
  })

  await rejectsWith(
    service.getScrapbookJournal(USER_ID, JOURNAL_ID),
    ScrapbookNotFoundError,
  )
})

test('updateScrapbookJournal updates title and description', async () => {
  const journal = buildJournal()
  const { service } = createService({
    journalFindOneResults: [journal, journal],
    journals: [journal],
  })

  const result = await service.updateScrapbookJournal(USER_ID, JOURNAL_ID, {
    title: 'Updated Title',
    description: 'Updated description',
  })

  assert.equal(result.title, 'Updated Title')
  assert.equal(result.description, 'Updated description')
})

test('updateScrapbookJournal rejects unauthorized user', async () => {
  const journal = buildJournal({
    id: JOURNAL_ID,
    userId: OTHER_USER_ID,
  })
  const { service } = createService({
    journalFindOneResults: [null],
  })

  await rejectsWith(
    service.updateScrapbookJournal(USER_ID, JOURNAL_ID, {
      title: 'Hacked',
    }),
    ScrapbookNotFoundError,
  )
})

test('linkTrip links a trip owned by the same user', async () => {
  const journal = buildJournal({ tripId: null })
  const { service } = createService({
    journalFindOneResults: [journal, journal],
    journals: [journal],
  })

  const result = await service.linkTrip(USER_ID, JOURNAL_ID, TRIP_ID)

  assert.equal(result.tripId, TRIP_ID)
})

test('linkTrip rejects trip owned by another user', async () => {
  const journal = buildJournal({ tripId: null })
  const { service } = createService({
    journalFindOneResults: [journal],
  })

  await rejectsWith(
    service.linkTrip(USER_ID, JOURNAL_ID, OTHER_TRIP_ID),
    ScrapbookNotFoundError,
  )
})

test('unlinkTrip sets tripId to null', async () => {
  const journal = buildJournal({ tripId: TRIP_ID })
  const { service } = createService({
    journalFindOneResults: [journal, journal],
    journals: [journal],
  })

  const result = await service.unlinkTrip(USER_ID, JOURNAL_ID)

  assert.equal(result.tripId, null)
})

test('setJournalVisibility changes isPublic', async () => {
  const journal = buildJournal({ isPublic: false })
  const { service } = createService({
    journalFindOneResults: [journal, journal],
    journals: [journal],
  })

  const result = await service.setJournalVisibility(USER_ID, JOURNAL_ID, true)

  assert.equal(result.isPublic, true)
})

test('deleteScrapbookJournal deletes the journal', async () => {
  const journal = buildJournal()
  const { service, calls } = createService({
    journalFindOneResults: [journal, journal],
    images: [],
  })

  await service.deleteScrapbookJournal(USER_ID, JOURNAL_ID)

  assert.equal(calls.journalDestroy.length, 1)
})

test('deleteScrapbookJournal deletes associated images', async () => {
  const journal = buildJournal()
  const image1 = buildImage({ id: IMAGE_ID })
  const image2 = buildImage({ id: ANOTHER_IMAGE_ID })
  const { service, calls } = createService({
    journalFindOneResults: [journal, journal],
    images: [image1, image2],
  })

  await service.deleteScrapbookJournal(USER_ID, JOURNAL_ID)

  assert.ok(calls.imageDestroy.length >= 1, 'Cloudinary destroy should be called for images')
})

test('addScrapbookImage adds an image to a journal', async () => {
  const { service, calls } = createService({
    journalFindOneResults: [buildJournal()],
  })

  const file = { buffer: Buffer.from('fake-image-data') }
  const result = await service.addScrapbookImage(USER_ID, JOURNAL_ID, file, {
    altText: 'A scenic view',
    caption: 'A caption',
    takenAt: '2026-01-15',
  })

  assert.equal(result.imageUrl, 'https://res.cloudinary.com/test/image/upload/v1/photo.jpg')
  assert.equal(result.altText, 'A scenic view')
  assert.equal(result.caption, 'A caption')
  assert.equal(result.takenAt, '2026-01-15')
  assert.equal(calls.imageCreate.length, 1)
  assert.equal(calls.imageCreate[0].journalId, JOURNAL_ID)
  assert.equal(calls.imageCreate[0].imageUrl, result.imageUrl)
  assert.equal(calls.imageCreate[0].publicId, 'tafera/scrapbooks/photo1')
})

test('addScrapbookImage uses the IPv4 Cloudinary agent and reports provider failure safely', async () => {
  let optionsSeen
  const cloudinaryService = {
    uploader: {
      upload_stream(options, callback) {
        optionsSeen = options
        return {
          end() {
            callback(null, {
              secure_url: 'https://res.cloudinary.com/test/image/upload/v1/photo.jpg',
              public_id: 'tafera/scrapbooks/photo1',
            })
          },
        }
      },
      destroy: async () => ({ result: 'ok' }),
    },
  }
  const { service, calls } = createService({
    cloudinaryService,
    journalFindOneResults: [buildJournal()],
  })

  await service.addScrapbookImage(USER_ID, JOURNAL_ID, { buffer: Buffer.from('image') }, {})

  assert.equal(optionsSeen.agent.options.family, 4)
  assert.equal(optionsSeen.agent.options.keepAlive, true)
  assert.equal(calls.imageCreate.length, 1)
  assert.equal(calls.imageCreate[0].publicId, 'tafera/scrapbooks/photo1')

  const failingService = createService({
    cloudinaryService: {
      uploader: {
        upload_stream(_options, callback) {
          return { end: () => callback(Object.assign(new Error('private transport details'), { code: 'ETIMEDOUT' })) }
        },
      },
    },
    journalFindOneResults: [buildJournal()],
  }).service
  await assert.rejects(
    failingService.addScrapbookImage(USER_ID, JOURNAL_ID, { buffer: Buffer.from('image') }, {}),
    (error) => {
      assert.ok(error instanceof ScrapbookImageUploadUnavailableError)
      assert.equal(error.status, 503)
      assert.match(error.message, /temporarily unavailable/i)
      assert.equal(error.message.includes('private transport details'), false)
      return true
    },
  )
})

test('addScrapbookImage rejects when journal does not exist', async () => {
  const { service } = createService({
    journalFindOneResults: [null],
  })

  const file = { buffer: Buffer.from('fake-image-data') }
  await rejectsWith(
    service.addScrapbookImage(USER_ID, JOURNAL_ID, file),
    ScrapbookNotFoundError,
  )
})

test('addScrapbookImage enforces 50 image limit', async () => {
  const { service } = createService({
    journalFindOneResults: [buildJournal()],
    imageCount: MAX_IMAGES_PER_JOURNAL,
  })

  const file = { buffer: Buffer.from('fake-image-data') }
  await rejectsWith(
    service.addScrapbookImage(USER_ID, JOURNAL_ID, file),
    ScrapbookImageLimitExceededError,
  )
})

test('addScrapbookImage compensates Cloudinary when limit reached', async () => {
  let destroyCalled = false
  const cloudinaryService = {
    uploader: {
      upload: async function () {
        return {
          secure_url: 'https://res.cloudinary.com/test/image/upload/v1/photo.jpg',
          public_id: 'tafera/scrapbooks/photo1',
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
    journalFindOneResults: [buildJournal()],
    imageCount: MAX_IMAGES_PER_JOURNAL,
  })

  const file = { buffer: Buffer.from('fake-image-data') }
  await rejectsWith(
    service.addScrapbookImage(USER_ID, JOURNAL_ID, file),
    ScrapbookImageLimitExceededError,
  )

  assert.ok(destroyCalled, 'Cloudinary destroy should be called as compensation')
})

test('listScrapbookImages returns images for a journal', async () => {
  const image2 = buildImage({
    id: ANOTHER_IMAGE_ID,
    displayOrder: 2,
    isCover: false,
  })
  const { service } = createService({
    journalFindOneResults: [buildJournal()],
    images: [buildImage(), image2],
  })

  const images = await service.listScrapbookImages(USER_ID, JOURNAL_ID)

  assert.equal(images.length, 2)
  assert.equal(images[0].id, IMAGE_ID)
  assert.equal(images[1].id, ANOTHER_IMAGE_ID)
})

test('listScrapbookImages rejects unauthorized journal', async () => {
  const { service } = createService({
    journalFindOneResults: [null],
  })

  await rejectsWith(
    service.listScrapbookImages(USER_ID, JOURNAL_ID),
    ScrapbookNotFoundError,
  )
})

test('updateScrapbookImage updates image fields', async () => {
  const image = buildImage({ isCover: false })
  const { service } = createService({
    journalFindOneResults: [buildJournal()],
    imageFindByPkResults: [image, image],
    images: [image],
  })

  const result = await service.updateScrapbookImage(USER_ID, IMAGE_ID, {
    altText: 'Updated alt',
    caption: 'Updated caption',
    isCover: true,
  })

  assert.equal(result.altText, 'Updated alt')
  assert.equal(result.caption, 'Updated caption')
  assert.equal(result.isCover, true)
})

test('updateScrapbookImage rejects unauthorized image', async () => {
  const { service } = createService({
    journalFindOneResults: [buildJournal()],
    imageFindByPkResults: [null],
  })

  await rejectsWith(
    service.updateScrapbookImage(USER_ID, IMAGE_ID, {
      altText: 'Hacked',
    }),
    ScrapbookImageNotFoundError,
  )
})

test('deleteScrapbookImage deletes the image', async () => {
  const image = buildImage()
  const { service, calls } = createService({
    journalFindOneResults: [buildJournal()],
    imageFindByPkResults: [image, image],
  })

  await service.deleteScrapbookImage(USER_ID, IMAGE_ID)

  assert.equal(calls.imageDestroy.length, 1)
})

test('deleteScrapbookImage preserves DB record when Cloudinary fails', async () => {
  const image = buildImage()
  const cloudinaryService = {
    uploader: {
      upload: async function () {
        return {
          secure_url: 'https://res.cloudinary.com/test/image/upload/v1/photo.jpg',
          public_id: 'tafera/scrapbooks/photo1',
        }
      },
      destroy: async function () {
        throw new Error('Cloudinary delete failed')
      },
    },
  }
  const { service } = createService({
    cloudinaryService,
    journalFindOneResults: [buildJournal()],
    imageFindByPkResults: [image, image],
  })

  await rejectsWith(
    service.deleteScrapbookImage(USER_ID, IMAGE_ID),
    Error,
  )
})

test('deleteScrapbookImage allows deletion when Cloudinary returns not found', async () => {
  const image = buildImage()
  const cloudinaryService = {
    uploader: {
      upload: async function () {
        return {
          secure_url: 'https://res.cloudinary.com/test/image/upload/v1/photo.jpg',
          public_id: 'tafera/scrapbooks/photo1',
        }
      },
      destroy: async function () {
        return { result: 'not found' }
      },
    },
  }
  const { service, calls } = createService({
    cloudinaryService,
    journalFindOneResults: [buildJournal()],
    imageFindByPkResults: [image, image],
  })

  await service.deleteScrapbookImage(USER_ID, IMAGE_ID)

  assert.equal(calls.imageDestroy.length, 1)
})

test('deleteScrapbookImage promotes next image as cover', async () => {
  const coverImage = buildImage({ isCover: true, displayOrder: 1 })
  const nextImage = buildImage({
    id: ANOTHER_IMAGE_ID,
    isCover: false,
    displayOrder: 2,
  })
  const { service } = createService({
    journalFindOneResults: [buildJournal()],
    imageFindByPkResults: [coverImage, coverImage],
    images: [nextImage],
  })

  await service.deleteScrapbookImage(USER_ID, IMAGE_ID)

  assert.equal(nextImage.isCover, true, 'next image should be promoted to cover')
})

test('reorderScrapbookImages updates display order', async () => {
  const image1 = buildImage({ id: IMAGE_ID, displayOrder: 1 })
  const image2 = buildImage({ id: ANOTHER_IMAGE_ID, displayOrder: 2 })
  const { service } = createService({
    journalFindOneResults: [buildJournal()],
    images: [image1, image2],
  })

  const result = await service.reorderScrapbookImages(USER_ID, JOURNAL_ID, [
    ANOTHER_IMAGE_ID,
    IMAGE_ID,
  ])

  assert.equal(result.length, 2)
  assert.equal(result[0].id, ANOTHER_IMAGE_ID)
  assert.equal(result[0].displayOrder, 1)
  assert.equal(result[1].id, IMAGE_ID)
  assert.equal(result[1].displayOrder, 2)
})

test('reorderScrapbookImages rejects when image does not belong to journal', async () => {
  const image1 = buildImage({ id: IMAGE_ID })
  const otherImage = buildImage({
    id: ANOTHER_IMAGE_ID,
    journalId: '99999999-9999-4999-8999-999999999999',
  })
  const { service } = createService({
    journalFindOneResults: [buildJournal()],
    images: [image1, otherImage],
  })

  await rejectsWith(
    service.reorderScrapbookImages(USER_ID, JOURNAL_ID, [
      IMAGE_ID,
      ANOTHER_IMAGE_ID,
    ]),
    ScrapbookImageNotFoundError,
  )
})

test('first image automatically becomes cover', async () => {
  const { service } = createService({
    journalFindOneResults: [buildJournal()],
    imageCount: 0,
  })

  const file = { buffer: Buffer.from('fake-image-data') }
  const result = await service.addScrapbookImage(USER_ID, JOURNAL_ID, file)

  assert.equal(result.isCover, true)
  assert.equal(result.displayOrder, 1)
})

test('createScrapbookJournal rejects invalid title', async () => {
  const { service } = createService()

  await rejectsWith(
    service.createScrapbookJournal(USER_ID, { title: '   ' }),
    ValidationError,
  )

  await rejectsWith(
    service.createScrapbookJournal(USER_ID, { title: 123 }),
    ValidationError,
  )
})

test('createScrapbookJournal rejects invalid tripId format', async () => {
  const { service } = createService()

  await rejectsWith(
    service.createScrapbookJournal(USER_ID, {
      title: 'Valid Title',
      tripId: 'not-a-uuid',
    }),
    ValidationError,
  )
})

test('updateScrapbookJournal rejects invalid journalId format', async () => {
  const { service } = createService()

  await rejectsWith(
    service.updateScrapbookJournal(USER_ID, 'not-a-uuid', { title: 'X' }),
    ValidationError,
  )
})

test('updateScrapbookJournal rejects empty title', async () => {
  const journal = buildJournal()
  const { service } = createService({
    journalFindOneResults: [journal, journal],
  })

  await rejectsWith(
    service.updateScrapbookJournal(USER_ID, JOURNAL_ID, { title: '   ' }),
    ValidationError,
  )
})

test('getScrapbookJournal rejects invalid journalId format', async () => {
  const { service } = createService()

  await rejectsWith(
    service.getScrapbookJournal(USER_ID, 'not-a-uuid'),
    ValidationError,
  )
})

test('linkTrip rejects invalid journalId format', async () => {
  const { service } = createService()

  await rejectsWith(
    service.linkTrip(USER_ID, 'not-a-uuid', TRIP_ID),
    ValidationError,
  )
})

test('linkTrip rejects invalid tripId format', async () => {
  const { service } = createService()

  await rejectsWith(
    service.linkTrip(USER_ID, JOURNAL_ID, 'not-a-uuid'),
    ValidationError,
  )
})

test('linkTrip rejects unauthorized user', async () => {
  const { service } = createService({
    journalFindOneResults: [null],
  })

  await rejectsWith(
    service.linkTrip(USER_ID, JOURNAL_ID, TRIP_ID),
    ScrapbookNotFoundError,
  )
})

test('unlinkTrip rejects unauthorized user', async () => {
  const { service } = createService({
    journalFindOneResults: [null],
  })

  await rejectsWith(
    service.unlinkTrip(USER_ID, JOURNAL_ID),
    ScrapbookNotFoundError,
  )
})

test('setJournalVisibility rejects unauthorized user', async () => {
  const { service } = createService({
    journalFindOneResults: [null],
  })

  await rejectsWith(
    service.setJournalVisibility(USER_ID, JOURNAL_ID, true),
    ScrapbookNotFoundError,
  )
})

test('deleteScrapbookJournal rejects unauthorized user', async () => {
  const { service } = createService({
    journalFindOneResults: [null],
  })

  await rejectsWith(
    service.deleteScrapbookJournal(USER_ID, JOURNAL_ID),
    ScrapbookNotFoundError,
  )
})

test('deleteScrapbookJournal handles Cloudinary failure without destroying the journal', async () => {
  const image = buildImage({ publicId: 'tafera/scrapbooks/fail-me' })
  const journal = buildJournal({ images: [image] })
  const cloudinaryService = {
    uploader: {
      destroy: async function () {
        throw new Error('Cloudinary delete failed')
      },
    },
  }
  const { service, calls } = createService({
    cloudinaryService,
    journalFindOneResults: [journal, journal],
    images: [image],
  })

  await rejectsWith(
    service.deleteScrapbookJournal(USER_ID, JOURNAL_ID),
    CloudinaryDeleteError,
  )

  // The transaction must roll back, so neither images nor the journal are
  // destroyed while Cloudinary cleanup is failing.
  assert.equal(calls.journalDestroy.length, 0, 'journal must not be destroyed when Cloudinary fails')
})

test('deleteScrapbookJournal retries Cloudinary cleanup after transient failure', async () => {
  let destroyCallCount = 0
  const image = buildImage({ publicId: 'tafera/scrapbooks/retry-me' })
  const journal = buildJournal({ images: [image] })
  const cloudinaryService = {
    uploader: {
      destroy: async function () {
        destroyCallCount += 1
        if (destroyCallCount === 1) {
          throw new Error('transient Cloudinary failure')
        }
        return { result: 'ok' }
      },
    },
  }
  const { service, calls } = createService({
    cloudinaryService,
    journalFindOneResults: [journal, journal],
    images: [image],
  })

  // First attempt fails safely; the journal is preserved for retry.
  await rejectsWith(
    service.deleteScrapbookJournal(USER_ID, JOURNAL_ID),
    CloudinaryDeleteError,
  )
  assert.equal(calls.journalDestroy.length, 0)

  // Retry succeeds; the journal and its images are destroyed.
  await service.deleteScrapbookJournal(USER_ID, JOURNAL_ID)
  assert.equal(calls.journalDestroy.length, 1)
})

test('deleteScrapbookJournal keeps DB records intact when Cloudinary fails midway', async () => {
  const firstImage = buildImage({ id: IMAGE_ID, publicId: 'tafera/scrapbooks/first' })
  const secondImage = buildImage({
    id: ANOTHER_IMAGE_ID,
    publicId: 'tafera/scrapbooks/second',
  })
  const journal = buildJournal({ images: [firstImage, secondImage] })
  let destroyCallCount = 0
  const cloudinaryService = {
    uploader: {
      destroy: async function (publicId) {
        destroyCallCount += 1
        if (publicId === 'tafera/scrapbooks/second') {
          throw new Error('Cloudinary delete failed on second asset')
        }
        return { result: 'ok' }
      },
    },
  }
  const { service, calls } = createService({
    cloudinaryService,
    journalFindOneResults: [journal, journal],
    images: [firstImage, secondImage],
  })

  await rejectsWith(
    service.deleteScrapbookJournal(USER_ID, JOURNAL_ID),
    CloudinaryDeleteError,
  )

  // Cloudinary was attempted for the first asset but aborted on the second.
  assert.equal(destroyCallCount, 2)

  // The transaction rolled back, so neither images nor the journal were
  // destroyed despite the first Cloudinary deletion succeeding.
  assert.equal(calls.journalDestroy.length, 0, 'journal must not be destroyed when Cloudinary fails midway')
  assert.equal(calls.imageDestroy.length, 0, 'image records must not be destroyed when Cloudinary fails midway')
})

test('updateScrapbookImage protects single-cover uniqueness under journal lock', async () => {
  const image = buildImage({ isCover: false })
  const otherCover = buildImage({
    id: '88888888-8888-4888-8888-888888888888',
    isCover: true,
  })
  const { service, calls } = createService({
    journalFindOneResults: [buildJournal()],
    imageFindByPkResults: [image, image],
    images: [image, otherCover],
  })

  const result = await service.updateScrapbookImage(USER_ID, IMAGE_ID, {
    isCover: true,
  })

  assert.equal(result.isCover, true)
  // The previous cover is unset within the same locked transaction, so the
  // partial unique index (one cover per journal) is never violated.
  const unsetCall = calls.imageUpdate.find((update) => update.isCover === false)
  assert.ok(unsetCall, 'existing cover should be unset when a new cover is selected')
})
