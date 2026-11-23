'use strict'

const { z } = require('zod')
const { parseWith } = require('./auth')

const STORY_TITLE_MAX_LENGTH = 150
const STORY_EXCERPT_MAX_LENGTH = 1000
const STORY_BADGE_MAX_LENGTH = 60
const STORY_AUTHOR_NAME_MAX_LENGTH = 120
const STORY_COVER_URL_MAX_LENGTH = 500
const STORY_COVER_ALT_MAX_LENGTH = 255
const DEFAULT_STORY_LIMIT = 6
const MAX_STORY_LIMIT = 20

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const emptyToNull = (value) =>
  typeof value === 'string' && value.trim() === '' ? null : value

const uuidSchema = (label) =>
  z
    .string({ message: `${label} must be a string.` })
    .trim()
    .regex(UUID_PATTERN, `Enter a valid ${label.toLowerCase()}.`)
    .transform((value) => value.toLowerCase())

const optionalUuidSchema = (label) =>
  z.preprocess(emptyToNull, uuidSchema(label).nullable()).optional()

const isHttpUrl = (value) => {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

const titleSchema = z
  .string({ message: 'Title must be a string.' })
  .trim()
  .min(1, 'Title is required.')
  .max(
    STORY_TITLE_MAX_LENGTH,
    `Title must be at most ${STORY_TITLE_MAX_LENGTH} characters long.`,
  )

const excerptSchema = z
  .string({ message: 'Excerpt must be a string.' })
  .trim()
  .min(1, 'Excerpt is required.')
  .max(
    STORY_EXCERPT_MAX_LENGTH,
    `Excerpt must be at most ${STORY_EXCERPT_MAX_LENGTH} characters long.`,
  )

const badgeLabelSchema = z
  .string({ message: 'Badge label must be a string.' })
  .trim()
  .min(1, 'Badge label is required.')
  .max(
    STORY_BADGE_MAX_LENGTH,
    `Badge label must be at most ${STORY_BADGE_MAX_LENGTH} characters long.`,
  )

const authorNameSchema = z
  .string({ message: 'Author name must be a string.' })
  .trim()
  .min(1, 'Author name is required.')
  .max(
    STORY_AUTHOR_NAME_MAX_LENGTH,
    `Author name must be at most ${STORY_AUTHOR_NAME_MAX_LENGTH} characters long.`,
  )

const optionalCoverImageUrlSchema = z
  .preprocess(
    emptyToNull,
    z
      .string({ message: 'Cover image URL must be a string.' })
      .trim()
      .max(
        STORY_COVER_URL_MAX_LENGTH,
        `Cover image URL must be at most ${STORY_COVER_URL_MAX_LENGTH} characters long.`,
      )
      .refine(isHttpUrl, 'Enter a valid http(s) image URL.')
      .nullable(),
  )
  .optional()

const optionalCoverImageAltSchema = z
  .preprocess(
    emptyToNull,
    z
      .string({ message: 'Cover image alt text must be a string.' })
      .trim()
      .max(
        STORY_COVER_ALT_MAX_LENGTH,
        `Cover image alt text must be at most ${STORY_COVER_ALT_MAX_LENGTH} characters long.`,
      )
      .nullable(),
  )
  .optional()

const displayOrderSchema = z
  .number({ message: 'Display order must be an integer.' })
  .int('Display order must be an integer.')
  .min(0, 'Display order must be at least 0.')
  .max(10000, 'Display order is too large.')

const createStorySchema = z.object({
  title: titleSchema,
  excerpt: excerptSchema,
  badgeLabel: badgeLabelSchema.default('Traveller spotlight'),
  authorName: authorNameSchema,
  authorId: optionalUuidSchema('Author ID'),
  destinationId: optionalUuidSchema('Destination ID'),
  postId: optionalUuidSchema('Post ID'),
  coverImageUrl: optionalCoverImageUrlSchema,
  coverImageAlt: optionalCoverImageAltSchema,
  isFeatured: z.boolean().default(true),
  displayOrder: displayOrderSchema.optional(),
})

const updateStorySchema = z
  .object({
    title: titleSchema.optional(),
    excerpt: excerptSchema.optional(),
    badgeLabel: badgeLabelSchema.optional(),
    authorName: authorNameSchema.optional(),
    authorId: optionalUuidSchema('Author ID'),
    destinationId: optionalUuidSchema('Destination ID'),
    postId: optionalUuidSchema('Post ID'),
    coverImageUrl: optionalCoverImageUrlSchema,
    coverImageAlt: optionalCoverImageAltSchema,
    isFeatured: z.boolean().optional(),
    displayOrder: displayOrderSchema.optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: 'Provide at least one story field to update.',
    path: ['request'],
  })

const reorderStoriesSchema = z.object({
  storyIds: z
    .array(uuidSchema('Story ID'))
    .refine(
      (ids) => new Set(ids).size === ids.length,
      'Story IDs must be unique.',
    ),
})

const coverMetaSchema = z.object({
  coverImageAlt: optionalCoverImageAltSchema,
})

const integerFromQuery = (value) => {
  if (value === undefined) return undefined
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number(value.trim())
  }
  return value
}

const listQuerySchema = z.object({
  limit: z.preprocess(
    integerFromQuery,
    z
      .number({ message: 'Limit must be an integer.' })
      .int('Limit must be an integer.')
      .min(1, 'Limit must be at least 1.')
      .max(MAX_STORY_LIMIT, `Limit must be at most ${MAX_STORY_LIMIT}.`)
      .default(DEFAULT_STORY_LIMIT),
  ),
})

const storyIdParamsSchema = z.object({
  storyId: uuidSchema('Story ID'),
})

const parseCreateStory = (input) => parseWith(createStorySchema, input)
const parseUpdateStory = (input) => parseWith(updateStorySchema, input)
const parseReorderStories = (input) => parseWith(reorderStoriesSchema, input)
const parseStoryListQuery = (input) => parseWith(listQuerySchema, input)
const parseStoryId = (input) => parseWith(storyIdParamsSchema, input)
const parseStoryCoverMeta = (input) => parseWith(coverMetaSchema, input || {})

module.exports = {
  DEFAULT_STORY_LIMIT,
  MAX_STORY_LIMIT,
  STORY_AUTHOR_NAME_MAX_LENGTH,
  STORY_BADGE_MAX_LENGTH,
  STORY_COVER_ALT_MAX_LENGTH,
  STORY_COVER_URL_MAX_LENGTH,
  STORY_EXCERPT_MAX_LENGTH,
  STORY_TITLE_MAX_LENGTH,
  createStorySchema,
  listQuerySchema,
  parseCreateStory,
  parseReorderStories,
  parseStoryCoverMeta,
  parseStoryId,
  parseStoryListQuery,
  parseUpdateStory,
  reorderStoriesSchema,
  storyIdParamsSchema,
  updateStorySchema,
}
