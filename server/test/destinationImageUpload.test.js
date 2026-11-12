'use strict'

process.env.NODE_ENV = 'test'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { destinationImageUpload, validateImageFile } = require('../src/middlewares/destinationImageUpload')
const {
  InvalidImageFileError,
} = require('../src/utils/destinationErrors')

const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0])
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const WEBP_HEADER = Buffer.from(
  [0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50],
)
const GIF_HEADER = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])

const makeFile = (buffer, mimetype, fieldname = 'image') => ({
  fieldname,
  originalname: 'test.jpg',
  encoding: '7bit',
  mimetype,
  size: buffer.length,
  buffer,
  destination: '',
  filename: 'test',
  path: '',
  stream: null,
})

const createReqResNext = (file = undefined, body = {}) => {
  const headers = {}
  const res = {
    headers,
    set(name, value) {
      headers[name] = value
      return res
    },
  }
  const req = {
    body,
    file,
    headers,
  }
  let nextError = null
  const next = (error) => {
    nextError = error
  }
  return { req, res, next, getNextError: () => nextError }
}

test('validateImageFile accepts valid JPEG buffer', () => {
  assert.doesNotThrow(() => validateImageFile(makeFile(JPEG_HEADER, 'image/jpeg')))
})

test('validateImageFile accepts valid PNG buffer', () => {
  assert.doesNotThrow(() => validateImageFile(makeFile(PNG_HEADER, 'image/png')))
})

test('validateImageFile accepts valid WebP buffer', () => {
  assert.doesNotThrow(() => validateImageFile(makeFile(WEBP_HEADER, 'image/webp')))
})

test('validateImageFile rejects wrong MIME type', () => {
  assert.throws(
    () => validateImageFile(makeFile(JPEG_HEADER, 'image/gif')),
    (error) => {
      assert.ok(error instanceof InvalidImageFileError)
      return true
    },
  )
})

test('validateImageFile rejects wrong magic bytes for JPEG', () => {
  assert.throws(
    () => validateImageFile(makeFile(PNG_HEADER, 'image/jpeg')),
    (error) => {
      assert.ok(error instanceof InvalidImageFileError)
      return true
    },
  )
})

test('validateImageFile rejects GIF magic bytes', () => {
  assert.throws(
    () => validateImageFile(makeFile(GIF_HEADER, 'image/gif')),
    (error) => {
      assert.ok(error instanceof InvalidImageFileError)
      return true
    },
  )
})

test('destinationImageUpload accepts a valid JPEG image', async () => {
  const { req, res, next, getNextError } = createReqResNext(
    makeFile(JPEG_HEADER, 'image/jpeg'),
  )

  await destinationImageUpload(req, res, next)

  assert.equal(getNextError(), undefined)
  assert.equal(req.file.buffer.length, JPEG_HEADER.length)
})

test('destinationImageUpload rejects missing file', async () => {
  const { req, res, next, getNextError } = createReqResNext(undefined)

  await destinationImageUpload(req, res, next)

  const error = getNextError()
  assert.ok(error instanceof InvalidImageFileError)
  assert.equal(error.status, 400)
  assert.equal(error.code, 'INVALID_IMAGE_FILE')
})

test('destinationImageUpload rejects unsupported MIME type', async () => {
  const { req, res, next, getNextError } = createReqResNext(
    makeFile(JPEG_HEADER, 'image/gif'),
  )

  await destinationImageUpload(req, res, next)

  const error = getNextError()
  assert.ok(error instanceof InvalidImageFileError)
})

test('destinationImageUpload rejects mismatched magic bytes', async () => {
  const { req, res, next, getNextError } = createReqResNext(
    makeFile(PNG_HEADER, 'image/jpeg'),
  )

  await destinationImageUpload(req, res, next)

  const error = getNextError()
  assert.ok(error instanceof InvalidImageFileError)
})
