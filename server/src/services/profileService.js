'use strict'

const { ProfileNotFoundError } = require('../utils/profileErrors')
const {
  PUBLIC_PROFILE_FIELDS,
  toPublicProfile,
} = require('../utils/safeUser')

const createProfileService = ({ User } = {}) => {
  const userModel = User || require('../models').User

  const getPublicProfile = async (userId) => {
    // Suspended accounts are treated as missing so public lookups cannot be
    // used to enumerate moderation state.
    const user = await userModel.findOne({
      where: { id: userId, status: 'active' },
      attributes: [...PUBLIC_PROFILE_FIELDS],
    })

    if (!user) {
      throw new ProfileNotFoundError()
    }

    return toPublicProfile(user)
  }

  const updateOwnProfile = async (user, input) => {
    // The validator has already stripped every field outside the profile
    // allowlist. Never spread req.body into update().
    await user.update(input)

    return user
  }

  return {
    getPublicProfile,
    updateOwnProfile,
  }
}

const profileService = createProfileService()

module.exports = {
  createProfileService,
  profileService,
}
