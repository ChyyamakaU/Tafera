'use strict'

const {
  parseCreatePost,
  parsePaginationQuery,
  parsePostId,
  parseUpdatePost,
  parseUserId,
} = require('../validators/social')
const { z } = require('zod')
const { parseWith } = require('../validators/auth')

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next)
}

const noStore = (res) => res.set('Cache-Control', 'no-store')

const createPostController = ({ postService }) => ({
  create: asyncHandler(async (req, res) => {
    const input = parseCreatePost(req.body)
    const post = await postService.createPost(req.auth.userId, input)

    noStore(res).status(201).json({
      data: { post },
    })
  }),

  list: asyncHandler(async (req, res) => {
    const filters = parsePaginationQuery(req.query)
    const viewerUserId = req.auth ? req.auth.userId : null
    const { posts, pagination } = await postService.listPosts(
      filters,
      viewerUserId,
    )

    noStore(res).status(200).json({
      data: { posts, pagination },
    })
  }),

  following: asyncHandler(async (req, res) => {
    const filters = parsePaginationQuery(req.query)
    const { posts, pagination } = await postService.listFollowingPosts(
      req.auth.userId,
      filters,
    )

    noStore(res).status(200).json({
      data: { posts, pagination },
    })
  }),

  saved: asyncHandler(async (req, res) => {
    const filters = parsePaginationQuery(req.query)
    const { posts, pagination } = await postService.listSavedPosts(
      req.auth.userId,
      filters,
    )

    noStore(res).status(200).json({
      data: { posts, pagination },
    })
  }),

  like: asyncHandler(async (req, res) => {
    const { postId } = parsePostId(req.params)
    const result = await postService.likePost(req.auth.userId, postId)

    noStore(res).status(200).json({
      data: result,
    })
  }),

  unlike: asyncHandler(async (req, res) => {
    const { postId } = parsePostId(req.params)
    const result = await postService.unlikePost(req.auth.userId, postId)

    noStore(res).status(200).json({
      data: result,
    })
  }),

  save: asyncHandler(async (req, res) => {
    const { postId } = parsePostId(req.params)
    const result = await postService.savePost(req.auth.userId, postId)

    noStore(res).status(200).json({
      data: result,
    })
  }),

  unsave: asyncHandler(async (req, res) => {
    const { postId } = parsePostId(req.params)
    const result = await postService.unsavePost(req.auth.userId, postId)

    noStore(res).status(200).json({
      data: result,
    })
  }),

  detail: asyncHandler(async (req, res) => {
    const { postId } = parsePostId(req.params)
    const viewerUserId = req.auth ? req.auth.userId : null
    const post = await postService.getPost(postId, viewerUserId)

    noStore(res).status(200).json({
      data: { post },
    })
  }),

  update: asyncHandler(async (req, res) => {
    const { postId } = parsePostId(req.params)
    const input = parseUpdatePost(req.body)
    const post = await postService.updatePost(
      req.auth.userId,
      postId,
      input,
    )

    noStore(res).status(200).json({
      data: { post },
    })
  }),

  remove: asyncHandler(async (req, res) => {
    const { postId } = parsePostId(req.params)
    await postService.deletePost(req.auth.userId, postId)

    noStore(res).status(204).end()
  }),

  uploadImage: asyncHandler(async (req, res) => {
    const { postId } = parsePostId(req.params)
    const input = parseWith(z.object({ altText: z.string().trim().max(255).optional() }), req.body || {})
    const image = await postService.addPostImage(req.auth.userId, postId, req.file, input.altText)
    noStore(res).status(201).json({ data: { image } })
  }),

  listByUser: asyncHandler(async (req, res) => {
    const { userId } = parseUserId(req.params)
    const filters = parsePaginationQuery(req.query)
    const viewerUserId = req.auth ? req.auth.userId : null
    const { posts, pagination } = await postService.listUserPosts(
      userId,
      filters,
      viewerUserId,
    )

    noStore(res).status(200).json({
      data: { posts, pagination },
    })
  }),

  listMediaByUser: asyncHandler(async (req, res) => {
    const { userId } = parseUserId(req.params)
    const filters = parsePaginationQuery(req.query)
    const result = await postService.listUserMedia(userId, filters)
    noStore(res).status(200).json({ data: result })
  }),
})

module.exports = { createPostController }
