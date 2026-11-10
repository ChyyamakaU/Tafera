'use strict'

const { parseProfileUpdate, parseUserId } = require('../validators/profile')
const { toPublicUser } = require('../utils/safeUser')

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next)
}

const noStore = (res) => res.set('Cache-Control', 'no-store')

const createProfileController = ({ profileService }) => ({
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

  publicProfile: asyncHandler(async (req, res) => {
    const { userId } = parseUserId(req.params)
    const profile = await profileService.getPublicProfile(userId)

    noStore(res).status(200).json({
      data: { user: profile },
    })
  }),
})

module.exports = { createProfileController }
