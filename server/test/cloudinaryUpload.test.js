'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Writable } = require('node:stream')
const { uploadBuffer } = require('../src/utils/cloudinaryUpload')

test('uploadBuffer sends the in-memory file buffer through Cloudinary upload_stream', async () => {
  const file = Buffer.from('image-bytes')
  const received = []
  const options = { folder: 'tafera/test', resource_type: 'image' }
  const cloudinary = {
    uploader: {
      upload_stream(actualOptions, callback) {
        assert.deepEqual(actualOptions, options)
        return new Writable({
          write(chunk, _encoding, done) {
            received.push(chunk)
            done()
          },
          final(done) {
            callback(null, { secure_url: 'https://cdn.example/photo.jpg' })
            done()
          },
        })
      },
    },
  }

  const result = await uploadBuffer(cloudinary, file, options)
  assert.deepEqual(Buffer.concat(received), file)
  assert.equal(result.secure_url, 'https://cdn.example/photo.jpg')
})

test('uploadBuffer propagates Cloudinary stream failures', async () => {
  const cloudinary = {
    uploader: {
      upload_stream(_options, callback) {
        return new Writable({
          write(_chunk, _encoding, done) { done() },
          final(done) {
            callback(new Error('Cloudinary unavailable'))
            done()
          },
        })
      },
    },
  }

  await assert.rejects(uploadBuffer(cloudinary, Buffer.from('data')), /Cloudinary unavailable/)
})
