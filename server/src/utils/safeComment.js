'use strict'

const { toPublicProfile } = require('./safeUser')

// Explicit allowlist for comment responses. The post foreign key is omitted
// because comments are always returned in the context of their post.
const PUBLIC_COMMENT_FIELDS = Object.freeze([
  'id',
  'content',
  'createdAt',
  'updatedAt',
])

const toPlain = (value) => {
  if (!value || typeof value !== 'object') return null

  return typeof value.get === 'function'
    ? value.get({ plain: true })
    : value
}

const toComment = (comment) => {
  const source = toPlain(comment)

  if (!source) return null

  // Defence in depth for the public-content rule. Services still filter
  // suspended authors; this prevents a mistakenly included row from exposing
  // their content or profile.
  const author = toPlain(source.author)

  if (author && author.status && author.status !== 'active') {
    return null
  }

  return {
    id: source.id,
    content: source.content,
    author: toPublicProfile(author),
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  }
}

module.exports = {
  PUBLIC_COMMENT_FIELDS,
  toComment,
}
