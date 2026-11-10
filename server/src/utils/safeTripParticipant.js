'use strict'

const { toPublicProfile } = require('./safeUser')

// Explicit allowlist for participation responses. Ownership columns and any
// future sensitive participant fields stay out of the payload by construction.
const PUBLIC_TRIP_PARTICIPANT_FIELDS = Object.freeze([
  'id',
  'status',
  'joinedAt',
  'createdAt',
  'updatedAt',
])

const toPlain = (value) => {
  if (!value || typeof value !== 'object') return null

  return typeof value.get === 'function'
    ? value.get({ plain: true })
    : value
}

const toTripParticipant = (participant) => {
  const source = toPlain(participant)

  if (!source) return null

  return {
    id: source.id,
    status: source.status,
    joinedAt: source.joinedAt ?? null,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
    user: source.participant
      ? toPublicProfile(source.participant)
      : null,
  }
}

module.exports = {
  PUBLIC_TRIP_PARTICIPANT_FIELDS,
  toTripParticipant,
}
