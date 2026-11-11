'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  PUBLIC_POST_FIELDS,
  toPost,
} = require('../src/utils/safePost')
const {
  PUBLIC_COMMENT_FIELDS,
  toComment,
} = require('../src/utils/safeComment')
const {
  PUBLIC_FOLLOW_FIELDS,
  toFollowRelationship,
} = require('../src/utils/safeFollow')

const AUTHOR = {
  id: '11111111-1111-4111-8111-111111111111',
  fullName: 'Ada Lovelace',
  email: 'ada@example.com',
  profileImage: 'https://example.com/ada.png',
  bio: 'Mathematician',
  role: 'user',
  status: 'active',
  authVersion: 7,
  emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
  passwordHash: 'secret-hash',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
}

const DESTINATION = {
  id: '44444444-4444-4444-8444-444444444444',
  name: 'Kyoto',
  slug: 'kyoto',
  country: 'Japan',
  state: 'Kyoto',
  location: 'Kyoto, Japan',
  latitude: '35.0116000',
  longitude: '135.7681000',
  description: 'Former imperial capital.',
  featured: true,
  status: 'published',
  createdAt: '2026-01-01T00:00:00.000Z',
}

const PUBLIC_AUTHOR_KEYS = [
  'bio',
  'createdAt',
  'fullName',
  'id',
  'profileImage',
]

const assertPublicAuthor = (author) => {
  assert.deepEqual(Object.keys(author).sort(), PUBLIC_AUTHOR_KEYS)
  assert.equal(author.email, undefined)
  assert.equal(author.role, undefined)
  assert.equal(author.status, undefined)
  assert.equal(author.authVersion, undefined)
  assert.equal(author.emailVerifiedAt, undefined)
  assert.equal(author.passwordHash, undefined)
}

test('post serialization uses an explicit allowlist and public author', () => {
  const post = toPost({
    id: '22222222-2222-4222-8222-222222222222',
    userId: AUTHOR.id,
    destinationId: DESTINATION.id,
    content: 'Hello world',
    status: 'draft',
    createdAt: '2026-01-03T00:00:00.000Z',
    updatedAt: '2026-01-04T00:00:00.000Z',
    author: AUTHOR,
    destination: DESTINATION,
  })

  assert.deepEqual(Object.keys(post).sort(), [
    ...PUBLIC_POST_FIELDS,
    'author',
    'destination',
  ].sort())
  assert.equal(post.id, '22222222-2222-4222-8222-222222222222')
  assert.equal(post.content, 'Hello world')
  assert.equal(post.userId, undefined)
  assert.equal(post.destinationId, undefined)
  assert.equal(post.status, undefined)
  assert.equal(post.destination.id, DESTINATION.id)
  assertPublicAuthor(post.author)
})

test('post serialization hides draft or missing destinations', () => {
  const post = toPost({
    id: '22222222-2222-4222-8222-222222222222',
    content: 'Hello',
    author: AUTHOR,
    destination: { ...DESTINATION, status: 'draft' },
  })

  assert.equal(post.destination, null)

  const withoutDestination = toPost({
    id: '22222222-2222-4222-8222-222222222222',
    content: 'Hello',
    author: AUTHOR,
    destination: null,
  })

  assert.equal(withoutDestination.destination, null)
})

test('post and comment serialization hides suspended authors', () => {
  const suspended = { ...AUTHOR, status: 'suspended' }

  assert.equal(
    toPost({
      id: '22222222-2222-4222-8222-222222222222',
      content: 'Hidden',
      author: suspended,
    }),
    null,
  )
  assert.equal(
    toComment({
      id: '33333333-3333-4333-8333-333333333333',
      content: 'Hidden',
      author: suspended,
    }),
    null,
  )
})

test('comment serialization omits post and ownership keys', () => {
  const comment = toComment({
    id: '33333333-3333-4333-8333-333333333333',
    postId: '22222222-2222-4222-8222-222222222222',
    userId: AUTHOR.id,
    content: 'Nice post',
    createdAt: '2026-01-05T00:00:00.000Z',
    updatedAt: '2026-01-06T00:00:00.000Z',
    author: AUTHOR,
  })

  assert.deepEqual(Object.keys(comment).sort(), [
    ...PUBLIC_COMMENT_FIELDS,
    'author',
  ].sort())
  assert.equal(comment.postId, undefined)
  assert.equal(comment.userId, undefined)
  assertPublicAuthor(comment.author)
})

test('follow serialization exposes only the public user and followedAt', () => {
  const follow = toFollowRelationship(
    {
      id: '55555555-5555-4555-8555-555555555555',
      followerId: '66666666-6666-4666-8666-666666666666',
      followingId: AUTHOR.id,
      createdAt: '2026-01-07T00:00:00.000Z',
      followingUser: AUTHOR,
    },
    AUTHOR,
  )

  assert.deepEqual(Object.keys(follow).sort(), [
    ...PUBLIC_FOLLOW_FIELDS,
  ].sort())
  assert.equal(follow.id, undefined)
  assert.equal(follow.followerId, undefined)
  assert.equal(follow.followingId, undefined)
  assert.equal(follow.followedAt, '2026-01-07T00:00:00.000Z')
  assertPublicAuthor(follow.user)
})

test('follow serialization prefers followedAt and resolves nested users', () => {
  const follow = toFollowRelationship({
    createdAt: '2026-01-07T00:00:00.000Z',
    followedAt: '2026-01-08T00:00:00.000Z',
    follower: AUTHOR,
  })

  assert.equal(follow.followedAt, '2026-01-08T00:00:00.000Z')
  assert.deepEqual(follow.user, {
    id: AUTHOR.id,
    fullName: AUTHOR.fullName,
    profileImage: AUTHOR.profileImage,
    bio: AUTHOR.bio,
    createdAt: AUTHOR.createdAt,
  })
})

test('follow serialization hides suspended users', () => {
  assert.equal(
    toFollowRelationship(
      { createdAt: '2026-01-07T00:00:00.000Z' },
      { ...AUTHOR, status: 'suspended' },
    ),
    null,
  )
})

test('serializers support Sequelize-style model instances', () => {
  const instance = {
    get: () => ({
      id: '22222222-2222-4222-8222-222222222222',
      content: 'From a model',
      author: AUTHOR,
      createdAt: '2026-01-03T00:00:00.000Z',
      updatedAt: '2026-01-03T00:00:00.000Z',
    }),
  }

  assert.equal(toPost(instance).content, 'From a model')
  assert.equal(toPost(null), null)
  assert.equal(toComment(null), null)
  assert.equal(toFollowRelationship(null), null)
})
