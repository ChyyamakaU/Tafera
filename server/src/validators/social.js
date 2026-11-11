'use strict'

const { z } = require('zod')
const { parseWith } = require('./auth')

const POST_CONTENT_MAX_LENGTH = 5000
const COMMENT_CONTENT_MAX_LENGTH = 1000
const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const MAX_PAGE = 1_000_000

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const emptyToNull = (value) =>
  typeof value === 'string' && value.trim() === '' ? null : value

const contentSchema = (label, maxLength) =>
  z
    .string({ message: `${label} must be a string.` })
    .trim()
    .min(1, `${label} is required.`)
    .max(
      maxLength,
      `${label} must be at most ${maxLength} characters long.`,
    )

const postContentSchema = contentSchema(
  'Post content',
  POST_CONTENT_MAX_LENGTH,
)
const commentContentSchema = contentSchema(
  'Comment content',
  COMMENT_CONTENT_MAX_LENGTH,
)

const uuidSchema = (label) =>
  z
    .string({ message: `${label} must be a string.` })
    .trim()
    .regex(UUID_PATTERN, `Enter a valid ${label.toLowerCase()}.`)
    .transform((value) => value.toLowerCase())

const optionalDestinationIdSchema = z
  .preprocess(
    emptyToNull,
    uuidSchema('Destination ID').nullable(),
  )
  .optional()

// Zod objects strip unknown keys. Ownership IDs, timestamps and every other
// field outside these explicit shapes can never reach the service.
const createPostSchema = z.object({
  content: postContentSchema,
  destinationId: optionalDestinationIdSchema,
})

const updatePostSchema = z
  .object({
    content: postContentSchema.optional(),
    destinationId: optionalDestinationIdSchema,
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: 'Provide at least one post field to update.',
    path: ['request'],
  })

const createCommentSchema = z.object({
  content: commentContentSchema,
})

const updateCommentSchema = z.object({
  content: commentContentSchema,
})

const integerFromQuery = (value) => {
  if (value === undefined) return undefined
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number(value.trim())
  }

  return value
}

const pageSchema = z.preprocess(
  integerFromQuery,
  z
    .number({ message: 'Page must be an integer.' })
    .int('Page must be an integer.')
    .min(1, 'Page must be at least 1.')
    .max(MAX_PAGE, `Page must be at most ${MAX_PAGE}.`)
    .default(DEFAULT_PAGE),
)

const limitSchema = z.preprocess(
  integerFromQuery,
  z
    .number({ message: 'Limit must be an integer.' })
    .int('Limit must be an integer.')
    .min(1, 'Limit must be at least 1.')
    .max(MAX_LIMIT, `Limit must be at most ${MAX_LIMIT}.`)
    .default(DEFAULT_LIMIT),
)

const paginationQuerySchema = z.object({
  page: pageSchema,
  limit: limitSchema,
})

const userIdParamsSchema = z.object({
  userId: uuidSchema('User ID'),
})

const postIdParamsSchema = z.object({
  postId: uuidSchema('Post ID'),
})

const commentIdParamsSchema = z.object({
  commentId: uuidSchema('Comment ID'),
})

const postCommentParamsSchema = z.object({
  postId: uuidSchema('Post ID'),
  commentId: uuidSchema('Comment ID'),
})

const parseCreatePost = (input) => parseWith(createPostSchema, input)
const parseUpdatePost = (input) => parseWith(updatePostSchema, input)
const parseCreateComment = (input) =>
  parseWith(createCommentSchema, input)
const parseUpdateComment = (input) =>
  parseWith(updateCommentSchema, input)
const parsePaginationQuery = (input) =>
  parseWith(paginationQuerySchema, input)
const parseUserId = (input) => parseWith(userIdParamsSchema, input)
const parsePostId = (input) => parseWith(postIdParamsSchema, input)
const parseCommentId = (input) => parseWith(commentIdParamsSchema, input)
const parsePostCommentParams = (input) =>
  parseWith(postCommentParamsSchema, input)

module.exports = {
  COMMENT_CONTENT_MAX_LENGTH,
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  MAX_LIMIT,
  MAX_PAGE,
  POST_CONTENT_MAX_LENGTH,
  UUID_PATTERN,
  commentContentSchema,
  commentIdParamsSchema,
  createCommentSchema,
  createPostSchema,
  limitSchema,
  pageSchema,
  paginationQuerySchema,
  parseCommentId,
  parseCreateComment,
  parseCreatePost,
  parsePaginationQuery,
  parsePostCommentParams,
  parsePostId,
  parseUpdateComment,
  parseUpdatePost,
  parseUserId,
  postCommentParamsSchema,
  postContentSchema,
  postIdParamsSchema,
  updateCommentSchema,
  updatePostSchema,
  userIdParamsSchema,
}
