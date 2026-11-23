'use strict'

const { toDestinationSummary } = require('./safeDestination')
const { toPublicProfile } = require('./safeUser')

// Explicit allowlist for curated homepage stories. Internal curation metadata
// (createdBy, coverImagePublicId) stays out of API responses by construction.
const PUBLIC_STORY_FIELDS = Object.freeze([
  'id',
  'title',
  'excerpt',
  'badgeLabel',
  'authorName',
  'postId',
  'coverImageUrl',
  'coverImageAlt',
  'isFeatured',
  'displayOrder',
  'createdAt',
  'updatedAt',
])

const toPlain = (value) => {
  if (!value || typeof value !== 'object') return null

  return typeof value.get === 'function'
    ? value.get({ plain: true })
    : value
}

const toStoryDestination = (destination) => {
  const source = toPlain(destination)

  if (!source || source.status !== 'published') return null

  return toDestinationSummary(source)
}

const toStoryAuthor = (author) => {
  const source = toPlain(author)

  if (!source || (source.status && source.status !== 'active')) return null

  return toPublicProfile(source)
}

const toStory = (story) => {
  const source = toPlain(story)

  if (!source) return null

  return {
    id: source.id,
    title: source.title,
    excerpt: source.excerpt,
    badgeLabel: source.badgeLabel || 'Traveller spotlight',
    authorName: source.authorName,
    author: toStoryAuthor(source.author),
    destination: toStoryDestination(source.destination),
    postId: source.postId ?? null,
    coverImageUrl: source.coverImageUrl ?? null,
    coverImageAlt: source.coverImageAlt ?? null,
    isFeatured: Boolean(source.isFeatured),
    displayOrder: Number(source.displayOrder) || 0,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  }
}

module.exports = {
  PUBLIC_STORY_FIELDS,
  toStory,
}
