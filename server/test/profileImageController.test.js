'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { createProfileController, safeCloudinaryErrorDetails } = require('../src/controllers/profileController')

test('profile image upload resolves the account by authenticated user ID if req.user is absent', async () => {
  const account = {
    id: 'account-42',
    fullName: 'Ada Lovelace',
    profileImage: null,
    profileImagePublicId: null,
    update: async function (input) { Object.assign(this, input) },
  }
  const lookups = []
  const updates = []
  let cloudinaryOptions
  const profileService = {
    getUserById: async (userId) => {
      lookups.push(userId)
      return account
    },
    updateOwnProfile: async (user, input) => {
      updates.push({ user, input })
      await user.update(input)
      return user
    },
  }
  const cloudinaryClient = {
    uploader: {
      upload_stream: (options, callback) => {
        cloudinaryOptions = options
        return {
          end: (buffer) => {
            assert.deepEqual(buffer, Buffer.from('image-data'))
            callback(null, {
              secure_url: 'https://res.cloudinary.com/test/profile.jpg',
              public_id: 'tafera/profiles/profile-42',
            })
          },
        }
      },
      destroy: async () => ({ result: 'ok' }),
    },
  }
  const controller = createProfileController({ profileService, commentService: {}, cloudinaryClient })
  let resolveResponse
  let responseReject
  const completed = new Promise((resolve, reject) => {
    resolveResponse = resolve
    responseReject = reject
  })
  const response = {
    set: () => response,
    status: (code) => { response.statusCode = code; return response },
    json: (payload) => { response.payload = payload; resolveResponse(); return response },
  }
  controller.uploadProfileImage({
    auth: { userId: 'account-42' },
    file: { buffer: Buffer.from('image-data') },
  }, response, (error) => responseReject(error))
  await completed

  assert.deepEqual(lookups, ['account-42'])
  assert.equal(updates[0].user, account)
  assert.deepEqual(updates[0].input, {
    profileImage: 'https://res.cloudinary.com/test/profile.jpg',
    profileImagePublicId: 'tafera/profiles/profile-42',
  })
  assert.equal(cloudinaryOptions.agent.options.family, 4)
  assert.equal(cloudinaryOptions.agent.options.keepAlive, true)
  assert.equal(response.statusCode, 200)
  assert.equal(response.payload.data.user.id, 'account-42')
  assert.equal(response.payload.data.user.profileImage, 'https://res.cloudinary.com/test/profile.jpg')
})

test('Cloudinary upload failures retain safe provider diagnostics without exposing credentials', () => {
  const details = safeCloudinaryErrorDetails({
    name: 'CloudinaryError',
    code: 'ECONNRESET',
    http_code: 502,
    message: 'Provider rejected request; api_secret=secret-value https://provider.test/debug',
  })

  assert.deepEqual(details, {
    providerCode: 'ECONNRESET',
    providerStatus: 502,
    providerMessage: 'Provider rejected request; api_secret=[redacted] [url]',
  })
  assert.equal(JSON.stringify(details).includes('secret-value'), false)
})

test('profile upload timeout returns a generic error and logs the safe provider timeout code', async () => {
  const account = { id: 'account-42', profileImagePublicId: null }
  const profileService = {
    updateOwnProfile: async () => assert.fail('must not persist a rejected upload'),
  }
  const cloudinaryClient = {
    uploader: {
      upload_stream: (_options, callback) => ({
        end: () => callback(Object.assign(new Error('provider unavailable'), {
          name: 'CloudinaryError', code: 'ETIMEDOUT',
        })),
      }),
    },
  }
  const controller = createProfileController({ profileService, commentService: {}, cloudinaryClient })
  const originalError = console.error
  let logged
  console.error = (line) => { logged = JSON.parse(line) }

  try {
    const error = await new Promise((resolve) => controller.uploadProfileImage({
      req: undefined,
      auth: { userId: account.id },
      user: account,
      file: { buffer: Buffer.from('image-data') },
    }, {}, resolve))

    assert.equal(error.code, 'CLOUDINARY_UPLOAD_ERROR')
    assert.equal(error.status, 500)
    assert.equal(logged.event, 'profile_image_upload_failed')
    assert.equal(logged.providerCode, 'ETIMEDOUT')
    assert.equal(logged.providerStatus, undefined)
    assert.equal(logged.providerMessage, 'provider unavailable')
  } finally {
    console.error = originalError
  }
})
