'use strict'

const { ValidationError } = require('../utils/authErrors')

const SUPPORTED_NOTIFICATION_TYPES = Object.freeze([
  'new_follower',
  'post_comment',
  'trip_join_request',
  'trip_join_approved',
  'trip_join_rejected',
])

const NOTIFICATION_REFERENCE_TYPES = Object.freeze([
  'user',
  'post',
  'comment',
  'trip',
])

const supportedTypeSet = new Set(SUPPORTED_NOTIFICATION_TYPES)
const referenceTypeSet = new Set(NOTIFICATION_REFERENCE_TYPES)

const isNonEmptyString = (value) =>
  typeof value === 'string' && value.trim().length > 0

const hasValue = (value) => value !== null && value !== undefined

const createNotificationCreationService = ({ Notification } = {}) => {
  const notificationModel =
    Notification || require('../models').Notification

  const createNotification = async ({
    recipientId,
    actorId,
    type,
    message,
    referenceType = null,
    referenceId = null,
    transaction,
  } = {}) => {
    const issues = []
    const hasReferenceType = hasValue(referenceType)
    const hasReferenceId = hasValue(referenceId)

    if (!isNonEmptyString(recipientId)) {
      issues.push({
        field: 'recipientId',
        message: 'Recipient ID is required.',
      })
    }

    if (!isNonEmptyString(actorId)) {
      issues.push({
        field: 'actorId',
        message: 'Actor ID is required.',
      })
    }

    if (!isNonEmptyString(type)) {
      issues.push({
        field: 'type',
        message: 'Notification type is required.',
      })
    } else if (!supportedTypeSet.has(type)) {
      issues.push({
        field: 'type',
        message: 'Unsupported notification type.',
      })
    }

    if (!isNonEmptyString(message)) {
      issues.push({
        field: 'message',
        message: 'Message is required.',
      })
    }

    if (hasReferenceType !== hasReferenceId) {
      issues.push({
        field: hasReferenceType ? 'referenceId' : 'referenceType',
        message:
          'Reference type and reference ID must both be set or both be null.',
      })
    } else if (hasReferenceType) {
      if (!referenceTypeSet.has(referenceType)) {
        issues.push({
          field: 'referenceType',
          message: 'Unsupported reference type.',
        })
      }

      if (!isNonEmptyString(referenceId)) {
        issues.push({
          field: 'referenceId',
          message: 'Reference ID is required.',
        })
      }
    }

    if (issues.length > 0) {
      throw new ValidationError(issues)
    }

    // The event is caused by the actor themselves, so there is nobody else to
    // notify. This is a normal no-op, not an error.
    if (actorId === recipientId) {
      return null
    }

    return notificationModel.create(
      {
        userId: recipientId,
        actorId,
        type,
        message,
        referenceType: hasReferenceType ? referenceType : null,
        referenceId: hasReferenceId ? referenceId : null,
      },
      { transaction },
    )
  }

  return { createNotification }
}

const notificationCreationService =
  createNotificationCreationService()

module.exports = {
  NOTIFICATION_REFERENCE_TYPES,
  SUPPORTED_NOTIFICATION_TYPES,
  createNotificationCreationService,
  notificationCreationService,
}
