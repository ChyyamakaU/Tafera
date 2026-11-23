'use strict'

const {
  parseAdminAuditLogsQuery,
  parseAdminCreateDestination,
  parseAdminDestinationsQuery,
  parseAdminModerateReport,
  parseAdminReasonBody,
  parseAdminReportsQuery,
  parseAdminTripsQuery,
  parseAdminUpdateDestination,
  parseAdminUpdateTripStatus,
  parseAdminUpdateUserRole,
  parseAdminUpdateUserStatus,
  parseAdminUsersQuery,
  parseAdminUuidParam,
} = require('../validators/admin')

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next)
}

const noStore = (res) => res.set('Cache-Control', 'no-store')

const parseUserId = parseAdminUuidParam('userId', 'User ID')
const parseDestinationId = parseAdminUuidParam('destinationId', 'Destination ID')
const parseImageId = parseAdminUuidParam('imageId', 'Image ID')
const parseReportId = parseAdminUuidParam('reportId', 'Report ID')
const parsePostId = parseAdminUuidParam('postId', 'Post ID')
const parseCommentId = parseAdminUuidParam('commentId', 'Comment ID')
const parseTripId = parseAdminUuidParam('tripId', 'Trip ID')

const createAdminController = ({ adminService }) => ({
  overview: asyncHandler(async (_req, res) => {
    const overview = await adminService.getOverview()
    noStore(res).status(200).json({ data: overview })
  }),

  listAuditLogs: asyncHandler(async (req, res) => {
    const filters = parseAdminAuditLogsQuery(req.query)
    const result = await adminService.listAuditLogs(filters)
    noStore(res).status(200).json({ data: result })
  }),

  listUsers: asyncHandler(async (req, res) => {
    const filters = parseAdminUsersQuery(req.query)
    const result = await adminService.listUsers(filters)
    noStore(res).status(200).json({ data: result })
  }),

  getUserDetail: asyncHandler(async (req, res) => {
    const { userId } = parseUserId(req.params)
    const user = await adminService.getUserDetail(userId)
    noStore(res).status(200).json({ data: { user } })
  }),

  updateUserStatus: asyncHandler(async (req, res) => {
    const { userId } = parseUserId(req.params)
    const input = parseAdminUpdateUserStatus(req.body)
    const user = await adminService.updateUserStatus(req.auth.userId, userId, input)
    noStore(res).status(200).json({ data: { user } })
  }),

  updateUserRole: asyncHandler(async (req, res) => {
    const { userId } = parseUserId(req.params)
    const input = parseAdminUpdateUserRole(req.body)
    const user = await adminService.updateUserRole(req.auth.userId, userId, input)
    noStore(res).status(200).json({ data: { user } })
  }),

  listDestinations: asyncHandler(async (req, res) => {
    const filters = parseAdminDestinationsQuery(req.query)
    const result = await adminService.listDestinations(filters)
    noStore(res).status(200).json({ data: result })
  }),

  createDestination: asyncHandler(async (req, res) => {
    const input = parseAdminCreateDestination(req.body)
    const destination = await adminService.createDestination(req.auth.userId, input)
    noStore(res).status(201).json({ data: { destination } })
  }),

  updateDestination: asyncHandler(async (req, res) => {
    const { destinationId } = parseDestinationId(req.params)
    const input = parseAdminUpdateDestination(req.body)
    const destination = await adminService.updateDestination(
      req.auth.userId,
      destinationId,
      input,
    )
    noStore(res).status(200).json({ data: { destination } })
  }),

  deleteDestination: asyncHandler(async (req, res) => {
    const { destinationId } = parseDestinationId(req.params)
    const body = parseAdminReasonBody(req.body || {})
    await adminService.deleteDestination(req.auth.userId, destinationId, body)
    noStore(res).status(204).end()
  }),

  listDestinationPhotos: asyncHandler(async (req, res) => {
    const filters = parseAdminDestinationsQuery(req.query)
    const destinationId = req.query.destinationId
      ? parseDestinationId({ destinationId: req.query.destinationId }).destinationId
      : undefined
    const result = await adminService.listDestinationPhotos({
      page: filters.page,
      limit: filters.limit,
      destinationId,
    })
    noStore(res).status(200).json({ data: result })
  }),

  deleteDestinationPhoto: asyncHandler(async (req, res) => {
    const { destinationId } = parseDestinationId(req.params)
    const { imageId } = parseImageId(req.params)
    const body = parseAdminReasonBody(req.body || {})
    await adminService.deleteDestinationPhoto(
      req.auth.userId,
      destinationId,
      imageId,
      body,
    )
    noStore(res).status(204).end()
  }),

  listReports: asyncHandler(async (req, res) => {
    const filters = parseAdminReportsQuery(req.query)
    const result = await adminService.listReports(filters)
    noStore(res).status(200).json({ data: result })
  }),

  moderateReport: asyncHandler(async (req, res) => {
    const { reportId } = parseReportId(req.params)
    const input = parseAdminModerateReport(req.body)
    const report = await adminService.moderateReport(req.auth.userId, reportId, input)
    noStore(res).status(200).json({ data: { report } })
  }),

  deletePost: asyncHandler(async (req, res) => {
    const { postId } = parsePostId(req.params)
    const body = parseAdminReasonBody(req.body || {})
    await adminService.deletePostAsAdmin(req.auth.userId, postId, body)
    noStore(res).status(204).end()
  }),

  deleteComment: asyncHandler(async (req, res) => {
    const { commentId } = parseCommentId(req.params)
    const body = parseAdminReasonBody(req.body || {})
    await adminService.deleteCommentAsAdmin(req.auth.userId, commentId, body)
    noStore(res).status(204).end()
  }),

  listGroupTrips: asyncHandler(async (req, res) => {
    const filters = parseAdminTripsQuery(req.query)
    const result = await adminService.listGroupTrips(filters)
    noStore(res).status(200).json({ data: result })
  }),

  getGroupTripDetail: asyncHandler(async (req, res) => {
    const { tripId } = parseTripId(req.params)
    const trip = await adminService.getGroupTripDetail(tripId)
    noStore(res).status(200).json({ data: { trip } })
  }),

  updateGroupTripStatus: asyncHandler(async (req, res) => {
    const { tripId } = parseTripId(req.params)
    const input = parseAdminUpdateTripStatus(req.body)
    const trip = await adminService.updateGroupTripStatus(
      req.auth.userId,
      tripId,
      input,
    )
    noStore(res).status(200).json({ data: { trip } })
  }),

  deleteGroupTrip: asyncHandler(async (req, res) => {
    const { tripId } = parseTripId(req.params)
    const body = parseAdminReasonBody(req.body || {})
    await adminService.deleteGroupTrip(req.auth.userId, tripId, body)
    noStore(res).status(204).end()
  }),
})

module.exports = {
  createAdminController,
}
