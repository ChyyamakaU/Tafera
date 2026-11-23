#!/usr/bin/env node
'use strict'

const path = require('node:path')
const { z } = require('zod')

// Load server/.env without failing if the file does not exist (e.g., in CI or
// containerised environments where variables are injected directly).
require('dotenv').config({
  path: path.resolve(__dirname, '../../.env'),
  quiet: true,
})

const { emailSchema, fullNameSchema } = require('../validators/auth')
const { passwordSchema } = require('../validators/password')

const DEFAULT_ADMIN_NAME = 'Tafera Administrator'

const emptyToUndefined = (value) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

const optionalUsernameSchema = z.preprocess(
  emptyToUndefined,
  z
    .string({ message: 'INITIAL_ADMIN_USERNAME must be a string.' })
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9_]{3,30}$/,
      'INITIAL_ADMIN_USERNAME must be 3–30 characters using letters, numbers, or underscores.',
    )
    .optional(),
)

const initialAdminEnvSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.preprocess(
    (value) => (emptyToUndefined(value) === undefined ? DEFAULT_ADMIN_NAME : value),
    fullNameSchema,
  ),
  username: optionalUsernameSchema,
})

class InitialAdminValidationError extends Error {
  constructor(issues) {
    const lines = issues.map((issue) => `  - ${issue.envVar}: ${issue.message}`)
    super(['Invalid initial admin environment configuration:', ...lines].join('\n'))
    this.name = 'InitialAdminValidationError'
    this.issues = issues
  }
}

const ENV_VAR_MAP = {
  email: 'INITIAL_ADMIN_EMAIL',
  password: 'INITIAL_ADMIN_PASSWORD',
  fullName: 'INITIAL_ADMIN_NAME',
  username: 'INITIAL_ADMIN_USERNAME',
}

/**
 * Validates INITIAL_ADMIN_* environment variables strictly before any database
 * work occurs. Never echoes or embeds INITIAL_ADMIN_PASSWORD in error messages.
 */
const validateInitialAdminEnv = (env = process.env) => {
  const rawEmail = env?.INITIAL_ADMIN_EMAIL
  const rawPassword = env?.INITIAL_ADMIN_PASSWORD

  const missingIssues = []
  if (typeof rawEmail !== 'string' || rawEmail.trim() === '') {
    missingIssues.push({
      field: 'email',
      envVar: 'INITIAL_ADMIN_EMAIL',
      message: 'INITIAL_ADMIN_EMAIL is required.',
    })
  }
  if (typeof rawPassword !== 'string' || rawPassword.length === 0) {
    missingIssues.push({
      field: 'password',
      envVar: 'INITIAL_ADMIN_PASSWORD',
      message: 'INITIAL_ADMIN_PASSWORD is required.',
    })
  }
  if (missingIssues.length > 0) {
    throw new InitialAdminValidationError(missingIssues)
  }

  const parsed = initialAdminEnvSchema.safeParse({
    email: rawEmail,
    password: rawPassword,
    fullName: env?.INITIAL_ADMIN_NAME,
    username: env?.INITIAL_ADMIN_USERNAME,
  })

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => {
      const field = issue.path[0] || 'request'
      return {
        field,
        envVar: ENV_VAR_MAP[field] || String(field),
        message: issue.message,
      }
    })
    throw new InitialAdminValidationError(issues)
  }

  return {
    email: parsed.data.email,
    password: parsed.data.password,
    fullName: parsed.data.fullName,
    username: parsed.data.username ?? null,
  }
}

/**
 * One-time idempotent bootstrap for the first administrator account.
 *
 * - Aborts safely if any user with role === 'admin' already exists.
 * - Promotes an existing regular user matching INITIAL_ADMIN_EMAIL to admin
 *   and ensures emailVerifiedAt is set.
 * - Otherwise creates a new verified admin account using the app's Argon2id
 *   password hashing service.
 */
const bootstrapInitialAdmin = async ({
  env = process.env,
  User,
  passwords,
  now = () => new Date(),
  logger = console,
} = {}) => {
  // Always validate env variables before touching the database.
  const config = validateInitialAdminEnv(env)

  const userModel = User || require('../models').User
  const passwordSvc = passwords || require('../services/passwordService')

  // Safeguard: never create a second admin via this bootstrap script.
  const existingAdmin = await userModel.findOne({
    where: { role: 'admin' },
    attributes: ['id', 'email'],
  })

  if (existingAdmin) {
    logger.log(
      'Initial admin bootstrap skipped: an administrator account already exists.',
    )
    return {
      outcome: 'aborted_admin_exists',
      created: false,
      promoted: false,
    }
  }

  // Check if a regular account already exists for INITIAL_ADMIN_EMAIL.
  const existingUser = await userModel.findOne({
    where: { email: config.email },
  })

  if (existingUser) {
    const verifiedAt = existingUser.emailVerifiedAt || now()
    await existingUser.update({
      role: 'admin',
      status: 'active',
      emailVerifiedAt: verifiedAt,
    })

    logger.log(
      `Promoted existing account (${existingUser.email}) to administrator with verified email.`,
    )
    return {
      outcome: 'promoted_existing_user',
      created: false,
      promoted: true,
      user: {
        id: existingUser.id,
        email: existingUser.email,
        fullName: existingUser.fullName,
        username: existingUser.username ?? null,
        role: existingUser.role,
        status: existingUser.status,
        emailVerified: existingUser.emailVerifiedAt !== null,
      },
    }
  }

  // Ensure optional username does not collide before hashing/creating.
  if (config.username) {
    const usernameOwner = await userModel.findOne({
      where: { username: config.username },
      attributes: ['id'],
    })
    if (usernameOwner) {
      throw new Error(
        `INITIAL_ADMIN_USERNAME "${config.username}" is already taken by another account.`,
      )
    }
  }

  const passwordHash = await passwordSvc.hashPassword(config.password)
  const verifiedAt = now()

  const created = await userModel.create({
    fullName: config.fullName,
    username: config.username,
    email: config.email,
    passwordHash,
    role: 'admin',
    status: 'active',
    authVersion: 1,
    emailVerifiedAt: verifiedAt,
  })

  logger.log(
    `Created initial administrator account (${created.email}) with verified email.`,
  )

  return {
    outcome: 'created_admin',
    created: true,
    promoted: false,
    user: {
      id: created.id,
      email: created.email,
      fullName: created.fullName,
      username: created.username ?? null,
      role: created.role,
      status: created.status,
      emailVerified: created.emailVerifiedAt !== null,
    },
  }
}

const main = async () => {
  let sequelize
  try {
    // Validate environment credentials before loading Sequelize / opening DB.
    validateInitialAdminEnv(process.env)

    const models = require('../models')
    sequelize = models.sequelize
    await sequelize.authenticate()

    await bootstrapInitialAdmin({
      env: process.env,
      User: models.User,
    })
  } catch (err) {
    // Never log raw password values; print only safe error messages.
    console.error(err?.message || 'Failed to bootstrap initial admin account.')
    process.exitCode = 1
  } finally {
    if (sequelize) {
      await sequelize.close().catch(() => {})
    }
  }
}

if (require.main === module) {
  main()
}

module.exports = {
  DEFAULT_ADMIN_NAME,
  InitialAdminValidationError,
  validateInitialAdminEnv,
  bootstrapInitialAdmin,
  main,
}
