'use strict'

const { z } = require('zod')
const { parseWith } = require('./auth')

const TITLE_MAX_LENGTH = 150
const DESCRIPTION_MAX_LENGTH = 2000
const MAX_PARTICIPANTS_LIMIT = 1000
const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const MAX_PAGE = 1_000_000

const TRIP_TYPES = Object.freeze(['personal', 'group'])
const TRIP_STATUSES = Object.freeze([
  'draft',
  'published',
  'cancelled',
  'completed',
])

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

const emptyToUndefined = (value) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

const emptyToNull = (value) =>
  typeof value === 'string' && value.trim() === '' ? null : value

const isValidDateOnly = (value) => {
  const match = DATE_ONLY_PATTERN.exec(value)

  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  if (month < 1 || month > 12 || day < 1 || day > 31) return false

  const date = new Date(Date.UTC(year, month - 1, day))

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

const dateOnlySchema = z
  .string({ message: 'Date must be a string.' })
  .trim()
  .refine(isValidDateOnly, 'Enter a valid date in YYYY-MM-DD format.')

const optionalDateOnlySchema = z
  .preprocess(
    emptyToNull,
    dateOnlySchema.nullable(),
  )
  .optional()

const uuidSchema = (label) =>
  z
    .string({ message: `${label} must be a string.` })
    .trim()
    .regex(UUID_PATTERN, `Enter a valid ${label.toLowerCase()}.`)
    .transform((value) => value.toLowerCase())

const titleSchema = z
  .string({ message: 'Title must be a string.' })
  .trim()
  .min(1, 'Title is required.')
  .max(
    TITLE_MAX_LENGTH,
    `Title must be at most ${TITLE_MAX_LENGTH} characters long.`,
  )

const descriptionSchema = z
  .preprocess(
    emptyToNull,
    z
      .string({ message: 'Description must be a string.' })
      .trim()
      .max(
        DESCRIPTION_MAX_LENGTH,
        `Description must be at most ${DESCRIPTION_MAX_LENGTH} characters long.`,
      )
      .nullable(),
  )
  .optional()

const tripTypeSchema = z.enum(TRIP_TYPES, {
  message: `Trip type must be one of: ${TRIP_TYPES.join(', ')}.`,
})

const statusSchema = z.enum(TRIP_STATUSES, {
  message: `Status must be one of: ${TRIP_STATUSES.join(', ')}.`,
})

const maxParticipantsSchema = z
  .preprocess(
    emptyToNull,
    z
      .number({ message: 'Max participants must be a number.' })
      .int('Max participants must be an integer.')
      .min(1, 'Max participants must be at least 1.')
      .max(
        MAX_PARTICIPANTS_LIMIT,
        `Max participants must be at most ${MAX_PARTICIPANTS_LIMIT}.`,
      )
      .nullable(),
  )
  .optional()

const createTripSchema = z
  .object({
    title: titleSchema,
    description: descriptionSchema,
    tripType: tripTypeSchema.default('personal'),
    startDate: dateOnlySchema,
    endDate: dateOnlySchema,
    maxParticipants: maxParticipantsSchema,
    status: statusSchema.default('draft'),
  })
  .refine(
    (input) => input.endDate >= input.startDate,
    {
      message: 'End date must be on or after the start date.',
      path: ['endDate'],
    },
  )

// PATCH is partial. Cross-field date validation against stored values happens
// in the service once the existing trip has been loaded.
const updateTripSchema = z
  .object({
    title: titleSchema.optional(),
    description: descriptionSchema,
    tripType: tripTypeSchema.optional(),
    startDate: dateOnlySchema.optional(),
    endDate: dateOnlySchema.optional(),
    maxParticipants: maxParticipantsSchema,
    status: statusSchema.optional(),
  })
  .refine(
    (input) => Object.keys(input).length > 0,
    {
      message: 'Provide at least one trip field to update.',
      path: ['request'],
    },
  )
  .refine(
    (input) =>
      input.startDate === undefined ||
      input.endDate === undefined ||
      input.endDate >= input.startDate,
    {
      message: 'End date must be on or after the start date.',
      path: ['endDate'],
    },
  )

const createStopSchema = z
  .object({
    destinationId: uuidSchema('Destination ID'),
    arrivalDate: optionalDateOnlySchema,
    departureDate: optionalDateOnlySchema,
  })
  .refine(
    (input) =>
      !input.arrivalDate ||
      !input.departureDate ||
      input.departureDate >= input.arrivalDate,
    {
      message: 'Departure date must be on or after the arrival date.',
      path: ['departureDate'],
    },
  )

const updateStopSchema = z
  .object({
    arrivalDate: optionalDateOnlySchema,
    departureDate: optionalDateOnlySchema,
  })
  .refine(
    (input) => Object.keys(input).length > 0,
    {
      message: 'Provide at least one stop field to update.',
      path: ['request'],
    },
  )

const reorderStopsSchema = z
  .object({
    stopIds: z
      .array(uuidSchema('Stop ID'))
      .refine(
        (ids) => new Set(ids).size === ids.length,
        'Stop IDs must be unique.',
      ),
  })

const UUID_QUERY_PATTERN = /^\d+$/

const integerFromQuery = (value) => {
  if (value === undefined) return undefined
  if (typeof value === 'string' && UUID_QUERY_PATTERN.test(value.trim())) {
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

const listQuerySchema = z.object({
  status: statusSchema.optional(),
  page: pageSchema,
  limit: limitSchema,
})

const tripIdParamsSchema = z.object({
  tripId: uuidSchema('Trip ID'),
})

const stopIdParamsSchema = z.object({
  tripId: uuidSchema('Trip ID'),
  stopId: uuidSchema('Stop ID'),
})

const parseCreateTrip = (input) => parseWith(createTripSchema, input)
const parseUpdateTrip = (input) => parseWith(updateTripSchema, input)
const parseCreateStop = (input) => parseWith(createStopSchema, input)
const parseUpdateStop = (input) => parseWith(updateStopSchema, input)
const parseReorderStops = (input) => parseWith(reorderStopsSchema, input)
const parseTripListQuery = (input) => parseWith(listQuerySchema, input)
const parseTripId = (input) => parseWith(tripIdParamsSchema, input)
const parseStopId = (input) => parseWith(stopIdParamsSchema, input)

module.exports = {
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  DESCRIPTION_MAX_LENGTH,
  MAX_LIMIT,
  MAX_PAGE,
  MAX_PARTICIPANTS_LIMIT,
  TITLE_MAX_LENGTH,
  TRIP_STATUSES,
  TRIP_TYPES,
  createStopSchema,
  createTripSchema,
  dateOnlySchema,
  isValidDateOnly,
  listQuerySchema,
  parseCreateStop,
  parseCreateTrip,
  parseReorderStops,
  parseStopId,
  parseTripId,
  parseTripListQuery,
  parseUpdateStop,
  parseUpdateTrip,
  reorderStopsSchema,
  stopIdParamsSchema,
  tripIdParamsSchema,
  updateStopSchema,
  updateTripSchema,
  uuidSchema,
}
