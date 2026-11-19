'use strict'

const { EmailDeliveryUnavailableError } = require('../utils/emailErrors')

// Brevo transport adapter for Tafera's provider-independent email service.
// Implements the send({ to, subject, text, html }) interface expected by
// createEmailService(). Provider errors are replaced with an opaque,
// safe EmailDeliveryUnavailableError so no API keys, recipient addresses,
// tokens or provider details leak into public responses.
const createBrevoTransport = ({ apiKey, from }) => {
  return {
    send: async ({ to, subject, text, html }) => {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { email: from },
          to: [{ email: to }],
          subject,
          textContent: text,
          htmlContent: html,
        }),
      })

      const body = await response.json()

      if (!response.ok) {
        throw new EmailDeliveryUnavailableError()
      }

      return body
    },
  }
}

module.exports = {
  createBrevoTransport,
}
