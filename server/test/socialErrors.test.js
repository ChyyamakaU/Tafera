'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { AuthError } = require('../src/utils/authErrors')
const {
  ProfileNotFoundError: ProfileErrorSource,
} = require('../src/utils/profileErrors')
const {
  CommentAccessDeniedError,
  CommentNotFoundError,
  FollowExistsError,
  FollowNotFoundError,
  PostAccessDeniedError,
  PostNotFoundError,
  ProfileNotFoundError,
} = require('../src/utils/socialErrors')

const CASES = [
  [PostNotFoundError, 'PostNotFoundError', 'POST_NOT_FOUND', 404],
  [
    CommentNotFoundError,
    'CommentNotFoundError',
    'COMMENT_NOT_FOUND',
    404,
  ],
  [FollowExistsError, 'FollowExistsError', 'FOLLOW_EXISTS', 409],
  [
    FollowNotFoundError,
    'FollowNotFoundError',
    'FOLLOW_NOT_FOUND',
    404,
  ],
  [
    PostAccessDeniedError,
    'PostAccessDeniedError',
    'POST_ACCESS_DENIED',
    403,
  ],
  [
    CommentAccessDeniedError,
    'CommentAccessDeniedError',
    'COMMENT_ACCESS_DENIED',
    403,
  ],
]

for (const [ErrorClass, name, code, status] of CASES) {
  test(`${name} exposes its social error contract`, () => {
    const error = new ErrorClass()

    assert.ok(error instanceof AuthError)
    assert.ok(error instanceof Error)
    assert.equal(error.name, name)
    assert.equal(error.code, code)
    assert.equal(error.status, status)
    assert.equal(error.expose, true)
    assert.equal(typeof error.message, 'string')
    assert.ok(error.message.length > 0)
    assert.doesNotMatch(error.message, /password|token|session/i)
  })
}

test('social errors reuse the canonical profile-not-found error', () => {
  const error = new ProfileNotFoundError()

  assert.equal(ProfileNotFoundError, ProfileErrorSource)
  assert.ok(error instanceof AuthError)
  assert.equal(error.name, 'ProfileNotFoundError')
  assert.equal(error.code, 'PROFILE_NOT_FOUND')
  assert.equal(error.status, 404)
  assert.equal(error.expose, true)
})
