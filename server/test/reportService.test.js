'use strict'

process.env.NODE_ENV = 'test'
process.env.SESSION_SECRET =
  'test-only-session-secret-0123456789abcdef'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  createReportService,
} = require('../src/services/reportService')
const {
  ReportDuplicateError,
  ReportInvalidTargetTypeError,
  ReportNotFoundError,
  ReportSelfReportError,
  ReportStateConflictError,
  ReportTargetNotFoundError,
} = require('../src/utils/reportErrors')

const REPORTER_ID = '90000000-0000-4000-8000-000000000001'
const TARGET_USER_ID = '90000000-0000-4000-8000-000000000002'
const OTHER_USER_ID = '90000000-0000-4000-8000-000000000003'
const ADMIN_ID = '90000000-0000-4000-8000-000000000004'
const REPORT_ID = '30000000-0000-4000-8000-000000000001'
const POST_ID = '40000000-0000-4000-8000-000000000001'
const COMMENT_ID = '50000000-0000-4000-8000-000000000001'
const TRIP_ID = '60000000-0000-4000-8000-000000000001'

const buildReport = (overrides = {}) => ({
  id: REPORT_ID,
  reporterId: REPORTER_ID,
  targetType: 'user',
  targetId: TARGET_USER_ID,
  reason: 'spam',
  description: 'Harassing content.',
  status: 'pending',
  reviewedBy: null,
  reviewedAt: null,
  resolutionNote: null,
  createdAt: new Date('2026-11-10T10:00:00.000Z'),
  updatedAt: new Date('2026-11-10T10:00:00.000Z'),
  updates: [],
  async update(values) {
    this.updates.push(values)
    Object.assign(this, values)
  },
  ...overrides,
})

const createFakeSequelize = () => {
  const transactions = []

  return {
    transactions,
    async transaction(callback) {
      const transaction = {
        id: 'transaction-' + (transactions.length + 1),
        committed: false,
        rolledBack: false,
        LOCK: { UPDATE: 'UPDATE' },
      }
      transactions.push(transaction)

      try {
        const result = await callback(transaction)
        transaction.committed = true
        return result
      } catch (error) {
        transaction.rolledBack = true
        throw error
      }
    },
  }
}

const createService = ({
  user = { id: TARGET_USER_ID, status: 'active' },
  post = { id: POST_ID, userId: OTHER_USER_ID },
  comment = { id: COMMENT_ID, postId: POST_ID, userId: OTHER_USER_ID },
  trip = { id: TRIP_ID, userId: OTHER_USER_ID },
  report = buildReport(),
  reportFindOneResults = [],
  reportsResult = { count: 0, rows: [] },
  createError = null,
  updateError = null,
  uniqueError = null,
  sequelize = createFakeSequelize(),
} = {}) => {
  const calls = {
    userFindByPk: [],
    userFindOne: [],
    postFindOne: [],
    commentFindOne: [],
    tripFindOne: [],
    reportCreate: [],
    reportFindOne: [],
    reportFindAndCountAll: [],
    reportUpdate: [],
  }

  // Share the same transactions array used by the fake sequelize so that
  // assertions on transaction commit/rollback work correctly.
  calls.transactions = sequelize.transactions
  let findOneIndex = 0

  const User = {
    async findByPk(id, options) {
      calls.userFindByPk.push({ id, options })
      return user
    },
    async findOne(options) {
      calls.userFindOne.push(options)
      return user
    },
  }

  const Post = {
    async findOne(options) {
      calls.postFindOne.push(options)
      return post
    },
  }

  const Comment = {
    async findOne(options) {
      calls.commentFindOne.push(options)
      return comment
    },
  }

  const Trip = {
    async findOne(options) {
      calls.tripFindOne.push(options)
      return trip
    },
  }

  const Report = {
    async findOne(options) {
      calls.reportFindOne.push(options)
      const result = reportFindOneResults[Math.min(findOneIndex, reportFindOneResults.length - 1)]
      findOneIndex += 1
      if (result === undefined || result === null) return null

      const originalUpdate = result.update.bind(result)
      result.update = async (values, options) => {
        calls.reportUpdate.push({ values, options })
        if (updateError) throw updateError
        await originalUpdate(values)
        return [1]
      }

      return result
    },
    async findAndCountAll(options) {
      calls.reportFindAndCountAll.push(options)
      return reportsResult
    },
    async create(values, options) {
      calls.reportCreate.push({ values, options })

      if (uniqueError) throw uniqueError
      if (createError) throw createError

      return {
        id: REPORT_ID,
        reporterId: values.reporterId,
        targetType: values.targetType,
        targetId: values.targetId,
        reason: values.reason,
        description: values.description,
        status: values.status,
        reviewedBy: null,
        reviewedAt: null,
        resolutionNote: null,
        createdAt: new Date('2026-11-10T10:00:00.000Z'),
        updatedAt: new Date('2026-11-10T10:00:00.000Z'),
      }
    },
    async update(values, options) {
      calls.reportUpdate.push({ values, options })

      if (updateError) throw updateError

      return [1]
    },
  }

  const service = createReportService({
    Report,
    User,
    Post,
    Comment,
    Trip,
    sequelize,
  })

  return {
    calls,
    service,
    sequelize,
  }
}

