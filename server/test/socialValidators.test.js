'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { ValidationError } = require('../src/utils/authErrors')
const {
  COMMENT_CONTENT_MAX_LENGTH,
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  MAX_LIMIT,
  POST_CONTENT_MAX_LENGTH,
  parseCommentId,
  parseCreateComment,
  parseCreatePost,
  parsePaginationQuery,
  parsePostCommentParams,
  parsePostId,
  parseUpdateComment,
  parseUpdatePost,
  parseUserId,
} = require('../src/validators/social')

const USER_ID = '11111111-1111-4111-8111-111111111111'
const POST_ID = '22222222-2222-4222-8222-222222222222'
const COMMENT_ID = '33333333-3333-4333-8333-333333333333'
const DESTINATION_ID = '44444444-4444-4444-8444-444444444444'

const assertValidationError = (callback) => {
  let caught

  try {
    callback()
  } catch (error) {
    caught = error
  }

  assert.ok(caught instanceof ValidationError)
  assert.equal(caught.code, 'VALIDATION_ERROR')
  assert.equal(caught.status, 400)
  assert.equal(caught.expose, true)
  assert.ok(Array.isArray(caught.details))

  return caught
}

test('post content is trimmed and limited to 5000 characters', () => {
  assert.deepEqual(parseCreatePost({ content: '  Hello  ' }), {
    content: 'Hello',
  })

  const maximum = 'a'.repeat(POST_CONTENT_MAX_LENGTH)
  assert.equal(parseCreatePost({ content: maximum }).content, maximum)

  assertValidationError(() => parseCreatePost({ content: '   ' }))
  assertValidationError(() =>
    parseCreatePost({ content: 'a'.repeat(POST_CONTENT_MAX_LENGTH + 1) }),
  )
  assertValidationError(() => parseCreatePost({ content: 42 }))
  assertValidationError(() => parseCreatePost({}))
})

test('post payloads strip protected and unknown fields', () => {
  const parsed = parseCreatePost({
    content: 'A post',
    destinationId: DESTINATION_ID.toUpperCase(),
    id: 'attacker-controlled',
    userId: USER_ID,
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
    status: 'active',
  })

  assert.deepEqual(parsed, {
    content: 'A post',
    destinationId: DESTINATION_ID,
  })
  assert.equal(Object.hasOwn(parsed, 'userId'), false)
  assert.equal(Object.hasOwn(parsed, 'id'), false)
  assert.equal(Object.hasOwn(parsed, 'createdAt'), false)
})

test('post destination is optional and can be cleared', () => {
  assert.deepEqual(parseCreatePost({ content: 'No destination' }), {
    content: 'No destination',
  })
  assert.deepEqual(
    parseCreatePost({ content: 'Empty destination', destinationId: '' }),
    { content: 'Empty destination', destinationId: null },
  )
  assert.deepEqual(
    parseCreatePost({ content: 'Null destination', destinationId: null }),
    { content: 'Null destination', destinationId: null },
  )

  assertValidationError(() =>
    parseCreatePost({ content: 'Bad destination', destinationId: 'nope' }),
  )
})

test('post updates require at least one supported field', () => {
  assert.deepEqual(parseUpdatePost({ content: '  Edited  ' }), {
    content: 'Edited',
  })
  assert.deepEqual(parseUpdatePost({ destinationId: null }), {
    destinationId: null,
  })

  assertValidationError(() => parseUpdatePost({}))
  assertValidationError(() =>
    parseUpdatePost({ userId: USER_ID }),
  )
  assertValidationError(() => parseUpdatePost({ content: '   ' }))
})

test('comment content is trimmed and limited to 1000 characters', () => {
  assert.deepEqual(parseCreateComment({ content: '  Nice  ' }), {
    content: 'Nice',
  })

  const maximum = 'a'.repeat(COMMENT_CONTENT_MAX_LENGTH)
  assert.equal(parseCreateComment({ content: maximum }).content, maximum)

  assertValidationError(() => parseCreateComment({ content: '' }))
  assertValidationError(() =>
    parseCreateComment({
      content: 'a'.repeat(COMMENT_CONTENT_MAX_LENGTH + 1),
    }),
  )
  assert.deepEqual(
    parseCreateComment({ content: 'Nice', postId: POST_ID }),
    { content: 'Nice' },
  )
})

test('comment updates validate content and strip protected fields', () => {
  assert.deepEqual(parseUpdateComment({ content: 'Edited' }), {
    content: 'Edited',
  })

  const withoutProtected = parseUpdateComment({
    content: 'Edited',
    commentId: COMMENT_ID,
    userId: USER_ID,
    createdAt: '2020-01-01T00:00:00.000Z',
  })
  assert.deepEqual(withoutProtected, { content: 'Edited' })

  assertValidationError(() => parseUpdateComment({}))
})

test('pagination defaults and caps follow the API contract', () => {
  assert.deepEqual(parsePaginationQuery({}), {
    page: DEFAULT_PAGE,
    limit: DEFAULT_LIMIT,
  })
  assert.deepEqual(parsePaginationQuery({ page: '3', limit: '50' }), {
    page: 3,
    limit: 50,
  })
  assert.deepEqual(
    parsePaginationQuery({ page: '2', limit: '10', sort: 'newest' }),
    { page: 2, limit: 10 },
  )

  assertValidationError(() => parsePaginationQuery({ page: '0' }))
  assertValidationError(() => parsePaginationQuery({ limit: '0' }))
  assertValidationError(() =>
    parsePaginationQuery({ limit: String(MAX_LIMIT + 1) }),
  )
  assertValidationError(() => parsePaginationQuery({ page: '1.5' }))
  assertValidationError(() => parsePaginationQuery({ limit: 'many' }))
})

test('UUID parameters are validated and normalized', () => {
  assert.deepEqual(parseUserId({ userId: USER_ID.toUpperCase() }), {
    userId: USER_ID,
  })
  assert.deepEqual(parsePostId({ postId: POST_ID }), {
    postId: POST_ID,
  })
  assert.deepEqual(parseCommentId({ commentId: COMMENT_ID }), {
    commentId: COMMENT_ID,
  })
  assert.deepEqual(
    parsePostCommentParams({
      postId: POST_ID.toUpperCase(),
      commentId: COMMENT_ID.toUpperCase(),
      userId: USER_ID,
    }),
    { postId: POST_ID, commentId: COMMENT_ID },
  )

  assertValidationError(() => parseUserId({ userId: 'not-a-uuid' }))
  assertValidationError(() => parsePostId({ postId: '' }))
  assertValidationError(() => parseCommentId({}))
  assertValidationError(() =>
    parsePostCommentParams({ postId: POST_ID }),
  )
})
