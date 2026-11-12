'use strict'

const { z } = require('zod')
const { parseWith } = require('./auth')

const SEARCH_MAX_LENGTH = 100
const LOCATION_FILTER_MAX_LENGTH = 100
const IDENTIFIER_MAX_LENGTH = 255
const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const MAX_PAGE = 1_000_000

const SORT_FIELDS = Object.freeze([
  'featured',
  'name',
  'country',
  'createdAt',
])
const SORT_ORDERS = Object.freeze(['asc', 'desc'])
const DEFAULT_ORDER = Object.freeze({
  featured: 'desc',
  name: 'asc',
  country: 'asc',
  createdAt: 'desc',
})

const MAX_IMAGE_FILE_SIZE = 5 * 1024 * 1024
const MAX_IMAGES_PER_DESTINATION = 10
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const emptyToUndefined = (value) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

const uuidSchema = (label) =>
  z
    .string({ message: `${label} must be a string.` })
    .trim()
    .regex(UUID_PATTERN, `Enter a valid ${label.toLowerCase()}.`)
    .transform((value) => value.toLowerCase())

const optionalText = (maxLength, label) =>
  z.preprocess(
    emptyToUndefined,
    z
      .string({ message: `${label} must be a string.` })
      .trim()
      .min(1, `${label} must not be empty.`)
      .max(
        maxLength,
        `${label} must be at most ${maxLength} characters long.`,
      )
      .optional(),
  )

const imageAltTextSchema = z
  .string({ message: 'Alt text must be a string.' })
  .trim()
  .min(1, 'Alt text must not be empty.')
  .max(255, 'Alt text must be at most 255 characters long.')
  .optional()

const isCoverSchema = z
  .boolean({ message: 'isCover must be true or false.' })
  .optional()

const displayOrderSchema = z
  .number({ message: 'Display order must be a number.' })
  .int('Display order must be an integer.')
  .min(1, 'Display order must be at least 1.')
  .optional()

const imageIdSchema = z
  .string({ message: 'Image ID must be a string.' })
  .trim()
  .regex(UUID_PATTERN, 'Enter a valid image ID.')
  .transform((value) => value.toLowerCase())

const imageIdParamsSchema = z.object({
  imageId: imageIdSchema,
})

const destinationIdParamsSchema = z.object({
  destinationId: uuidSchema('Destination ID'),
})

const createImageSchema = z.object({
  altText: imageAltTextSchema,
  isCover: isCoverSchema,
})

const updateImageSchema = z.object({
  altText: imageAltTextSchema,
  displayOrder: displayOrderSchema,
  isCover: isCoverSchema,
}).superRefine((data, ctx) => {
  if (
    data.altText === undefined &&
    data.displayOrder === undefined &&
    data.isCover === undefined
  ) {
    ctx.addIssue({
      code: 'custom',
      message: 'At least one of altText, displayOrder or isCover is required.',
      path: ['altText'],
    })
  }
})

const reorderImagesSchema = z
  .array(imageIdSchema)
  .min(1, 'At least one image ID is required.')
  .superRefine((ids, ctx) => {
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'Duplicate image IDs are not allowed.',
      })
    }
  })

const parseCreateImage = (input) => parseWith(createImageSchema, input)
const parseUpdateImage = (input) => parseWith(updateImageSchema, input)
const parseImageId = (input) => parseWith(imageIdParamsSchema, input)
const parseDestinationId = (input) => parseWith(destinationIdParamsSchema, input)
const parseReorderImages = (input) => parseWith(reorderImagesSchema, input)

const isUuid = (value) =>
  typeof value === 'string' && UUID_PATTERN.test(value)

const identifierSchema = z
  .string({ message: 'Destination identifier must be a string.' })
  .trim()
  .min(1, 'Destination identifier is required.')
  .max(
    IDENTIFIER_MAX_LENGTH,
    `Destination identifier must be at most ${IDENTIFIER_MAX_LENGTH} characters long.`,
  )
  .superRefine((value, ctx) => {
    if (isUuid(value) || SLUG_PATTERN.test(value)) return

    ctx.addIssue({
      code: 'custom',
      message: 'Enter a valid destination ID or lowercase kebab-case slug.',
    })
  })
  .transform((value) => (isUuid(value) ? value.toLowerCase() : value))

const identifierParamsSchema = z.object({
  idOrSlug: identifierSchema,
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

const booleanFromQuery = (value) => {
  if (value === undefined || value === '') return undefined
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false

  return value
}

const featuredSchema = z.preprocess(
  booleanFromQuery,
  z
    .boolean({ message: 'Featured must be true or false.' })
    .optional(),
)

const listQuerySchema = z.object({
  q: optionalText(SEARCH_MAX_LENGTH, 'Search query'),
  country: optionalText(LOCATION_FILTER_MAX_LENGTH, 'Country'),
  state: optionalText(LOCATION_FILTER_MAX_LENGTH, 'State'),
  featured: featuredSchema,
  sort: z
    .enum(SORT_FIELDS, {
      message: `Sort must be one of: ${SORT_FIELDS.join(', ')}.`,
    })
    .default('featured'),
  order: z
    .enum(SORT_ORDERS, {
      message: `Order must be one of: ${SORT_ORDERS.join(', ')}.`,
    })
    .optional(),
  page: pageSchema,
  limit: limitSchema,
})

const parseDestinationListQuery = (input) => {
  const parsed = parseWith(listQuerySchema, input)

  return {
    ...parsed,
    order: parsed.order || DEFAULT_ORDER[parsed.sort],
  }
}

const parseDestinationIdentifier = (input) =>
  parseWith(identifierParamsSchema, input)

module.exports = {
  DEFAULT_LIMIT,
  DEFAULT_ORDER,
  DEFAULT_PAGE,
  IDENTIFIER_MAX_LENGTH,
  LOCATION_FILTER_MAX_LENGTH,
  MAX_IMAGE_FILE_SIZE,
  MAX_IMAGES_PER_DESTINATION,
  MAX_LIMIT,
  MAX_PAGE,
  SEARCH_MAX_LENGTH,
  SORT_FIELDS,
  SORT_ORDERS,
  SUPPORTED_IMAGE_TYPES,
  UUID_PATTERN,
  createImageSchema,
  destinationIdParamsSchema,
  imageIdParamsSchema,
  imageIdSchema,
  isUuid,
  listQuerySchema,
  identifierParamsSchema,
  parseCreateImage,
  parseDestinationId,
  parseDestinationIdentifier,
  parseDestinationListQuery,
  parseImageId,
  parseReorderImages,
  parseUpdateImage,
}
