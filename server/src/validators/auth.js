'use strict'

const { z } = require('zod')
const { PASSWORD_MAX_LENGTH } = require('../config/password')
const { passwordSchema } = require('./password')
const { ValidationError } = require('../utils/authErrors')

const emailSchema = z
  .string({ message: 'Email must be a string.' })
  .trim()
  .min(1, 'Email is required.')
  .max(254, 'Email must be at most 254 characters long.')
  .email('Enter a valid email address.')
  .transform((value) => value.toLowerCase())

const fullNameSchema = z
  .string({ message: 'Full name must be a string.' })
  .trim()
  .min(2, 'Full name must be at least 2 characters long.')
  .max(100, 'Full name must be at most 100 characters long.')

const loginPasswordSchema = z
  .string({ message: 'Password must be a string.' })
  .min(1, 'Password is required.')
  .max(
    PASSWORD_MAX_LENGTH,
    `Password must be at most ${PASSWORD_MAX_LENGTH} characters long.`,
  )

const registrationSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  password: passwordSchema,
})

const loginSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
})

const formatIssues = (issues) =>
  issues.map((issue) => ({
    field: issue.path.join('.') || 'request',
    message: issue.message,
  }))

const parseWith = (schema, input) => {
  const result = schema.safeParse(input === undefined ? {} : input)

  if (!result.success) {
    throw new ValidationError(formatIssues(result.error.issues))
  }

  // Zod strips unknown keys by default, so protected fields such as role,
  // status and authVersion can never reach the service.
  return result.data
}

const parseRegistration = (input) => parseWith(registrationSchema, input)
const parseLogin = (input) => parseWith(loginSchema, input)

module.exports = {
  emailSchema,
  fullNameSchema,
  registrationSchema,
  loginSchema,
  parseRegistration,
  parseLogin,
}
