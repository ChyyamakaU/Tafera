'use strict'

const { createPagination } = require('../utils/pagination')
const {
  PUBLIC_PROFILE_FIELDS,
} = require('../utils/safeUser')
const { toNotification } = require('../utils/safeNotification')
const {
  NotificationNotFoundError,
} = require('../utils/notificationErrors')

const createNotificationService = ({ Notification, User } = {}) => {
  const notificationModel =
    Notification || require('../models').Notification
  const userModel = User || require('../models').User

  const actorInclude = {
    model: userModel,
    as: 'actor',
    attributes: [...PUBLIC_PROFILE_FIELDS, 'status'],
    required: false,
  }

  // Every operation is scoped by the authenticated user ID supplied by the
  // caller. A notification belonging to another user is indistinguishable
  // from a missing notification.
  const listNotifications = async (userId, filters = {}) => {
    const where = { userId }
    const page = filters.page ?? 1
    const limit = filters.limit ?? 20

    if (filters.unreadOnly === true) {
      where.isRead = false
    }

    const { count, rows } = await notificationModel.findAndCountAll({
      where,
      include: [actorInclude],
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit,
      offset: (page - 1) * limit,
      distinct: true,
    })

    return {
      notifications: rows.map(toNotification),
      pagination: createPagination({
        page,
        limit,
        total: count,
      }),
    }
  }

  const getUnreadCount = async (userId) => {
    const unreadCount = await notificationModel.count({
      where: { userId, isRead: false },
    })

    return { unreadCount }
  }

  const findOwnedNotification = async (userId, notificationId) => {
    const notification = await notificationModel.findOne({
      where: { id: notificationId, userId },
      include: [actorInclude],
    })

    if (!notification) {
      throw new NotificationNotFoundError()
    }

    return notification
  }

  const markNotificationAsRead = async (userId, notificationId) => {
    const notification = await findOwnedNotification(
      userId,
      notificationId,
    )

    // Re-marking an already-read notification is a no-op so the original
    // readAt timestamp is preserved.
    if (!notification.isRead) {
      await notification.update({
        isRead: true,
        readAt: new Date(),
      })
    }

    return toNotification(notification)
  }

  const markAllNotificationsAsRead = async (userId) => {
    const [updatedCount] = await notificationModel.update(
      {
        isRead: true,
        readAt: new Date(),
      },
      {
        where: { userId, isRead: false },
      },
    )

    return { updatedCount }
  }

  return {
    getUnreadCount,
    listNotifications,
    markAllNotificationsAsRead,
    markNotificationAsRead,
  }
}

const notificationService = createNotificationService()

module.exports = {
  createNotificationService,
  notificationService,
}
