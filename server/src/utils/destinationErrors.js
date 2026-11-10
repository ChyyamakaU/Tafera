'use strict'

const { AuthError } = require('./authErrors')

// Missing and unpublished destinations receive the same response so public
// lookups cannot be used to enumerate draft content.
class DestinationNotFoundError extends AuthError {
  constructor() {
    super({
      message: 'Destination not found.',
      code: 'DESTINATION_NOT_FOUND',
      status: 404,
    })
    this.name = 'DestinationNotFoundError'
  }
}

module.exports = {
  DestinationNotFoundError,
}
