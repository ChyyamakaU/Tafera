'use strict'

const { parseProfileUpdate, parseUserId } = require('../validators/profile')
const { toPublicUser } = require('../utils/safeUser')
const cloudinary = require('../config/cloudinary')
const { CloudinaryUploadError } = require('../utils/destinationErrors')
const { logSecurityEvent } = require('../utils/securityLog')
const { uploadBuffer } = require('../utils/cloudinaryUpload')

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next)
}

const noStore = (res) => res.set('Cache-Control', 'no-store')

const { parsePaginationQuery } = require('../validators/social')
const createProfileController = ({ profileService, commentService }) => ({
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
    let uploaded
    try {
      uploaded = await uploadBuffer(cloudinary, req.file.buffer, {
        resource_type: 'image',
        folder: 'tafera/profiles',
      })
    } catch (error) {
      logSecurityEvent('profile_image_upload_failed', { error: error.message, userId: req.auth.userId })
      throw new CloudinaryUploadError()
    }

    const previousPublicId = req.user.profileImagePublicId
    try {
      await profileService.updateOwnProfile(req.user, {
        profileImage: uploaded.secure_url,
        profileImagePublicId: uploaded.public_id,
      })
    } catch (error) {
      try {
        await cloudinary.uploader.destroy(uploaded.public_id, { resource_type: 'image' })
      } catch (cleanupError) {
        logSecurityEvent('profile_image_cleanup_failed', { error: cleanupError.message, userId: req.auth.userId })
      }
      throw error
    }
    if (previousPublicId) {
      try {
        await cloudinary.uploader.destroy(previousPublicId, { resource_type: 'image' })
      } catch (error) {
        logSecurityEvent('profile_image_cleanup_failed', { error: error.message, userId: req.auth.userId })
      }
    }
    noStore(res).status(200).json({ data: { user: toPublicUser(req.user) } })
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

module.exports = { createProfileController }
