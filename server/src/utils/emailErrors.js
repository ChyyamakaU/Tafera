'use strict'

// Email failures are safe to map to API errors, but messages never include the
// recipient address, verification token, provider response or transport error.
class EmailDeliveryUnavailableError extends Error {
  constructor() {
    super('Email delivery is not available right now. Please try again later.')
    this.name = 'EmailDeliveryUnavailableError'
    this.code = 'EMAIL_DELIVERY_UNAVAILABLE'
    this.status = 503
    this.expose = true
  }
}

module.exports = {
  EmailDeliveryUnavailableError,
}
