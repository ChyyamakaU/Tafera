'use strict'

const { toPublicProfile } = require('./safeUser')

// Explicit allowlist for notification responses. Ownership columns, actor
// foreign keys and any future internal notification fields stay out of the
// payload by construction.
const PUBLIC_NOTIFICATION_FIELDS = Object.freeze([
  'id',
  'type',
  'message',
  'referenceType',
  'referenceId',
  'isRead',
  'readAt',
  'createdAt',
])

const toPlain = (value) => {
  if (!value || typeof value !== 'object') return null

  return typeof value.get === 'function'
    ? value.get({ plain: true })
    : value
}

// Notifications remain useful when their actor is gone or suspended, so the
// actor is omitted without hiding the notification itself. Services should
// still filter suspended actors at the query level; this is defence in depth.
const toNotificationActor = (actor) => {
  const source = toPlain(actor)

  if (!source) return null
  if (source.status && source.status !== 'active') return null

  return toPublicProfile(source)
}

const toNotification = (notification) => {
  const source = toPlain(notification)

  if (!source) return null

  return {
    id: source.id,
    type: source.type,
    message: source.message,
    referenceType: source.referenceType,
    referenceId: source.referenceId,
    isRead: source.isRead,
    readAt: source.readAt,
    createdAt: source.createdAt,
    actor: toNotificationActor(source.actor),
  }
}

module.exports = {
  PUBLIC_NOTIFICATION_FIELDS,
  toNotification,
}
