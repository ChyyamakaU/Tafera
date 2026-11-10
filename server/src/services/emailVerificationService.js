'use strict'

const { Op } = require('sequelize')
const EMAIL_VERIFICATION = require('../config/emailVerification')
const { emailService } = require('./emailService')
const {
  generateVerificationToken,
  hashVerificationToken,
  isWellFormedVerificationToken,
} = require('../utils/emailVerificationToken')
const { EmailDeliveryUnavailableError } = require('../utils/emailErrors')
const {
  AccountInactiveError,
  SessionInvalidError,
  VerificationTokenInvalidError,
  VerificationResendRateLimitedError,
} = require('../utils/authErrors')

const createEmailVerificationService = ({
  User,
  EmailVerificationToken,
  emails = emailService,
  tokenTtlMs = EMAIL_VERIFICATION.tokenTtlMs,
  resendCooldownMs = EMAIL_VERIFICATION.resendCooldownMs,
  now = () => new Date(),
} = {}) => {
  let resolvedModels = null

  const models = () => {
    if (!resolvedModels) {
      resolvedModels = require('../models')
    }

    return resolvedModels
  }

  const getUserModel = () => User || models().User
  const getTokenModel = () =>
    EmailVerificationToken || models().EmailVerificationToken
  const getSequelize = () => getUserModel().sequelize

  const issueToken = async ({ userId, enforceCooldown = false }) => {
    const currentTime = now()
    const expiresAt = new Date(currentTime.getTime() + tokenTtlMs)
    const rawToken = generateVerificationToken()
    const tokenHash = hashVerificationToken(rawToken)

    const result = await getSequelize().transaction(async (transaction) => {
      // Lock the user row so concurrent issue/resend requests for the same
      // account are serialised. Verification uses the same lock order.
      const user = await getUserModel().findByPk(userId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      })

      if (!user) {
        return { status: 'missing' }
      }

      if (user.status !== 'active') {
        return { status: 'inactive' }
      }

      if (user.emailVerifiedAt) {
        return { status: 'already_verified' }
      }

      if (enforceCooldown) {
        const latest = await getTokenModel().findOne({
          where: { userId: user.id },
          order: [['createdAt', 'DESC']],
          transaction,
        })

        if (latest) {
          const elapsed = currentTime.getTime() - latest.createdAt.getTime()

          if (elapsed < resendCooldownMs) {
            return {
              status: 'cooldown',
              retryAfterSeconds: Math.max(
                1,
                Math.ceil((resendCooldownMs - elapsed) / 1000),
              ),
            }
          }
        }
      }

      // Only one outstanding token is allowed per user. Previous tokens are
      // kept for the resend cooldown and audit history, but can no longer be
      // used once consumed_at is set.
      await getTokenModel().update(
        { consumedAt: currentTime },
        {
          where: { userId: user.id, consumedAt: null },
          transaction,
        },
      )

      await getTokenModel().create(
        {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
        { transaction },
      )

      return { status: 'issued', user, rawToken, expiresAt }
    })

    return result
  }

  // Registration calls this after the user and session exist. Delivery errors
  // are surfaced to the caller so the auth service can log them without
  // failing registration or leaving a half-created account.
  const sendInitialVerification = async (user) => {
    const result = await issueToken({ userId: user.id })

    if (result.status === 'already_verified') {
      return { sent: false, alreadyVerified: true }
    }

    if (result.status !== 'issued') {
      return { sent: false }
    }

    await emails.sendVerificationEmail({
      user: result.user,
      token: result.rawToken,
      expiresAt: result.expiresAt,
    })

    return { sent: true }
  }

  const resend = async (userId) => {
    // Check before invalidating the current token: if no transport exists, the
    // user keeps their previous link instead of being left with nothing.
    if (!emails.isConfigured()) {
      throw new EmailDeliveryUnavailableError()
    }

    const result = await issueToken({ userId, enforceCooldown: true })

    if (result.status === 'already_verified') {
      return { alreadyVerified: true, sent: false }
    }

    if (result.status === 'cooldown') {
      throw new VerificationResendRateLimitedError(
        result.retryAfterSeconds,
      )
    }

    if (result.status === 'missing') {
      throw new SessionInvalidError()
    }

    if (result.status === 'inactive') {
      throw new AccountInactiveError()
    }

    await emails.sendVerificationEmail({
      user: result.user,
      token: result.rawToken,
      expiresAt: result.expiresAt,
    })

    return { alreadyVerified: false, sent: true }
  }

  const verify = async (rawToken) => {
    if (!isWellFormedVerificationToken(rawToken)) {
      throw new VerificationTokenInvalidError()
    }

    const currentTime = now()
    const tokenHash = hashVerificationToken(rawToken)
    const tokenModel = getTokenModel()

    const candidate = await tokenModel.findOne({ where: { tokenHash } })

    if (
      !candidate ||
      candidate.consumedAt ||
      candidate.expiresAt.getTime() <= currentTime.getTime()
    ) {
      throw new VerificationTokenInvalidError()
    }

    const verifiedUser = await getSequelize().transaction(
      async (transaction) => {
        // Same lock order as issueToken: user first, then tokens.
        const user = await getUserModel().findByPk(candidate.userId, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        })

        if (!user || user.status !== 'active') {
          return null
        }

        const token = await tokenModel.findOne({
          where: {
            id: candidate.id,
            consumedAt: null,
            expiresAt: { [Op.gt]: currentTime },
          },
          transaction,
          lock: transaction.LOCK.UPDATE,
        })

        if (!token) {
          return null
        }

        await token.update({ consumedAt: currentTime }, { transaction })

        await tokenModel.update(
          { consumedAt: currentTime },
          {
            where: {
              userId: user.id,
              consumedAt: null,
              id: { [Op.ne]: token.id },
            },
            transaction,
          },
        )

        if (!user.emailVerifiedAt) {
          await user.update(
            { emailVerifiedAt: currentTime },
            { transaction },
          )
        }

        return user
      },
    )

    if (!verifiedUser) {
      throw new VerificationTokenInvalidError()
    }

    return { user: verifiedUser }
  }

  return {
    sendInitialVerification,
    resend,
    verify,
  }
}

module.exports = {
  createEmailVerificationService,
  emailVerificationService: createEmailVerificationService(),
}
