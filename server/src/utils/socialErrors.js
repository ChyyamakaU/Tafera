'use strict'

const { AuthError } = require('./authErrors')
const { ProfileNotFoundError } = require('./profileErrors')

// Social resources are public, so denied mutations can safely return 403.
// Missing resources still return 404 without leaking ownership details.
class PostNotFoundError extends AuthError {
  constructor() {
    super({
      message: 'Post not found.',
      code: 'POST_NOT_FOUND',
      status: 404,
    })
    this.name = 'PostNotFoundError'
  }
}

class CommentNotFoundError extends AuthError {
  constructor() {
    super({
      message: 'Comment not found.',
      code: 'COMMENT_NOT_FOUND',
      status: 404,
    })
    this.name = 'CommentNotFoundError'
  }
}

class FollowExistsError extends AuthError {
  constructor() {
    super({
      message: 'You already follow this user.',
      code: 'FOLLOW_EXISTS',
      status: 409,
    })
    this.name = 'FollowExistsError'
  }
}

class FollowNotFoundError extends AuthError {
  constructor() {
    super({
      message: 'Follow relationship not found.',
      code: 'FOLLOW_NOT_FOUND',
      status: 404,
    })
    this.name = 'FollowNotFoundError'
  }
}

class PostAccessDeniedError extends AuthError {
  constructor() {
    super({
      message: 'You are not allowed to modify this post.',
      code: 'POST_ACCESS_DENIED',
      status: 403,
    })
    this.name = 'PostAccessDeniedError'
  }
}

class CommentAccessDeniedError extends AuthError {
  constructor() {
    super({
      message: 'You are not allowed to modify this comment.',
      code: 'COMMENT_ACCESS_DENIED',
      status: 403,
    })
    this.name = 'CommentAccessDeniedError'
  }
}

module.exports = {
  // Reuse the profile-domain error so PROFILE_NOT_FOUND has one canonical
  // implementation across public profiles and social lookups.
  ProfileNotFoundError,
  CommentAccessDeniedError,
  CommentNotFoundError,
  FollowExistsError,
  FollowNotFoundError,
  PostAccessDeniedError,
  PostNotFoundError,
}