const rejectsWith = async (promise, ErrorClass) => {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof ErrorClass)
    return true
  })
}

const uniqueViolationError = () =>
  Object.assign(new Error('duplicate'), {
    name: 'SequelizeUniqueConstraintError',
    parent: { code: '23505', constraint: 'reports_reporter_target_active_idx' },
  })

// ---------- createReport ----------

test('createReport creates a pending report for a user target', async () => {
  const { service, calls } = createService()

  const result = await service.createReport(REPORTER_ID, {
    targetType: 'user',
    targetId: TARGET_USER_ID,
    reason: 'harassment',
    description: 'Harassing messages.',
  })

  assert.equal(result.status, 'pending')
  assert.equal(result.targetType, 'user')
  assert.equal(result.targetId, TARGET_USER_ID)
  assert.equal(result.reason, 'harassment')
  assert.equal(result.description, 'Harassing messages.')
  assert.equal(Object.hasOwn(result, 'reviewedBy'), false)
  assert.equal(Object.hasOwn(result, 'reviewedAt'), false)
  assert.equal(Object.hasOwn(result, 'resolutionNote'), false)
  assert.equal(Object.hasOwn(result, 'reporterId'), false)

  assert.deepEqual(calls.reportCreate[0].values, {
    reporterId: REPORTER_ID,
    targetType: 'user',
    targetId: TARGET_USER_ID,
    reason: 'harassment',
    description: 'Harassing messages.',
    status: 'pending',
  })
  assert.equal(calls.reportCreate[0].options.transaction, calls.transactions[0])
  assert.equal(calls.transactions.length, 1)
  assert.equal(calls.transactions[0].committed, true)
})

test('createReport creates a pending report for a post target', async () => {
  const { service, calls } = createService()

  const result = await service.createReport(REPORTER_ID, {
    targetType: 'post',
    targetId: POST_ID,
    reason: 'spam',
  })

  assert.equal(result.status, 'pending')
  assert.equal(result.targetType, 'post')
  assert.equal(result.targetId, POST_ID)
  assert.equal(result.reason, 'spam')
  assert.deepEqual(calls.postFindOne[0].where, { id: POST_ID })
})

test('createReport creates a pending report for a comment target', async () => {
  const { service, calls } = createService()

  const result = await service.createReport(REPORTER_ID, {
    targetType: 'comment',
    targetId: COMMENT_ID,
    reason: 'inappropriate_content',
  })

  assert.equal(result.status, 'pending')
  assert.equal(result.targetType, 'comment')
  assert.equal(result.targetId, COMMENT_ID)
  assert.equal(result.reason, 'inappropriate_content')
  assert.deepEqual(calls.commentFindOne[0].where, { id: COMMENT_ID })
})

test('createReport creates a pending report for a trip target', async () => {
  const { service, calls } = createService()

  const result = await service.createReport(REPORTER_ID, {
    targetType: 'trip',
    targetId: TRIP_ID,
    reason: 'impersonation',
  })

  assert.equal(result.status, 'pending')
  assert.equal(result.targetType, 'trip')
  assert.equal(result.targetId, TRIP_ID)
  assert.equal(result.reason, 'impersonation')
  assert.deepEqual(calls.tripFindOne[0].where, { id: TRIP_ID })
})

