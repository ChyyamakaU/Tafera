'use strict'

const {
  parseCreateReport,
  parseReporterReportListQuery,
  parseReportId,
  parseReportListQuery,
  parseUpdateReportStatus,
} = require('../validators/report')

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next)
}

const noStore = (res) => res.set('Cache-Control', 'no-store')

const createReportController = ({ reportService }) => ({
  create: asyncHandler(async (req, res) => {
    const input = parseCreateReport(req.body)
    const report = await reportService.createReport(req.auth.userId, input)

    noStore(res).status(201).json({
      data: { report },
    })
  }),

  listMine: asyncHandler(async (req, res) => {
    const filters = parseReporterReportListQuery(req.query)
    const { reports, pagination } =
      await reportService.getMyReports(req.auth.userId, filters)

    noStore(res).status(200).json({
      data: { reports, pagination },
    })
  }),

  getById: asyncHandler(async (req, res) => {
    const { reportId } = parseReportId(req.params)
    const report = await reportService.getReportById(
      reportId,
      req.auth.userId,
      req.auth.role,
    )

    noStore(res).status(200).json({
      data: { report },
    })
  }),

  listAdmin: asyncHandler(async (req, res) => {
    const filters = parseReportListQuery(req.query)
    const { reports, pagination } =
      await reportService.getAdminReports(filters)

    noStore(res).status(200).json({
      data: { reports, pagination },
    })
  }),

  updateStatus: asyncHandler(async (req, res) => {
    const { reportId } = parseReportId(req.params)
    const input = parseUpdateReportStatus(req.body)
    const report = await reportService.updateReportStatus(
      reportId,
      req.auth.userId,
      input,
    )

    noStore(res).status(200).json({
      data: { report },
    })
  }),
})

module.exports = { createReportController }
