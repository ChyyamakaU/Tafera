'use strict'

const env = require('../config/env')
const EMAIL_VERIFICATION = require('../config/emailVerification')
const { EmailDeliveryUnavailableError } = require('../utils/emailErrors')
const { createResendTransport } = require('./resendTransport')

const buildVerificationUrl = ({
  token,
  clientUrl = env.CLIENT_URL,
  path = EMAIL_VERIFICATION.frontendPath,
}) => {
  const base = clientUrl.replace(/\/+$/, '')
  return `${base}${path}?token=${encodeURIComponent(token)}`
}

// Delivery is deliberately provider-independent. A transport is any object
// with an async send({ to, subject, text, html }) method. When both
// RESEND_API_KEY and EMAIL_FROM are configured, a Resend transport is used.
// Otherwise the default transport is absent and email delivery is reported
// as unconfigured rather than silently pretending to deliver mail.
let resendTransport = null
if (env.RESEND_API_KEY && env.EMAIL_FROM) {
  try {
    resendTransport = createResendTransport({
      apiKey: env.RESEND_API_KEY,
      from: env.EMAIL_FROM,
    })
  } catch {
    // Resend could not be initialised; stay unconfigured rather than
    // failing to start.
    resendTransport = null
  }
}

const createEmailService = ({
  transport = resendTransport,
  clientUrl = env.CLIENT_URL,
} = {}) => {
  const isConfigured = () =>
    Boolean(transport) && typeof transport.send === 'function'

  const sendVerificationEmail = async ({ user, token }) => {
    if (!isConfigured()) {
      throw new EmailDeliveryUnavailableError()
    }

    const verificationUrl = buildVerificationUrl({ token, clientUrl })

    try {
      await transport.send({
        to: user.email,
        subject: 'Verify your Tafera email address',
        text: [
          'Verify your Tafera email address by opening this link:',
          '',
          verificationUrl,
          '',
          'If you did not create a Tafera account, you can ignore this email.',
        ].join('\n'),
        html: [
          '<p>Verify your Tafera email address by opening this link:</p>',
          `<p><a href="${verificationUrl}">Verify email</a></p>`,
          '<p>If you did not create a Tafera account, you can ignore this email.</p>',
        ].join(''),
      })
    } catch {
      // Provider errors can contain addresses, URLs or credentials. Replace
      // them with an opaque, safe error.
      throw new EmailDeliveryUnavailableError()
    }
  }

  return {
    isConfigured,
    sendVerificationEmail,
  }
}

const emailService = createEmailService()

module.exports = {
  buildVerificationUrl,
  createEmailService,
  emailService,
}
