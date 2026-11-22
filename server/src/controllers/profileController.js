'use strict'

const https = require('node:https')
const { parseProfileUpdate, parseUserId } = require('../validators/profile')
const { toPublicUser } = require('../utils/safeUser')
const cloudinary = require('../config/cloudinary')
const { CloudinaryUploadError } = require('../utils/destinationErrors')
const { logSecurityEvent } = require('../utils/securityLog')
const { uploadBuffer } = require('../utils/cloudinaryUpload')
const env = require('../config/env')
// This runtime resolves Cloudinary to IPv4 and NAT64 IPv6 addresses, while its
// network cannot route IPv6 and Node's default address-family racing expires
// IPv4 attempts before they complete. Pin just this provider connection to v4.
const cloudinaryUploadAgent = new https.Agent({ family: 4, keepAlive: true })

const safeCloudinaryErrorDetails = (error) => {
  const redact = (value) => {
    let message = String(value || '').slice(0, 500)
    for (const secret of [env.CLOUDINARY?.apiSecret, env.CLOUDINARY?.apiKey, env.CLOUDINARY?.cloudName]) {
      if (secret) message = message.replaceAll(secret, '[redacted]')
    }
    return message
      .replace(/https?:\/\/\S+/gi, '[url]')
      .replace(/(api[_ -]?key|api[_ -]?secret|authorization|signature)\s*[:=]\s*\S+/gi, '$1=[redacted]')
      .replace(/[\r\n\t]/g, ' ')
      .slice(0, 240)
  }

  return {
    providerCode: redact(error?.code || error?.name || 'UNKNOWN'),
    ...(Number.isInteger(error?.http_code) ? { providerStatus: error.http_code } : {}),
    ...(error?.message ? { providerMessage: redact(error.message) } : {}),
  }
}

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next)
}

const noStore = (res) => res.set('Cache-Control', 'no-store')

const { parsePaginationQuery } = require('../validators/social')
const createProfileController = ({ profileService, commentService, cloudinaryClient = cloudinary }) => ({
  me: (req, res) => {
    noStore(res).status(200).json({
      data: { user: toPublicUser(req.user) },
    })
  },

  updateMe: asyncHandler(async (req, res) => {
    const input = parseProfileUpdate(req.body)
    const user = await profileService.updateOwnProfile(req.user, input)

    noStore(res).status(200).json({
      data: { user: toPublicUser(user) },
    })
  }),

  uploadProfileImage: asyncHandler(async (req, res) => {
    const user = req.user || await profileService.getUserById(req.auth.userId)
    let uploaded
    try {
      uploaded = await uploadBuffer(cloudinaryClient, req.file.buffer, {
        resource_type: 'image',
        folder: 'tafera/profiles',
        agent: cloudinaryUploadAgent,
      })
    } catch (error) {
      logSecurityEvent('profile_image_upload_failed', safeCloudinaryErrorDetails(error), 'error')
      throw new CloudinaryUploadError()
    }

    const previousPublicId = user.profileImagePublicId
    try {
      await profileService.updateOwnProfile(user, {
        profileImage: uploaded.secure_url,
        profileImagePublicId: uploaded.public_id,
      })
    } catch (error) {
      try {
        await cloudinaryClient.uploader.destroy(uploaded.public_id, { resource_type: 'image' })
      } catch (cleanupError) {
        logSecurityEvent('profile_image_cleanup_failed', { error: cleanupError.message, userId: req.auth.userId })
      }
      throw error
    }
    if (previousPublicId) {
      try {
        await cloudinaryClient.uploader.destroy(previousPublicId, { resource_type: 'image' })
      } catch (error) {
        logSecurityEvent('profile_image_cleanup_failed', { error: error.message, userId: req.auth.userId })
      }
    }
    noStore(res).status(200).json({ data: { user: toPublicUser(user) } })
  }),

  publicProfile: asyncHandler(async (req, res) => {
    const { userId } = parseUserId(req.params)
    const profile = await profileService.getPublicProfile(userId)

    noStore(res).status(200).json({
      data: { user: profile },
    })
  }),

  userComments: asyncHandler(async (req, res) => {
    const { userId } = parseUserId(req.params)
    const filters = parsePaginationQuery(req.query)
    const result = await commentService.listUserComments(userId, filters)
    noStore(res).status(200).json({ data: result })
  }),
})

module.exports = { createProfileController, safeCloudinaryErrorDetails }
