'use strict'

const {
  parsePaginationQuery,
  parseUserId,
} = require('../validators/social')

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next)
}

const noStore = (res) => res.set('Cache-Control', 'no-store')

const createFollowController = ({ followService }) => ({
  create: asyncHandler(async (req, res) => {
    const { userId } = parseUserId(req.params)
    const follow = await followService.createFollow(
      req.auth.userId,
      userId,
    )

    noStore(res).status(201).json({
      data: { follow },
    })
  }),

  remove: asyncHandler(async (req, res) => {
    const { userId } = parseUserId(req.params)
    await followService.deleteFollow(req.auth.userId, userId)

    noStore(res).status(204).end()
  }),

  followers: asyncHandler(async (req, res) => {
    const { userId } = parseUserId(req.params)
    const filters = parsePaginationQuery(req.query)
    const { followers, pagination } = await followService.listFollowers(
      userId,
      filters,
    )

    noStore(res).status(200).json({
      data: { followers, pagination },
    })
  }),

  following: asyncHandler(async (req, res) => {
    const { userId } = parseUserId(req.params)
    const filters = parsePaginationQuery(req.query)
    const { following, pagination } = await followService.listFollowing(
      userId,
      filters,
    )

    noStore(res).status(200).json({
      data: { following, pagination },
    })
  }),
})

module.exports = { createFollowController }