test('createReport allows reporting a suspended user target', async () => {
  const suspendedUser = { id: TARGET_USER_ID, status: 'suspended' }
  const { service, calls } = createService({ user: suspendedUser })

  const result = await service.createReport(REPORTER_ID, {
    targetType: 'user',
    targetId: TARGET_USER_ID,
    reason: 'harassment',
  })

  assert.equal(result.status, 'pending')
  assert.deepEqual(calls.userFindOne[0].where, { id: TARGET_USER_ID })
})

test('createReport rejects self-report on user target', async () => {
  const { service, calls } = createService()

  await rejectsWith(
    service.createReport(REPORTER_ID, {
      targetType: 'user',
      targetId: REPORTER_ID,
      reason: 'spam',
    }),
    ReportSelfReportError,
  )

  assert.equal(calls.reportCreate.length, 0)
  assert.equal(calls.transactions.length, 0)
})

test('createReport rejects missing user target', async () => {
  const { service, calls } = createService({ user: null })

  await rejectsWith(
    service.createReport(REPORTER_ID, {
      targetType: 'user',
      targetId: TARGET_USER_ID,
      reason: 'spam',
    }),
    ReportTargetNotFoundError,
  )

  assert.equal(calls.reportCreate.length, 0)
})

test('createReport rejects missing post target', async () => {
  const { service } = createService({ post: null })

  await rejectsWith(
    service.createReport(REPORTER_ID, {
      targetType: 'post',
      targetId: POST_ID,
      reason: 'spam',
    }),
    ReportTargetNotFoundError,
  )
})

test('createReport rejects missing comment target', async () => {
  const { service } = createService({ comment: null })

  await rejectsWith(
    service.createReport(REPORTER_ID, {
      targetType: 'comment',
      targetId: COMMENT_ID,
      reason: 'spam',
    }),
    ReportTargetNotFoundError,
  )
})

test('createReport rejects missing trip target', async () => {
  const { service } = createService({ trip: null })

  await rejectsWith(
    service.createReport(REPORTER_ID, {
      targetType: 'trip',
      targetId: TRIP_ID,
      reason: 'spam',
    }),
    ReportTargetNotFoundError,
  )
})

test('createReport maps unique constraint violation to duplicate error', async () => {
  const { service, calls } = createService({
    uniqueError: uniqueViolationError(),
  })

  await rejectsWith(
    service.createReport(REPORTER_ID, {
      targetType: 'user',
      targetId: TARGET_USER_ID,
      reason: 'spam',
    }),
    ReportDuplicateError,
  )

  assert.equal(calls.reportCreate.length, 1)
  assert.equal(calls.transactions.length, 1)
  assert.equal(calls.transactions[0].committed, false)
  assert.equal(calls.transactions[0].rolledBack, true)
})

test('createReport does not map unrelated unique constraint violations to duplicate error', async () => {
  const unrelatedUniqueError = Object.assign(new Error('duplicate'), {
    name: 'SequelizeUniqueConstraintError',
    parent: { code: '23505', constraint: 'reports_pkey' },
  })
  const { service, calls } = createService({
    uniqueError: unrelatedUniqueError,
  })

  await assert.rejects(
    service.createReport(REPORTER_ID, {
      targetType: 'user',
      targetId: TARGET_USER_ID,
      reason: 'spam',
    }),
    (error) => {
      assert.strictEqual(error, unrelatedUniqueError)
      return true
    },
  )

  assert.equal(calls.reportCreate.length, 1)
  assert.equal(calls.transactions.length, 1)
  assert.equal(calls.transactions[0].committed, false)
  assert.equal(calls.transactions[0].rolledBack, true)
})

test('createReport propagates non-unique errors', async () => {
  const dbError = new Error('database connection lost')
  const { service } = createService({ createError: dbError })

  await assert.rejects(
    service.createReport(REPORTER_ID, {
      targetType: 'user',
      targetId: TARGET_USER_ID,
      reason: 'spam',
    }),
    (error) => {
      assert.strictEqual(error, dbError)
      return true
    },
  )
})

