'use strict'

const {
  parseCreatePost,
  parsePaginationQuery,
  parsePostId,
  parseUpdatePost,
  parseUserId,
} = require('../validators/social')

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
    const { posts, pagination } = await postService.listPosts(filters)

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

  detail: asyncHandler(async (req, res) => {
    const { postId } = parsePostId(req.params)
    const post = await postService.getPost(postId)

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

  listByUser: asyncHandler(async (req, res) => {
    const { userId } = parseUserId(req.params)
    const filters = parsePaginationQuery(req.query)
    const { posts, pagination } = await postService.listUserPosts(
      userId,
      filters,
    )

    noStore(res).status(200).json({
      data: { posts, pagination },
    })
  }),
})

module.exports = { createPostController }
