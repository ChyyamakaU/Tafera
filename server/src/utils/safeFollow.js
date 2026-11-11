'use strict'

const { toPublicProfile } = require('./safeUser')

// Follow responses expose the related public user and the follow timestamp
// only. Internal follow IDs and both ownership foreign keys stay private.
const PUBLIC_FOLLOW_FIELDS = Object.freeze(['user', 'followedAt'])

const toPlain = (value) => {
  if (!value || typeof value !== 'object') return null

  return typeof value.get === 'function'
    ? value.get({ plain: true })
    : value
}

const resolveRelatedUser = (source, relatedUser) =>
  toPlain(relatedUser) ||
  toPlain(source.user) ||
  toPlain(source.followingUser) ||
  toPlain(source.follower)

const toFollowRelationship = (follow, relatedUser) => {
  const source = toPlain(follow)

  if (!source) return null

  const user = resolveRelatedUser(source, relatedUser)

  // Defence in depth for the public-content rule. Services still filter
  // suspended users; this prevents a mistakenly included row from exposing
  // their profile.
  if (user && user.status && user.status !== 'active') {
    return null
  }

  return {
    user: toPublicProfile(user),
    followedAt: source.followedAt ?? source.createdAt ?? null,
  }
}

module.exports = {
  PUBLIC_FOLLOW_FIELDS,
  toFollowRelationship,
}
