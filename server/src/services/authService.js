/* eslint-disable no-undef */
'use strict'

const env = require('../config/env')
const passwordService = require('./passwordService')
const sessionService = require('./sessionService')
const {
  emailVerificationService,
} = require('./emailVerificationService')
const { toPublicUser } = require('../utils/safeUser')
const { getCsrfToken } = require('../utils/csrf')
const { logSecurityEvent } = require('../utils/securityLog')
const { SessionStoreUnavailableError } = require('../utils/sessionErrors')
const {
  EmailInUseError,
  InvalidCredentialsError,
  AccountInactiveError,
} = require('../utils/authErrors')

const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$sFnQNpdPu9GxoLznhPvjCA$AQOaU8UHZB3fbeYdsTe2XfVX3W5RabpuHbfPvryAH7A'

const normalizeEmail = (email) => email.trim().toLowerCase()

const createAuthService = ({
  User,
  passwords = passwordService,
  sessions = sessionService,
  verifications = emailVerificationService,
  nodeEnv = env.NODE_ENV,
  now = () => Date.now(),
} = {}) => {
  // Load the model registry lazily when no model is supplied so unit tests can
  // inject an isolated model without opening the default database connection.
  const userModel = User || require('../models').User

  const register = async ({ fullName, email, password }, { req, res }) => {
    const normalizedEmail = normalizeEmail(email)

    const existing = await userModel.findOne({
      where: { email: normalizedEmail },
      attributes: ['id'],
    })

    if (existing) {
      throw new EmailInUseError()
    }

    const passwordHash = await passwords.hashPassword(password)

    let user

    try {
      user = await userModel.create({
        fullName,
        email: normalizedEmail,
        passwordHash,
        // Public registration never reads role/status/authVersion from input.
        role: 'user',
        status: 'active',
        authVersion: 1,
      })
    } catch (err) {
      if (err.name === 'SequelizeUniqueConstraintError') {
        throw new EmailInUseError()
      }

      throw err
    }

    try {
      await sessions.createAuthenticatedSession(req, user, {
        res,
        nodeEnv,
        now: now(),
      })
    } catch (err) {
      // Do not leave an account that the client was told was not created. If
      // cleanup itself fails, the unique email still prevents duplicates.
      try {
        await user.destroy()
      } catch {
        logSecurityEvent(
          'auth_registration_cleanup_failed',
          { operation: 'destroy_user', outcome: 'failure' },
          'error',
        )
      }

      throw err
    }

    try {
      await verifications.sendInitialVerification(user)
    } catch (err) {
      // Email delivery is deliberately non-fatal for registration. The account
      // and session are already valid, and the user can request another email
      // once delivery is configured or recovers.
      logSecurityEvent(
        'email_verification_delivery_failed',
        {
          operation: 'registration',
          outcome: 'failure',
          errorCode:
            err.code || err.name || 'EMAIL_VERIFICATION_ERROR',
        },
        'warn',
      )
    }

    logSecurityEvent('auth_register', {
      role: user.role,
      outcome: 'success',
    })

    return {
      user: toPublicUser(user),
      csrfToken: getCsrfToken(req.session),
    }
  }

  const login = async ({ email, password }, { req, res }) => {
    const normalizedEmail = normalizeEmail(email)

    const user = await userModel
      .scope('withPassword')
      .findOne({ where: { email: normalizedEmail } })

    let passwordMatches = false

    if (user && typeof user.passwordHash === 'string') {
      passwordMatches = await passwords.verifyPassword(
        password,
        user.passwordHash,
      )
    } else {
      // Perform the same Argon2 work for unknown accounts so response timing
      // does not reveal whether an email exists.
      await passwords.verifyPassword(password, DUMMY_PASSWORD_HASH)
    }

    if (!user || !passwordMatches) {
      logSecurityEvent('auth_login_failed', {
        reason: 'invalid_credentials',
        outcome: 'failure',
      })
      throw new InvalidCredentialsError()
    }

    if (user.status !== 'active') {
      logSecurityEvent('auth_login_failed', {
        reason: 'inactive_account',
        outcome: 'failure',
      })
      throw new AccountInactiveError()
    }

    await sessions.createAuthenticatedSession(req, user, {
      res,
      nodeEnv,
      now: now(),
    })

    logSecurityEvent('auth_login', {
      role: user.role,
      outcome: 'success',
    })

    return {
      user: toPublicUser(user),
      csrfToken: getCsrfToken(req.session),
    }
  }

  const logout = async ({ req, res }) => {
    const hadAuthenticatedSession = Boolean(
      req.session && req.session.userId,
    )

    const result = await sessions.destroySession(req, { res, nodeEnv })

    if (hadAuthenticatedSession && !result.destroyed) {
      logSecurityEvent('auth_logout_failed', {
        operation: 'destroy',
        outcome: 'failure',
      })
      throw new SessionStoreUnavailableError()
    }

    logSecurityEvent('auth_logout', {
      outcome: result.destroyed ? 'success' : 'no_session',
    })

    return result
  }

  return {
    register,
    login,
    logout,
  }
}

module.exports = {
  DUMMY_PASSWORD_HASH,
  createAuthService,
}
