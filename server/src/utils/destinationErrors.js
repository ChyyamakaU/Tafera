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

class DestinationImageNotFoundError extends AuthError {
  constructor() {
    super({
      message: 'Image not found.',
      code: 'DESTINATION_IMAGE_NOT_FOUND',
      status: 404,
    })
    this.name = 'DestinationImageNotFoundError'
  }
}

class InvalidImageFileError extends AuthError {
  constructor() {
    super({
      message: 'Invalid image file.',
      code: 'INVALID_IMAGE_FILE',
      status: 400,
    })
    this.name = 'InvalidImageFileError'
  }
}

class DestinationImageLimitExceededError extends AuthError {
  constructor() {
    super({
      message: 'Maximum number of images reached for this destination.',
      code: 'DESTINATION_IMAGE_LIMIT_EXCEEDED',
      status: 409,
    })
    this.name = 'DestinationImageLimitExceededError'
  }
}

class CloudinaryUploadError extends AuthError {
  constructor() {
    super({
      message: 'Failed to upload image.',
      code: 'CLOUDINARY_UPLOAD_ERROR',
      status: 500,
    })
    this.name = 'CloudinaryUploadError'
  }
}

class CloudinaryDeleteError extends AuthError {
  constructor() {
    super({
      message: 'Failed to delete image.',
      code: 'CLOUDINARY_DELETE_ERROR',
      status: 500,
    })
    this.name = 'CloudinaryDeleteError'
  }
}

module.exports = {
  CloudinaryDeleteError,
  CloudinaryUploadError,
  DestinationImageLimitExceededError,
  DestinationImageNotFoundError,
  DestinationNotFoundError,
  InvalidImageFileError,
}
