'use strict'

const { z } = require('zod')
const { parseWith } = require('./auth')
const { UUID_PATTERN, paginationQuerySchema } = require('./social')
const {
  ADMIN_REVIEW_STATUSES,
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
} = require('./report')

const emptyToUndefined = (value) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

const emptyToNull = (value) =>
  typeof value === 'string' && value.trim() === '' ? null : value

const optionalSearchSchema = z
  .preprocess(
    emptyToUndefined,
    z.string().trim().max(120, 'Search term must be at most 120 characters.').optional(),
  )

const optionalReasonSchema = z
  .preprocess(
    emptyToNull,
    z.string().trim().max(1000, 'Reason must be at most 1000 characters.').nullable(),
  )
  .optional()

const uuidField = (label) =>
  z
    .string({ message: `${label} must be a string.` })
    .trim()
    .regex(UUID_PATTERN, `Enter a valid ${label.toLowerCase()}.`)
    .transform((value) => value.toLowerCase())

const optionalCoordinate = (min, max, label) =>
  z
    .preprocess((value) => {
      if (value === undefined) return undefined
      if (value === null || value === '') return null
      const num = Number(value)
      return Number.isNaN(num) ? value : num
    }, z.number({ message: `${label} must be a number.` }).min(min).max(max).nullable())
    .optional()

// Users
const adminUsersQuerySchema = paginationQuerySchema.extend({
  search: optionalSearchSchema,
  role: z.preprocess(emptyToUndefined, z.enum(['user', 'admin']).optional()),
  status: z.preprocess(emptyToUndefined, z.enum(['active', 'suspended']).optional()),
})

const adminUpdateUserStatusSchema = z.object({
  status: z.enum(['active', 'suspended'], {
    message: 'Status must be active or suspended.',
  }),
  reason: optionalReasonSchema,
})

const adminUpdateUserRoleSchema = z.object({
  role: z.enum(['user', 'admin'], {
    message: 'Role must be user or admin.',
  }),
  reason: optionalReasonSchema,
})

// Destinations
const adminDestinationsQuerySchema = paginationQuerySchema.extend({
  search: optionalSearchSchema,
  status: z.preprocess(emptyToUndefined, z.enum(['draft', 'published']).optional()),
  country: optionalSearchSchema,
  state: optionalSearchSchema,
})

const adminCreateDestinationSchema = z.object({
  name: z
    .string({ message: 'Destination name is required.' })
    .trim()
    .min(2, 'Destination name must be at least 2 characters.')
    .max(150, 'Destination name must be at most 150 characters.'),
  country: z
    .string({ message: 'Country is required.' })
    .trim()
    .min(2, 'Country must be at least 2 characters.')
    .max(100, 'Country must be at most 100 characters.'),
  state: z
    .preprocess(emptyToNull, z.string().trim().max(100).nullable())
    .optional(),
  location: z
    .preprocess(emptyToNull, z.string().trim().max(200).nullable())
    .optional(),
  description: z
    .string({ message: 'Description is required.' })
    .trim()
    .min(10, 'Description must be at least 10 characters.')
    .max(5000, 'Description must be at most 5000 characters.'),
  latitude: optionalCoordinate(-90, 90, 'Latitude'),
  longitude: optionalCoordinate(-180, 180, 'Longitude'),
  featured: z.boolean().optional().default(false),
  status: z.enum(['draft', 'published']).optional().default('published'),
})

const adminUpdateDestinationSchema = z
  .object({
    name: z.string().trim().min(2).max(150).optional(),
    country: z.string().trim().min(2).max(100).optional(),
    state: z.preprocess(emptyToNull, z.string().trim().max(100).nullable()).optional(),
    location: z.preprocess(emptyToNull, z.string().trim().max(200).nullable()).optional(),
    description: z.string().trim().min(10).max(5000).optional(),
    latitude: optionalCoordinate(-90, 90, 'Latitude'),
    longitude: optionalCoordinate(-180, 180, 'Longitude'),
    featured: z.boolean().optional(),
    status: z.enum(['draft', 'published']).optional(),
    reason: optionalReasonSchema,
  })
  .refine(
    (input) => Object.keys(input).some((key) => key !== 'reason'),
    {
      message: 'Provide at least one destination field to update.',
      path: ['request'],
    },
  )

// Moderation & reports
const adminReportsQuerySchema = paginationQuerySchema.extend({
  status: z.preprocess(emptyToUndefined, z.enum(REPORT_STATUSES).optional()),
  targetType: z.preprocess(emptyToUndefined, z.enum(REPORT_TARGET_TYPES).optional()),
})

const adminModerateReportSchema = z.object({
  status: z.enum(ADMIN_REVIEW_STATUSES, {
    message: `Status must be one of: ${ADMIN_REVIEW_STATUSES.join(', ')}.`,
  }),
  resolutionNote: optionalReasonSchema,
  action: z
    .enum(['none', 'remove_content', 'suspend_user'])
    .optional()
    .default('none'),
  reason: optionalReasonSchema,
})

// Group trips
const adminTripsQuerySchema = paginationQuerySchema.extend({
  search: optionalSearchSchema,
  status: z.preprocess(
    emptyToUndefined,
    z.enum(['draft', 'published', 'cancelled', 'completed']).optional(),
  ),
})

const adminUpdateTripStatusSchema = z.object({
  status: z.enum(['draft', 'published', 'cancelled', 'completed'], {
    message: 'Status must be draft, published, cancelled, or completed.',
  }),
  reason: optionalReasonSchema,
})

// Audit logs
const adminAuditLogsQuerySchema = paginationQuerySchema.extend({
  action: optionalSearchSchema,
  targetType: optionalSearchSchema,
})

const adminReasonBodySchema = z.object({
  reason: optionalReasonSchema,
})

const parseAdminUsersQuery = (input) => parseWith(adminUsersQuerySchema, input)
const parseAdminUpdateUserStatus = (input) => parseWith(adminUpdateUserStatusSchema, input)
const parseAdminUpdateUserRole = (input) => parseWith(adminUpdateUserRoleSchema, input)
const parseAdminDestinationsQuery = (input) => parseWith(adminDestinationsQuerySchema, input)
const parseAdminCreateDestination = (input) => parseWith(adminCreateDestinationSchema, input)
const parseAdminUpdateDestination = (input) => parseWith(adminUpdateDestinationSchema, input)
const parseAdminReportsQuery = (input) => parseWith(adminReportsQuerySchema, input)
const parseAdminModerateReport = (input) => parseWith(adminModerateReportSchema, input)
const parseAdminTripsQuery = (input) => parseWith(adminTripsQuerySchema, input)
const parseAdminUpdateTripStatus = (input) => parseWith(adminUpdateTripStatusSchema, input)
const parseAdminAuditLogsQuery = (input) => parseWith(adminAuditLogsQuerySchema, input)
const parseAdminReasonBody = (input) => parseWith(adminReasonBodySchema, input)
const parseAdminUuidParam = (key, label) => (input) =>
  parseWith(z.object({ [key]: uuidField(label) }), input)

module.exports = {
  parseAdminUsersQuery,
  parseAdminUpdateUserStatus,
  parseAdminUpdateUserRole,
  parseAdminDestinationsQuery,
  parseAdminCreateDestination,
  parseAdminUpdateDestination,
  parseAdminReportsQuery,
  parseAdminModerateReport,
  parseAdminTripsQuery,
  parseAdminUpdateTripStatus,
  parseAdminAuditLogsQuery,
  parseAdminReasonBody,
  parseAdminUuidParam,
}
