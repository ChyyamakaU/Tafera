'use strict'

const {
  parseNotificationId,
  parseNotificationListQuery,
} = require('../validators/notification')

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next)
}

const noStore = (res) => res.set('Cache-Control', 'no-store')

const createNotificationController = ({ notificationService }) => ({
  list: asyncHandler(async (req, res) => {
    const filters = parseNotificationListQuery(req.query)
    const { notifications, pagination } =
      await notificationService.listNotifications(
        req.auth.userId,
        filters,
      )

    noStore(res).status(200).json({
      data: { notifications, pagination },
    })
  }),

  unreadCount: asyncHandler(async (req, res) => {
    const { unreadCount } = await notificationService.getUnreadCount(
      req.auth.userId,
    )

    noStore(res).status(200).json({
      data: { unreadCount },
    })
  }),

  markAsRead: asyncHandler(async (req, res) => {
    const { notificationId } = parseNotificationId(req.params)
    const notification =
      await notificationService.markNotificationAsRead(
        req.auth.userId,
        notificationId,
      )

    noStore(res).status(200).json({
      data: { notification },
    })
  }),

  markAllAsRead: asyncHandler(async (req, res) => {
    const { updatedCount } =
      await notificationService.markAllNotificationsAsRead(
        req.auth.userId,
      )

    noStore(res).status(200).json({
      data: { updatedCount },
    })
  }),
})

module.exports = { createNotificationController }
