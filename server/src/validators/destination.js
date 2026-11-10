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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const isUuid = (value) =>
  typeof value === 'string' && UUID_PATTERN.test(value)

const emptyToUndefined = (value) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

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
  MAX_LIMIT,
  MAX_PAGE,
  SEARCH_MAX_LENGTH,
  SORT_FIELDS,
  SORT_ORDERS,
  listQuerySchema,
  identifierParamsSchema,
  isUuid,
  parseDestinationListQuery,
  parseDestinationIdentifier,
}
