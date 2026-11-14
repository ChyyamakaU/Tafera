'use strict'

const { AuthError } = require('./authErrors')

// Missing and unpublished scrapbook journals receive the same response so
// public lookups cannot be used to enumerate private content.
class ScrapbookNotFoundError extends AuthError {
  constructor() {
    super({
      message: 'Journal not found.',
      code: 'SCRAPBOOK_NOT_FOUND',
      status: 404,
    })
    this.name = 'ScrapbookNotFoundError'
  }
}

class ScrapbookImageNotFoundError extends AuthError {
  constructor() {
    super({
      message: 'Image not found.',
      code: 'SCRAPBOOK_IMAGE_NOT_FOUND',
      status: 404,
    })
    this.name = 'ScrapbookImageNotFoundError'
  }
}

class ScrapbookImageLimitExceededError extends AuthError {
  constructor() {
    super({
      message: 'Maximum number of images reached for this journal.',
      code: 'SCRAPBOOK_IMAGE_LIMIT_EXCEEDED',
      status: 409,
    })
    this.name = 'ScrapbookImageLimitExceededError'
  }
}

module.exports = {
  ScrapbookImageLimitExceededError,
  ScrapbookImageNotFoundError,
  ScrapbookNotFoundError,
}