test('createReport does not create a report when creation fails', async () => {
  const createError = new Error('write failed')
  const { service, calls } = createService({ createError })

  await assert.rejects(
    service.createReport(REPORTER_ID, {
      targetType: 'user',
      targetId: TARGET_USER_ID,
      reason: 'spam',
    }),
    createError,
  )

  assert.equal(calls.reportCreate.length, 1)
  assert.equal(calls.transactions.length, 1)
  assert.equal(calls.transactions[0].rolledBack, true)
})

// ---------- getMyReports ----------

test("getMyReports returns only the reporter's reports with pagination", async () => {
  const row1 = buildReport({ id: '30000000-0000-4000-8000-000000000001' })
  const row2 = buildReport({ id: '30000000-0000-4000-8000-000000000002' })
  const { service, calls } = createService({
    reportsResult: { count: 2, rows: [row1, row2] },
  })

  const result = await service.getMyReports(REPORTER_ID, {
    page: 1,
    limit: 20,
  })

  assert.equal(result.reports.length, 2)
  assert.equal(result.reports[0].id, row1.id)
  assert.equal(result.reports[1].id, row2.id)
  assert.deepEqual(calls.reportFindAndCountAll[0].where, {
    reporterId: REPORTER_ID,
  })
  assert.deepEqual(calls.reportFindAndCountAll[0].order, [
    ['createdAt', 'DESC'],
    ['id', 'DESC'],
  ])
  assert.equal(calls.reportFindAndCountAll[0].limit, 20)
  assert.equal(calls.reportFindAndCountAll[0].offset, 0)
  assert.deepEqual(result.pagination, {
    page: 1,
    limit: 20,
    total: 2,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  })
})

test('getMyReports excludes admin-only fields', async () => {
  const row = buildReport({
    reviewedBy: ADMIN_ID,
    reviewedAt: new Date('2026-11-11T12:00:00.000Z'),
    resolutionNote: 'Resolved as spam.',
  })
  const { service } = createService({
    reportsResult: { count: 1, rows: [row] },
  })

  const result = await service.getMyReports(REPORTER_ID, {
    page: 1,
    limit: 20,
  })

  const report = result.reports[0]
  assert.equal(report.reviewedBy, undefined)
  assert.equal(report.reviewedAt, undefined)
  assert.equal(report.resolutionNote, undefined)
  assert.equal(report.reporterId, undefined)
})

test('getMyReports applies default pagination', async () => {
  const { service, calls } = createService({
    reportsResult: { count: 0, rows: [] },
  })

  await service.getMyReports(REPORTER_ID, {})

  assert.equal(calls.reportFindAndCountAll[0].limit, 20)
  assert.equal(calls.reportFindAndCountAll[0].offset, 0)
})

// ---------- getAdminReports ----------

test('getAdminReports returns all reports with pagination and filters', async () => {
  const row1 = buildReport({ id: '30000000-0000-4000-8000-000000000001' })
  const row2 = buildReport({
    id: '30000000-0000-4000-8000-000000000002',
    reporterId: OTHER_USER_ID,
    targetType: 'post',
    targetId: POST_ID,
    status: 'under_review',
  })
  const { service, calls } = createService({
    reportsResult: { count: 2, rows: [row1, row2] },
  })

  const result = await service.getAdminReports({
    status: 'under_review',
    targetType: 'post',
    page: 1,
    limit: 10,
  })

  assert.equal(result.reports.length, 2)
  assert.deepEqual(calls.reportFindAndCountAll[0].where, {
    status: 'under_review',
    targetType: 'post',
  })
  assert.deepEqual(calls.reportFindAndCountAll[0].order, [
    ['createdAt', 'DESC'],
    ['id', 'DESC'],
  ])
  assert.equal(calls.reportFindAndCountAll[0].limit, 10)
  assert.equal(calls.reportFindAndCountAll[0].offset, 0)
})

test('getAdminReports returns admin-only fields', async () => {
  const row = buildReport({
    reviewedBy: ADMIN_ID,
    reviewedAt: new Date('2026-11-11T12:00:00.000Z'),
    resolutionNote: 'Action taken.',
  })
  const { service } = createService({
    reportsResult: { count: 1, rows: [row] },
  })

  const result = await service.getAdminReports({ page: 1, limit: 20 })

  const report = result.reports[0]
  assert.equal(report.reporterId, REPORTER_ID)
  assert.equal(report.reviewedBy, ADMIN_ID)
  assert.equal(report.reviewedAt, row.reviewedAt)
  assert.equal(report.resolutionNote, 'Action taken.')
})

