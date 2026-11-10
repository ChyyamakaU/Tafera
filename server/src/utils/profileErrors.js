'use strict'

const { AuthError } = require('./authErrors')

// Missing and suspended users receive the same response so public profile
// lookups cannot be used to enumerate account state.
class ProfileNotFoundError extends AuthError {
  constructor() {
    super({
      message: 'Profile not found.',
      code: 'PROFILE_NOT_FOUND',
      status: 404,
    })
    this.name = 'ProfileNotFoundError'
  }
}

module.exports = {
  ProfileNotFoundError,
}
