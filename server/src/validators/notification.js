'use strict'

const { z } = require('zod')
const { parseWith } = require('./auth')
const {
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  MAX_LIMIT,
  UUID_PATTERN,
  paginationQuerySchema,
} = require('./social')

const booleanFromQuery = (value) => {
  if (value === undefined) return undefined
  if (typeof value === 'boolean') return value

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()

    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }

  return value
}

const unreadOnlySchema = z.preprocess(
  booleanFromQuery,
  z
    .boolean({ message: 'unreadOnly must be a boolean.' })
    .default(false),
)

const notificationListQuerySchema = paginationQuerySchema.extend({
  unreadOnly: unreadOnlySchema,
})

const notificationIdSchema = z
  .string({ message: 'Notification ID must be a string.' })
  .trim()
  .regex(UUID_PATTERN, 'Enter a valid notification ID.')
  .transform((value) => value.toLowerCase())

const notificationIdParamsSchema = z.object({
  notificationId: notificationIdSchema,
})

const parseNotificationListQuery = (input) =>
  parseWith(notificationListQuerySchema, input)
const parseNotificationId = (input) =>
  parseWith(notificationIdParamsSchema, input)

module.exports = {
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  MAX_LIMIT,
  booleanFromQuery,
  notificationIdParamsSchema,
  notificationIdSchema,
  notificationListQuerySchema,
  parseNotificationId,
  parseNotificationListQuery,
  unreadOnlySchema,
}
