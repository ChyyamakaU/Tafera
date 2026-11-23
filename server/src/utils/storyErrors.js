'use strict'

const { AuthError } = require('./authErrors')

class StoryNotFoundError extends AuthError {
  constructor() {
    super({
      message: 'Traveller story not found.',
      code: 'STORY_NOT_FOUND',
      status: 404,
    })
    this.name = 'StoryNotFoundError'
  }
}

class StoryOrderConflictError extends AuthError {
  constructor() {
    super({
      message: 'The story order does not match the current stories.',
      code: 'STORY_ORDER_CONFLICT',
      status: 409,
    })
    this.name = 'StoryOrderConflictError'
  }
}

module.exports = {
  StoryNotFoundError,
  StoryOrderConflictError,
}