test('getAdminReports applies default pagination', async () => {
  const { service, calls } = createService({
    reportsResult: { count: 0, rows: [] },
  })

  await service.getAdminReports({})

  assert.equal(calls.reportFindAndCountAll[0].limit, 20)
  assert.equal(calls.reportFindAndCountAll[0].offset, 0)
})

// ---------- updateReportStatus ----------

test('updateReportStatus transitions pending to under_review', async () => {
  const pending = buildReport({ status: 'pending' })
  const updated = buildReport({
    status: 'under_review',
    reviewedBy: ADMIN_ID,
    reviewedAt: new Date('2026-11-11T12:00:00.000Z'),
    resolutionNote: 'Looking into it.',
  })
  const { service, calls, sequelize } = createService({
    reportFindOneResults: [pending, updated],
  })

  const result = await service.updateReportStatus(REPORT_ID, ADMIN_ID, {
    status: 'under_review',
    resolutionNote: 'Looking into it.',
  })

  assert.equal(result.status, 'under_review')
  assert.equal(result.reviewedBy, ADMIN_ID)
  assert.ok(result.reviewedAt instanceof Date)
  assert.equal(result.resolutionNote, 'Looking into it.')
  assert.deepEqual(calls.reportFindOne[0].where, { id: REPORT_ID })
  assert.equal(calls.reportFindOne[0].lock, 'UPDATE')
  assert.equal(calls.reportUpdate[0].values.status, 'under_review')
  assert.equal(calls.reportUpdate[0].values.reviewedBy, ADMIN_ID)
  assert.equal(calls.reportUpdate[0].values.resolutionNote, 'Looking into it.')
  assert.equal(calls.reportUpdate[0].options.transaction, calls.transactions[0])
  assert.equal(calls.transactions.length, 1)
  assert.equal(calls.transactions[0].committed, true)
})

test('updateReportStatus transitions pending to resolved', async () => {
  const pending = buildReport({ status: 'pending' })
  const updated = buildReport({ status: 'resolved', reviewedBy: ADMIN_ID })
  const { service } = createService({
    reportFindOneResults: [pending, updated],
  })

  const result = await service.updateReportStatus(REPORT_ID, ADMIN_ID, {
    status: 'resolved',
  })

  assert.equal(result.status, 'resolved')
  assert.equal(result.reviewedBy, ADMIN_ID)
  assert.equal(result.resolutionNote, null)
})

test('updateReportStatus transitions pending to dismissed', async () => {
  const pending = buildReport({ status: 'pending' })
  const updated = buildReport({ status: 'dismissed', reviewedBy: ADMIN_ID })
  const { service } = createService({
    reportFindOneResults: [pending, updated],
  })

  const result = await service.updateReportStatus(REPORT_ID, ADMIN_ID, {
    status: 'dismissed',
  })

  assert.equal(result.status, 'dismissed')
  assert.equal(result.reviewedBy, ADMIN_ID)
})

test('updateReportStatus transitions under_review to resolved', async () => {
  const underReview = buildReport({ status: 'under_review' })
  const updated = buildReport({ status: 'resolved', reviewedBy: ADMIN_ID })
  const { service } = createService({
    reportFindOneResults: [underReview, updated],
  })

  const result = await service.updateReportStatus(REPORT_ID, ADMIN_ID, {
    status: 'resolved',
  })

  assert.equal(result.status, 'resolved')
})

test('updateReportStatus transitions under_review to dismissed', async () => {
  const underReview = buildReport({ status: 'under_review' })
  const updated = buildReport({ status: 'dismissed', reviewedBy: ADMIN_ID })
  const { service } = createService({
    reportFindOneResults: [underReview, updated],
  })

  const result = await service.updateReportStatus(REPORT_ID, ADMIN_ID, {
    status: 'dismissed',
  })

  assert.equal(result.status, 'dismissed')
})

test('updateReportStatus rejects resolved to any transition', async () => {
  const resolved = buildReport({ status: 'resolved' })
  const { service, calls } = createService({
    reportFindOneResults: [resolved],
  })

  const invalid = ['under_review', 'resolved', 'dismissed']

  for (const target of invalid) {
    await rejectsWith(
      service.updateReportStatus(REPORT_ID, ADMIN_ID, { status: target }),
      ReportStateConflictError,
    )
    assert.equal(calls.reportUpdate.length, 0)
  }
})

