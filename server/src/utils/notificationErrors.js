'use strict'

const { AuthError } = require('./authErrors')

// Notifications are private to their recipient. Missing notifications and
// notifications owned by another user return the same error so ownership
// cannot be enumerated.
class NotificationNotFoundError extends AuthError {
  constructor() {
    super({
      message: 'Notification not found.',
      code: 'NOTIFICATION_NOT_FOUND',
      status: 404,
    })
    this.name = 'NotificationNotFoundError'
  }
}

module.exports = {
  NotificationNotFoundError,
}
