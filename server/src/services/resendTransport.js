'use strict'

const { Resend: DefaultResend } = require('resend')
const { EmailDeliveryUnavailableError } = require('../utils/emailErrors')

// Resend transport adapter for Tafera's provider-independent email service.
// Implements the send({ to, subject, text, html }) interface expected by
// createEmailService(). Provider errors are replaced with an opaque,
// safe EmailDeliveryUnavailableError so no API keys, recipient addresses,
// tokens or provider details leak into public responses.
const createResendTransport = ({
  apiKey,
  from,
  Resend = DefaultResend,
}) => {
  const resend = new Resend(apiKey)

  return {
    send: async ({ to, subject, text, html }) => {
      const { data, error } = await resend.emails.send({
        from,
        to,
        subject,
        text,
        html,
      })

      if (error) {
        throw new EmailDeliveryUnavailableError()
      }

      return data
    },
  }
}

module.exports = {
  createResendTransport,
}
