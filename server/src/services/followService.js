'use strict'

const { ValidationError } = require('../utils/authErrors')
const { createPagination } = require('../utils/pagination')
const { ProfileNotFoundError } = require('../utils/profileErrors')
const { toFollowRelationship } = require('../utils/safeFollow')
const { PUBLIC_PROFILE_FIELDS } = require('../utils/safeUser')
const {
  FollowExistsError,
  FollowNotFoundError,
} = require('../utils/socialErrors')

const createFollowService = ({ Follow, User } = {}) => {
  const followModel = Follow || require('../models').Follow
  const userModel = User || require('../models').User

  const publicProfileInclude = (as) => ({
    model: userModel,
    as,
    attributes: [...PUBLIC_PROFILE_FIELDS, 'status'],
    where: { status: 'active' },
    required: true,
  })

  const findVisibleProfile = async (userId) => {
    // Missing and suspended accounts are treated as missing so public
    // lookups cannot be used to enumerate moderation state.
    const user = await userModel.findOne({
      where: { id: userId, status: 'active' },
      attributes: [...PUBLIC_PROFILE_FIELDS, 'status'],
    })

    if (!user) {
      throw new ProfileNotFoundError()
    }

    return user
  }

  const assertNotSelf = (followerId, followingId) => {
    if (followerId !== followingId) return

    throw new ValidationError([
      {
        field: 'userId',
        message: 'You cannot follow yourself.',
      },
    ])
  }

  const listRelationships = async ({
    userId,
    filters,
    foreignKey,
    includeAs,
  }) => {
    await findVisibleProfile(userId)

    const { count, rows } = await followModel.findAndCountAll({
      where: { [foreignKey]: userId },
      attributes: ['id', 'createdAt'],
      include: [publicProfileInclude(includeAs)],
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit: filters.limit,
      offset: (filters.page - 1) * filters.limit,
      distinct: true,
    })

    return {
      relationships: rows
        .map((follow) =>
          toFollowRelationship(follow, follow[includeAs]),
        )
        .filter(Boolean),
      pagination: createPagination({
        page: filters.page,
        limit: filters.limit,
        total: count,
      }),
    }
  }

  const listFollowers = async (userId, filters) => {
    const { relationships, pagination } = await listRelationships({
      userId,
      filters,
      foreignKey: 'followingId',
      includeAs: 'follower',
    })

    return { followers: relationships, pagination }
  }

  const listFollowing = async (userId, filters) => {
    const { relationships, pagination } = await listRelationships({
      userId,
      filters,
      foreignKey: 'followerId',
      includeAs: 'followingUser',
    })

    return { following: relationships, pagination }
  }

  const createFollow = async (followerId, followingId) => {
    assertNotSelf(followerId, followingId)

    const target = await findVisibleProfile(followingId)

    const existing = await followModel.findOne({
      where: { followerId, followingId },
      attributes: ['id'],
    })

    if (existing) {
      throw new FollowExistsError()
    }

    let follow

    try {
      follow = await followModel.create({
        followerId,
        followingId,
      })
    } catch (error) {
      // The database unique constraint is the final authority. Concurrent
      // duplicate requests can both pass the read above, so translate the
      // constraint violation into the same public conflict response.
      if (error && error.name === 'SequelizeUniqueConstraintError') {
        throw new FollowExistsError()
      }

      throw error
    }

    return toFollowRelationship(follow, target)
  }

  const deleteFollow = async (followerId, followingId) => {
    await findVisibleProfile(followingId)

    const follow = await followModel.findOne({
      where: { followerId, followingId },
      attributes: ['id'],
    })

    if (!follow) {
      throw new FollowNotFoundError()
    }

    await follow.destroy()
  }

  return {
    createFollow,
    deleteFollow,
    listFollowers,
    listFollowing,
  }
}

const followService = createFollowService()

module.exports = {
  createFollowService,
  followService,
}
