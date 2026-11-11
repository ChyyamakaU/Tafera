'use strict'

const { toDestinationSummary } = require('./safeDestination')
const { toPublicProfile } = require('./safeUser')

// Explicit allowlist for post responses. Ownership columns, the destination
// foreign key and any future sensitive post fields stay out of the payload by
// construction.
const PUBLIC_POST_FIELDS = Object.freeze([
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

// Draft destinations must never leak through a post. The query layer should
// already filter on publication, but this check keeps the serializer safe if a
// draft row is attached by mistake.
const toPostDestination = (destination) => {
  const source = toPlain(destination)

  if (!source || source.status !== 'published') return null

  return toDestinationSummary(source)
}

const toPost = (post) => {
  const source = toPlain(post)

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
    destination: toPostDestination(source.destination),
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  }
}

module.exports = {
  PUBLIC_POST_FIELDS,
  toPost,
}
