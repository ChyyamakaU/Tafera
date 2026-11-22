'use strict'

const { z } = require('zod')
const { fullNameSchema, parseWith } = require('./auth')

const BIO_MAX_LENGTH = 500
const PROFILE_IMAGE_MAX_LENGTH = 255
const emptyStringToNull = (value) =>
  typeof value === 'string' && value.trim() === '' ? null : value

const isHttpUrl = (value) => {
  try {
    const url = new URL(value)
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      Boolean(url.hostname)
    )
  } catch {
    return false
  }
}

const optionalText = (max, label) => z.preprocess(
  emptyStringToNull,
  z.string({ message: `${label} must be a string.` }).trim().max(max, `${label} must be at most ${max} characters long.`).nullable(),
).optional()

const usernameSchema = z.preprocess(
  emptyStringToNull,
  z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/, 'Username must be 3–30 characters using letters, numbers or underscores.').nullable(),
).optional()

const optionalUrl = (label) => z.preprocess(
  emptyStringToNull,
  z.string().trim().max(500, `${label} must be at most 500 characters long.`).nullable().refine((value) => value === null || isHttpUrl(value), `Enter a valid http or https ${label.toLowerCase()}.`),
).optional()

const bioSchema = z
  .preprocess(
    emptyStringToNull,
    z
      .string({ message: 'Bio must be a string.' })
      .trim()
      .max(
        BIO_MAX_LENGTH,
        `Bio must be at most ${BIO_MAX_LENGTH} characters long.`,
      )
      .nullable(),
  )
  .optional()

const profileImageSchema = z
  .preprocess(
    emptyStringToNull,
    z
      .string({ message: 'Profile image must be a string.' })
      .trim()
      .max(
        PROFILE_IMAGE_MAX_LENGTH,
        `Profile image must be at most ${PROFILE_IMAGE_MAX_LENGTH} characters long.`,
      )
      .refine(isHttpUrl, 'Enter a valid http or https profile image URL.')
      .nullable(),
  )
  .optional()

// PATCH is a partial update. Unknown keys are stripped, so protected fields
// such as id, email, role, status, authVersion, passwordHash and emailVerified
// can never reach the service.
const updateProfileSchema = z
  .object({
    fullName: fullNameSchema.optional(),
    username: usernameSchema,
    bio: bioSchema,
    profileImage: profileImageSchema,
    city: optionalText(100, 'City'),
    state: optionalText(100, 'State'),
    websiteUrl: optionalUrl('website URL'),
    instagramUrl: optionalUrl('Instagram URL'),
    tiktokUrl: optionalUrl('TikTok URL'),
    youtubeUrl: optionalUrl('YouTube URL'),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: 'Provide at least one profile field to update.',
    path: ['request'],
  })

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const userIdParamsSchema = z.object({
  userId: z
    .string({ message: 'User ID must be a string.' })
    .trim()
    .regex(UUID_PATTERN, 'Enter a valid user ID.')
    .transform((value) => value.toLowerCase()),
})

const parseProfileUpdate = (input) => parseWith(updateProfileSchema, input)
const parseUserId = (input) => parseWith(userIdParamsSchema, input)

module.exports = {
  BIO_MAX_LENGTH,
  PROFILE_IMAGE_MAX_LENGTH,
  bioSchema,
  profileImageSchema,
  updateProfileSchema,
  userIdParamsSchema,
  parseProfileUpdate,
  parseUserId,
}
