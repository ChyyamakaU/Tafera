'use strict'

const { createPagination } = require('../utils/pagination')
const {
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
} = require('../validators/report')
const {
  ReportDuplicateError,
  ReportInvalidTargetTypeError,
  ReportNotFoundError,
  ReportSelfReportError,
  ReportStateConflictError,
  ReportTargetNotFoundError,
} = require('../utils/reportErrors')

const REPORT_TARGET_TYPES = Object.freeze(['user', 'post', 'comment', 'trip'])

const createReportService = ({
  Report,
  User,
  Post,
  Comment,
  Trip,
  sequelize,
} = {}) => {
  const reportModel = Report || require('../models').Report
  const userModel = User || require('../models').User
  const postModel = Post || require('../models').Post
  const commentModel = Comment || require('../models').Comment
  const tripModel = Trip || require('../models').Trip
  const database =
    sequelize || reportModel.sequelize || require('../models').sequelize

  const targetModelForType = {
    user: userModel,
    post: postModel,
    comment: commentModel,
    trip: tripModel,
  }

  const toPlain = (value) => {
    if (!value || typeof value !== 'object') return null

    return typeof value.get === 'function'
      ? value.get({ plain: true })
      : value
  }

  const toReporterReport = (report) => {
    const source = toPlain(report)

    if (!source) return null

    return {
      id: source.id,
      status: source.status,
      targetType: source.targetType,
      targetId: source.targetId,
      reason: source.reason,
      description: source.description,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
    }
  }

  const toAdminReport = (report) => {
    const source = toPlain(report)

    if (!source) return null

    return {
      id: source.id,
      reporterId: source.reporterId,
      status: source.status,
      targetType: source.targetType,
      targetId: source.targetId,
      reason: source.reason,
      description: source.description,
      reviewedBy: source.reviewedBy,
      reviewedAt: source.reviewedAt,
      resolutionNote: source.resolutionNote,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt,
    }
  }

  const assertTargetExists = async (targetType, targetId) => {
    const model = targetModelForType[targetType]

    if (!model) {
      throw new ReportInvalidTargetTypeError()
    }

    const target = await model.findOne({
      where: { id: targetId },
      attributes: ['id'],
    })

    if (!target) {
      throw new ReportTargetNotFoundError()
    }

    return target
  }

  const createReport = async (reporterId, input) => {
    if (input.targetType === 'user' && input.targetId === reporterId) {
      throw new ReportSelfReportError()
    }

    await assertTargetExists(input.targetType, input.targetId)

    let report

    try {
      await database.transaction(async (transaction) => {
        report = await reportModel.create(
          {
            reporterId,
            targetType: input.targetType,
            targetId: input.targetId,
            reason: input.reason,
            description: input.description,
            status: 'pending',
          },
          { transaction },
        )
      })
    } catch (error) {
      // Map only the partial unique index on active reports to a duplicate
      // error. Unrelated unique-constraint failures (e.g. primary key) are
      // re-thrown unchanged so they are never silently swallowed.
      if (
        error.name === 'SequelizeUniqueConstraintError' &&
        error.parent?.code === '23505' &&
        error.parent?.constraint === 'reports_reporter_target_active_idx'
      ) {
        throw new ReportDuplicateError()
      }

      throw error
    }

    return toReporterReport(report)
  }

  const getMyReports = async (reporterId, filters = {}) => {
    const where = { reporterId }
    const page = filters.page ?? DEFAULT_PAGE
    const limit = filters.limit ?? DEFAULT_LIMIT

    const { count, rows } = await reportModel.findAndCountAll({
      where,
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit,
      offset: (page - 1) * limit,
      distinct: true,
    })

    return {
      reports: rows.map(toReporterReport),
      pagination: createPagination({
        page,
        limit,
        total: count,
      }),
    }
  }

  const getAdminReports = async (filters = {}) => {
    const where = {}
    const page = filters.page ?? DEFAULT_PAGE
    const limit = filters.limit ?? DEFAULT_LIMIT

    if (filters.status) {
      where.status = filters.status
    }

    if (filters.targetType) {
      where.targetType = filters.targetType
    }

    const { count, rows } = await reportModel.findAndCountAll({
      where,
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit,
      offset: (page - 1) * limit,
      distinct: true,
    })

    return {
      reports: rows.map(toAdminReport),
      pagination: createPagination({
        page,
        limit,
        total: count,
      }),
    }
  }

  const updateReportStatus = async (reportId, adminId, input) => {
    let report

    await database.transaction(async (transaction) => {
      report = await reportModel.findOne({
        where: { id: reportId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      })

      if (!report) {
        throw new ReportNotFoundError()
      }

      const currentStatus = report.status
      const targetStatus = input.status

      const allowedTransitions = {
        pending: ['under_review', 'resolved', 'dismissed'],
        under_review: ['resolved', 'dismissed'],
      }

      if (!allowedTransitions[currentStatus]?.includes(targetStatus)) {
        throw new ReportStateConflictError()
      }

      await report.update(
        {
          status: targetStatus,
          reviewedBy: adminId,
          reviewedAt: new Date(),
          resolutionNote: input.resolutionNote ?? null,
        },
        { transaction },
      )
    })

    const updated = await reportModel.findOne({
      where: { id: reportId },
    })

    if (!updated) {
      throw new ReportNotFoundError()
    }

    return toAdminReport(updated)
  }

  const getReportById = async (reportId, requesterId, requesterRole) => {
    const report = await reportModel.findOne({
      where: { id: reportId },
    })

    if (!report) {
      throw new ReportNotFoundError()
    }

    if (requesterRole !== 'admin' && report.reporterId !== requesterId) {
      throw new ReportNotFoundError()
    }

    if (requesterRole === 'admin') {
      return toAdminReport(report)
    }

    return toReporterReport(report)
  }

  return {
    createReport,
    getMyReports,
    getAdminReports,
    updateReportStatus,
    getReportById,
  }
}

const reportService = createReportService()

module.exports = {
  createReportService,
  reportService,
}
