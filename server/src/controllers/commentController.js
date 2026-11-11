'use strict'

const {
  parseCreateComment,
  parsePaginationQuery,
  parsePostCommentParams,
  parsePostId,
  parseUpdateComment,
} = require('../validators/social')

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next)
}

const noStore = (res) => res.set('Cache-Control', 'no-store')

const createCommentController = ({ commentService }) => ({
  create: asyncHandler(async (req, res) => {
    const { postId } = parsePostId(req.params)
    const input = parseCreateComment(req.body)
    const comment = await commentService.createComment(
      req.auth.userId,
      postId,
      input,
    )

    noStore(res).status(201).json({
      data: { comment },
    })
  }),

  list: asyncHandler(async (req, res) => {
    const { postId } = parsePostId(req.params)
    const filters = parsePaginationQuery(req.query)
    const { comments, pagination } = await commentService.listComments(
      postId,
      filters,
    )

    noStore(res).status(200).json({
      data: { comments, pagination },
    })
  }),

  update: asyncHandler(async (req, res) => {
    const { postId, commentId } = parsePostCommentParams(req.params)
    const input = parseUpdateComment(req.body)
    const comment = await commentService.updateComment(
      req.auth.userId,
      postId,
      commentId,
      input,
    )

    noStore(res).status(200).json({
      data: { comment },
    })
  }),

  remove: asyncHandler(async (req, res) => {
    const { postId, commentId } = parsePostCommentParams(req.params)
    await commentService.deleteComment(
      req.auth.userId,
      postId,
      commentId,
    )

    noStore(res).status(204).end()
  }),
})

module.exports = { createCommentController }
