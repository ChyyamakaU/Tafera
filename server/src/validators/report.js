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

const DESCRIPTION_MAX_LENGTH = 1000

const REPORT_TARGET_TYPES = Object.freeze(['user', 'post', 'comment', 'trip'])
const REPORT_REASONS = Object.freeze([
  'spam',
  'harassment',
  'inappropriate_content',
  'impersonation',
  'misinformation',
  'other',
])
const REPORT_STATUSES = Object.freeze([
  'pending',
  'under_review',
  'resolved',
  'dismissed',
])
const ADMIN_REVIEW_STATUSES = Object.freeze([
  'under_review',
  'resolved',
  'dismissed',
])

const emptyToNull = (value) =>
  typeof value === 'string' && value.trim() === '' ? null : value

const uuidSchema = (label) =>
  z
    .string({ message: `${label} must be a string.` })
    .trim()
    .regex(UUID_PATTERN, `Enter a valid ${label.toLowerCase()}.`)
    .transform((value) => value.toLowerCase())

const targetTypeSchema = z.enum(REPORT_TARGET_TYPES, {
  message: `Target type must be one of: ${REPORT_TARGET_TYPES.join(', ')}.`,
})

const reasonSchema = z.enum(REPORT_REASONS, {
  message: `Reason must be one of: ${REPORT_REASONS.join(', ')}.`,
})

const reportStatusSchema = z.enum(REPORT_STATUSES, {
  message: `Status must be one of: ${REPORT_STATUSES.join(', ')}.`,
})

const adminReviewStatusSchema = z.enum(ADMIN_REVIEW_STATUSES, {
  message: `Status must be one of: ${ADMIN_REVIEW_STATUSES.join(', ')}.`,
})

const optionalDescriptionSchema = z
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

const optionalResolutionNoteSchema = z
  .preprocess(
    emptyToNull,
    z
      .string({ message: 'Resolution note must be a string.' })
      .trim()
      .max(
        DESCRIPTION_MAX_LENGTH,
        `Resolution note must be at most ${DESCRIPTION_MAX_LENGTH} characters long.`,
      )
      .nullable(),
  )
  .optional()

// Zod objects strip unknown keys. Ownership IDs, timestamps and every other
// field outside these explicit shapes can never reach the service.
const createReportSchema = z.object({
  targetType: targetTypeSchema,
  targetId: uuidSchema('Target ID'),
  reason: reasonSchema,
  description: optionalDescriptionSchema,
})

const reportIdParamsSchema = z.object({
  reportId: uuidSchema('Report ID'),
})

const reportListQuerySchema = paginationQuerySchema.extend({
  status: reportStatusSchema.optional(),
  targetType: targetTypeSchema.optional(),
})

const reporterReportListQuerySchema = paginationQuerySchema

const updateReportStatusSchema = z.object({
  status: adminReviewStatusSchema,
  resolutionNote: optionalResolutionNoteSchema,
})

const parseCreateReport = (input) => parseWith(createReportSchema, input)
const parseReportId = (input) => parseWith(reportIdParamsSchema, input)
const parseReportListQuery = (input) => parseWith(reportListQuerySchema, input)
const parseReporterReportListQuery = (input) =>
  parseWith(reporterReportListQuerySchema, input)
const parseUpdateReportStatus = (input) =>
  parseWith(updateReportStatusSchema, input)

module.exports = {
  ADMIN_REVIEW_STATUSES,
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  DESCRIPTION_MAX_LENGTH,
  MAX_LIMIT,
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
  UUID_PATTERN,
  adminReviewStatusSchema,
  createReportSchema,
  optionalDescriptionSchema,
  optionalResolutionNoteSchema,
  parseCreateReport,
  parseReporterReportListQuery,
  parseReportId,
  parseReportListQuery,
  parseUpdateReportStatus,
  reasonSchema,
  reportIdParamsSchema,
  reportListQuerySchema,
  reportStatusSchema,
  reporterReportListQuerySchema,
  targetTypeSchema,
  updateReportStatusSchema,
  uuidSchema,
}
