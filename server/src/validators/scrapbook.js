'use strict'

const { z } = require('zod')
const { parseWith } = require('./auth')
const {
  UUID_PATTERN,
  isUuid,
  imageIdSchema,
} = require('./destination')

const booleanFromForm = (value) => {
  if (value === undefined || value === '') return undefined
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return value
}

const imageAltTextSchema = z
  .string({ message: 'Alt text must be a string.' })
  .trim()
  .min(1, 'Alt text must not be empty.')
  .max(255, 'Alt text must be at most 255 characters long.')
  .optional()

// Caption is stored in a TEXT column, but a reasonable upper bound keeps
// request payloads predictable while matching comment-content conventions.
const captionSchema = z
  .string({ message: 'Caption must be a string.' })
  .trim()
  .min(1, 'Caption must not be empty.')
  .max(1000, 'Caption must be at most 1000 characters long.')
  .optional()

// Accepts ISO date (e.g. 2026-01-15) or datetime strings. The service layer
// passes the value straight through to the DATE column.
const takenAtSchema = z
  .string({ message: 'Taken at must be a string.' })
  .trim()
  .min(1, 'Taken at must not be empty.')
  .refine(
    (value) => !isNaN(Date.parse(value)),
    'Enter a valid date.'
  )
  .optional()

const isCoverSchema = z
  .preprocess(booleanFromForm, z.boolean({ message: 'isCover must be true or false.' }))
  .optional()

const displayOrderSchema = z
  .number({ message: 'Display order must be a number.' })
  .int('Display order must be an integer.')
  .min(1, 'Display order must be at least 1.')
  .optional()

const reorderImagesSchema = z
  .array(imageIdSchema)
  .min(1, 'At least one image ID is required.')
  .superRefine((ids, ctx) => {
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'Duplicate image IDs are not allowed.',
        path: ['imageId'],
      })
    }
  })

const journalIdSchema = z
  .string({ message: 'Journal ID must be a string.' })
  .trim()
  .regex(UUID_PATTERN, 'Enter a valid journal ID.')
  .transform((value) => value.toLowerCase())

const journalIdParamsSchema = z.object({
  journalId: journalIdSchema,
})

const createScrapbookImageSchema = z.object({
  altText: imageAltTextSchema,
  caption: captionSchema,
  takenAt: takenAtSchema,
  isCover: isCoverSchema,
})

const updateScrapbookImageSchema = z.object({
  altText: imageAltTextSchema,
  caption: captionSchema,
  takenAt: takenAtSchema,
  displayOrder: displayOrderSchema,
  isCover: isCoverSchema,
}).superRefine((data, ctx) => {
  if (
    data.altText === undefined &&
    data.caption === undefined &&
    data.takenAt === undefined &&
    data.displayOrder === undefined &&
    data.isCover === undefined
  ) {
    ctx.addIssue({
      code: 'custom',
      message: 'At least one of altText, caption, takenAt, displayOrder or isCover is required.',
      path: ['altText'],
    })
  }
})

const imageIdParamsSchema = z.object({
  imageId: imageIdSchema,
})

const parseJournalId = (input) => parseWith(journalIdParamsSchema, input)
const parseImageId = (input) => parseWith(imageIdParamsSchema, input)
const parseCreateScrapbookImage = (input) =>
  parseWith(createScrapbookImageSchema, input)
const parseUpdateScrapbookImage = (input) =>
  parseWith(updateScrapbookImageSchema, input)
const parseReorderScrapbookImages = (input) =>
  parseWith(reorderImagesSchema, input)

const isJournalId = (value) => isUuid(value)

module.exports = {
  UUID_PATTERN,
  isUuid,
  isJournalId,
  imageAltTextSchema,
  captionSchema,
  takenAtSchema,
  journalIdSchema,
  journalIdParamsSchema,
  imageIdParamsSchema,
  createScrapbookImageSchema,
  updateScrapbookImageSchema,
  reorderImagesSchema,
  parseWith,
  parseJournalId,
  parseImageId,
  parseCreateScrapbookImage,
  parseUpdateScrapbookImage,
  parseReorderScrapbookImages,
}