test('updateReportStatus rejects dismissed to any transition', async () => {
  const dismissed = buildReport({ status: 'dismissed' })
  const { service, calls } = createService({
    reportFindOneResults: [dismissed],
  })

  const invalid = ['pending', 'under_review', 'resolved', 'dismissed']

  for (const target of invalid) {
    await rejectsWith(
      service.updateReportStatus(REPORT_ID, ADMIN_ID, { status: target }),
      ReportStateConflictError,
    )
    assert.equal(calls.reportUpdate.length, 0)
  }
})

test('updateReportStatus rejects missing report', async () => {
  const { service, calls } = createService({ reportFindOneResults: [null] })

  await rejectsWith(
    service.updateReportStatus(REPORT_ID, ADMIN_ID, { status: 'resolved' }),
    ReportNotFoundError,
  )

  assert.equal(calls.reportUpdate.length, 0)
})

test('updateReportStatus rolls back when update fails', async () => {
  const updateError = new Error('write failed')
  const pending = buildReport({ status: 'pending' })
  const { service, calls, sequelize } = createService({
    reportFindOneResults: [pending],
    updateError,
  })

  await assert.rejects(
    service.updateReportStatus(REPORT_ID, ADMIN_ID, { status: 'resolved' }),
    (error) => {
      assert.strictEqual(error, updateError)
      return true
    },
  )

  assert.equal(calls.reportUpdate.length, 1)
  assert.equal(calls.transactions.length, 1)
  assert.equal(calls.transactions[0].committed, false)
  assert.equal(calls.transactions[0].rolledBack, true)
})

// ---------- getReportById ----------

test('getReportById allows admin to retrieve any report', async () => {
  const row = buildReport({ reporterId: OTHER_USER_ID })
  const { service } = createService({
    reportFindOneResults: [row],
  })

  const result = await service.getReportById(REPORT_ID, REPORTER_ID, 'admin')

  assert.equal(result.id, REPORT_ID)
  assert.equal(result.reporterId, OTHER_USER_ID)
  assert.equal(result.reviewedBy, null)
  assert.equal(result.resolutionNote, null)
})

test('getReportById allows regular user to retrieve own report', async () => {
  const row = buildReport({ reporterId: REPORTER_ID })
  const { service } = createService({
    reportFindOneResults: [row],
  })

  const result = await service.getReportById(REPORT_ID, REPORTER_ID, 'user')

  assert.equal(result.id, REPORT_ID)
  assert.equal(result.reporterId, undefined)
  assert.equal(result.reviewedBy, undefined)
  assert.equal(result.resolutionNote, undefined)
})

test('getReportById rejects regular user retrieving another user report', async () => {
  const row = buildReport({ reporterId: OTHER_USER_ID })
  const { service } = createService({
    reportFindOneResults: [row],
  })

  await rejectsWith(
    service.getReportById(REPORT_ID, REPORTER_ID, 'user'),
    ReportNotFoundError,
  )
})

test('getReportById returns not-found for missing report', async () => {
  const { service } = createService({ reportFindOneResults: [null] })

  await rejectsWith(
    service.getReportById(REPORT_ID, REPORTER_ID, 'user'),
    ReportNotFoundError,
  )

  await rejectsWith(
    service.getReportById(REPORT_ID, ADMIN_ID, 'admin'),
    ReportNotFoundError,
  )
})

test('getReportById does not expose admin fields to regular user', async () => {
  const row = buildReport({
    reporterId: REPORTER_ID,
    reviewedBy: ADMIN_ID,
    reviewedAt: new Date('2026-11-11T12:00:00.000Z'),
    resolutionNote: 'Internal note.',
  })
  const { service } = createService({
    reportFindOneResults: [row],
  })

  const result = await service.getReportById(REPORT_ID, REPORTER_ID, 'user')

  assert.equal(result.reviewedBy, undefined)
  assert.equal(result.reviewedAt, undefined)
  assert.equal(result.resolutionNote, undefined)
  assert.equal(result.reporterId, undefined)
})
