'use strict'

const { z } = require('zod')
const { parseWith } = require('./auth')
const { uuidSchema } = require('./trip')

const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const MAX_PAGE = 1_000_000

const PARTICIPANT_STATUSES = Object.freeze([
  'pending',
  'approved',
  'rejected',
  'cancelled',
])

// Owners may only decide a pending request or cancel an existing
// participation. `pending` is the initial state created by the join endpoint,
// so it is deliberately not a moderation target.
const MODERATION_STATUSES = Object.freeze([
  'approved',
  'rejected',
  'cancelled',
])

const participantStatusSchema = z.enum(PARTICIPANT_STATUSES, {
  message: `Participant status must be one of: ${PARTICIPANT_STATUSES.join(', ')}.`,
})

const moderationStatusSchema = z.enum(MODERATION_STATUSES, {
  message: `Moderation status must be one of: ${MODERATION_STATUSES.join(', ')}.`,
})

// Joining is an action on the authenticated user's own membership. The body
// carries no fields; Zod strips userId, status, joinedAt, tripId and any other
// unknown input before it can reach the service.
const joinTripSchema = z.object({})

const participantModerationSchema = z.object({
  status: moderationStatusSchema,
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

const participantListQuerySchema = z.object({
  status: participantStatusSchema.optional(),
  page: pageSchema,
  limit: limitSchema,
})

const tripIdParamsSchema = z.object({
  tripId: uuidSchema('Trip ID'),
})

const participantIdParamsSchema = z.object({
  tripId: uuidSchema('Trip ID'),
  participantId: uuidSchema('Participant ID'),
})

const parseJoinTrip = (input) => parseWith(joinTripSchema, input)
const parseParticipantModeration = (input) =>
  parseWith(participantModerationSchema, input)
const parseParticipantListQuery = (input) =>
  parseWith(participantListQuerySchema, input)
const parseTripId = (input) => parseWith(tripIdParamsSchema, input)
const parseParticipantId = (input) =>
  parseWith(participantIdParamsSchema, input)

module.exports = {
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  MAX_LIMIT,
  MAX_PAGE,
  MODERATION_STATUSES,
  PARTICIPANT_STATUSES,
  joinTripSchema,
  limitSchema,
  moderationStatusSchema,
  pageSchema,
  participantIdParamsSchema,
  participantListQuerySchema,
  participantModerationSchema,
  participantStatusSchema,
  parseJoinTrip,
  parseParticipantId,
  parseParticipantListQuery,
  parseParticipantModeration,
  parseTripId,
  tripIdParamsSchema,
}
