'use strict'

process.env.NODE_ENV = 'test'
process.env.SESSION_SECRET =
  'test-only-session-secret-0123456789abcdef'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const {
  createReportController,
} = require('../src/controllers/reportController')
const { ValidationError } = require('../src/utils/authErrors')
const {
  ReportNotFoundError,
  ReportStateConflictError,
  ReportAdminRequiredError,
} = require('../src/utils/reportErrors')

const REPORTER_ID = '11111111-1111-4111-8111-111111111111'
const ADMIN_ID = '22222222-2222-4222-8222-222222222222'
const OTHER_USER_ID = '33333333-3333-4333-8333-333333333333'
const REPORT_ID = '44444444-4444-4444-8444-444444444444'
const POST_ID = '55555555-5555-5555-8555-555555555555'

const REPORTER_REPORT = {
  id: REPORT_ID,
  status: 'pending',
  targetType: 'post',
  targetId: POST_ID,
  reason: 'spam',
  description: 'Spam content.',
  createdAt: new Date('2026-01-03T00:00:00.000Z'),
  updatedAt: new Date('2026-01-03T00:00:00.000Z'),
}

const ADMIN_REPORT = {
  id: REPORT_ID,
  reporterId: REPORTER_ID,
  status: 'pending',
  targetType: 'post',
  targetId: POST_ID,
  reason: 'spam',
  description: 'Spam content.',
  reviewedBy: null,
  reviewedAt: null,
  resolutionNote: null,
  createdAt: new Date('2026-01-03T00:00:00.000Z'),
  updatedAt: new Date('2026-01-03T00:00:00.000Z'),
}

const PAGINATION = {
  page: 1,
  limit: 20,
  total: 1,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
}

const createResponse = () => {
  const headers = {}
  const res = {
    headers,
    statusCode: null,
    body: undefined,
    set(name, value) {
      headers[name] = value
      return res
    },
    status(code) {
      res.statusCode = code
      return res
    },
    json(payload) {
      res.body = payload
      return res
    },
  }

  return res
}

const createService = (results = {}) => {
  const calls = {
    createReport: [],
    getMyReports: [],
    getReportById: [],
    getAdminReports: [],
    updateReportStatus: [],
  }

  const defaults = {
    createReport: REPORTER_REPORT,
    getMyReports: {
      reports: [REPORTER_REPORT],
      pagination: PAGINATION,
    },
    getReportById: REPORTER_REPORT,
    getAdminReports: {
      reports: [ADMIN_REPORT],
      pagination: PAGINATION,
    },
    updateReportStatus: { ...ADMIN_REPORT, status: 'under_review' },
  }

  const service = {}

  for (const name of Object.keys(calls)) {
    service[name] = async (...args) => {
      calls[name].push(args)
      let result = Object.hasOwn(results, name)
        ? results[name]
        : defaults[name]

      if (typeof result === 'function') {
        result = await result(...args)
      }

      if (result instanceof Error) throw result

      return result
    }
  }

  return { calls, service }
}

const createRequest = (overrides = {}) => ({
  params: {},
  query: {},
  body: {},
  auth: { userId: REPORTER_ID, role: 'user' },
  ...overrides,
})

const invoke = async (action, req) => {
  const res = createResponse()
  const errors = []
  const next = (error) => errors.push(error)

  await action(req, res, next)

  return { res, errors }
}

const controllerFor = (service) =>
  createReportController({ reportService: service })

const assertNoStore = (res) => {
  assert.equal(res.headers['Cache-Control'], 'no-store')
}

test('controller exposes only the approved report actions', () => {
  const controller = controllerFor(createService().service)

  assert.deepEqual(Object.keys(controller).sort(), [
    'create',
    'getById',
    'listAdmin',
    'listMine',
    'updateStatus',
  ])
})

test('create submits a report and returns 201', async () => {
  const { calls, service } = createService()
  const controller = controllerFor(service)

  const { res, errors } = await invoke(
    controller.create,
    createRequest({
      body: {
        targetType: 'post',
        targetId: POST_ID,
        reason: 'spam',
        description: 'Spam content.',
      },
    }),
  )

  assert.deepEqual(errors, [])
  assert.equal(res.statusCode, 201)
  assertNoStore(res)
  assert.deepEqual(res.body, { data: { report: REPORTER_REPORT } })
  assert.deepEqual(calls.createReport, [
    [REPORTER_ID, { targetType: 'post', targetId: POST_ID, reason: 'spam', description: 'Spam content.' }],
  ])
})

test('create strips unknown and protected fields', async () => {
  const { calls, service } = createService()
  const controller = controllerFor(service)

  await invoke(
    controller.create,
    createRequest({
      body: {
        targetType: 'post',
        targetId: POST_ID,
        reason: 'spam',
        reporterId: ADMIN_ID,
        status: 'approved',
        createdAt: '2020-01-01T00:00:00.000Z',
      },
    }),
  )

  assert.deepEqual(calls.createReport, [
    [REPORTER_ID, { targetType: 'post', targetId: POST_ID, reason: 'spam' }],
  ])
})

test('listMine returns the reporter own reports with pagination', async () => {
  const { calls, service } = createService()
  const controller = controllerFor(service)

  const { res, errors } = await invoke(
    controller.listMine,
    createRequest({ query: { page: '2', limit: '10' } }),
  )

  assert.deepEqual(errors, [])
  assert.equal(res.statusCode, 200)
  assertNoStore(res)
  assert.deepEqual(res.body, {
    data: { reports: [REPORTER_REPORT], pagination: PAGINATION },
  })
  assert.deepEqual(calls.getMyReports, [
    [REPORTER_ID, { page: 2, limit: 10 }],
  ])
})

test('listMine applies pagination defaults', async () => {
  const { calls, service } = createService()
  const controller = controllerFor(service)

  await invoke(controller.listMine, createRequest())

  assert.deepEqual(calls.getMyReports, [
    [REPORTER_ID, { page: 1, limit: 20 }],
  ])
})

test('getById allows the reporter to retrieve their own report', async () => {
  const { calls, service } = createService()
  const controller = controllerFor(service)

  const { res, errors } = await invoke(
    controller.getById,
    createRequest({ params: { reportId: REPORT_ID } }),
  )

  assert.deepEqual(errors, [])
  assert.equal(res.statusCode, 200)
  assertNoStore(res)
  assert.deepEqual(res.body, { data: { report: REPORTER_REPORT } })
  assert.deepEqual(calls.getReportById, [
    [REPORT_ID, REPORTER_ID, 'user'],
  ])
})

test('getById allows an admin to retrieve any report', async () => {
  const { calls, service } = createService({
    getReportById: async (reportId, requesterId, requesterRole) =>
      requesterRole === 'admin' ? ADMIN_REPORT : REPORTER_REPORT,
  })
  const controller = controllerFor(service)

  const { res, errors } = await invoke(
    controller.getById,
    createRequest({
      auth: { userId: ADMIN_ID, role: 'admin' },
      params: { reportId: REPORT_ID },
    }),
  )

  assert.deepEqual(errors, [])
  assert.equal(res.statusCode, 200)
  assertNoStore(res)
  assert.deepEqual(res.body, { data: { report: ADMIN_REPORT } })
  assert.deepEqual(calls.getReportById, [
    [REPORT_ID, ADMIN_ID, 'admin'],
  ])
})

test('getById normalizes and lowercases the report ID', async () => {
  const { calls, service } = createService()
  const controller = controllerFor(service)

  await invoke(
    controller.getById,
    createRequest({
      params: { reportId: REPORT_ID.toUpperCase() },
    }),
  )

  assert.deepEqual(calls.getReportById, [
    [REPORT_ID, REPORTER_ID, 'user'],
  ])
})

test('listAdmin returns the admin moderation queue', async () => {
  const { calls, service } = createService()
  const controller = controllerFor(service)

  const { res, errors } = await invoke(
    controller.listAdmin,
    createRequest({
      auth: { userId: ADMIN_ID, role: 'admin' },
      query: { status: 'pending', page: '1', limit: '10' },
    }),
  )

  assert.deepEqual(errors, [])
  assert.equal(res.statusCode, 200)
  assertNoStore(res)
  assert.deepEqual(res.body, {
    data: { reports: [ADMIN_REPORT], pagination: PAGINATION },
  })
  assert.deepEqual(calls.getAdminReports, [
    [{ status: 'pending', page: 1, limit: 10 }],
  ])
})

test('updateStatus lets an admin update a report', async () => {
  const { calls, service } = createService()
  const controller = controllerFor(service)

  const { res, errors } = await invoke(
    controller.updateStatus,
    createRequest({
      auth: { userId: ADMIN_ID, role: 'admin' },
      params: { reportId: REPORT_ID },
      body: { status: 'under_review', resolutionNote: 'Looks like spam.' },
    }),
  )

  assert.deepEqual(errors, [])
  assert.equal(res.statusCode, 200)
  assertNoStore(res)
  assert.deepEqual(res.body, {
    data: { report: { ...ADMIN_REPORT, status: 'under_review' } },
  })
  assert.deepEqual(calls.updateReportStatus, [
    [REPORT_ID, ADMIN_ID, { status: 'under_review', resolutionNote: 'Looks like spam.' }],
  ])
})

test('create strips reporterId from the body', async () => {
  const { calls, service } = createService()
  const controller = controllerFor(service)

  await invoke(
    controller.create,
    createRequest({
      body: {
        targetType: 'post',
        targetId: POST_ID,
        reason: 'spam',
        reporterId: ADMIN_ID,
      },
    }),
  )

  assert.deepEqual(calls.createReport, [
    [REPORTER_ID, { targetType: 'post', targetId: POST_ID, reason: 'spam' }],
  ])
})

test('invalid report ID is rejected before the service runs', async () => {
  const { calls, service } = createService()
  const controller = controllerFor(service)

  const { res, errors } = await invoke(
    controller.getById,
    createRequest({
      params: { reportId: 'not-a-uuid' },
    }),
  )

  assert.equal(errors.length, 1)
  assert.ok(errors[0] instanceof ValidationError)
  assert.equal(errors[0].code, 'VALIDATION_ERROR')
  assert.equal(errors[0].status, 400)
  assert.equal(res.statusCode, null)
  assert.equal(res.body, undefined)
  assert.deepEqual(calls.getReportById, [])
})

test('invalid create body is rejected before the service runs', async () => {
  const { calls, service } = createService()
  const controller = controllerFor(service)

  const { res, errors } = await invoke(
    controller.create,
    createRequest({
      body: {
        targetType: 'event',
        targetId: POST_ID,
        reason: 'spam',
      },
    }),
  )

  assert.equal(errors.length, 1)
  assert.ok(errors[0] instanceof ValidationError)
  assert.equal(errors[0].code, 'VALIDATION_ERROR')
  assert.equal(errors[0].status, 400)
  assert.equal(res.statusCode, null)
  assert.equal(res.body, undefined)
  assert.deepEqual(calls.createReport, [])
})

test('service errors are forwarded to the error middleware', async () => {
  const { service } = createService({
    createReport: new ReportNotFoundError(),
  })
  const controller = controllerFor(service)

  const { res, errors } = await invoke(
    controller.create,
    createRequest({
      body: {
        targetType: 'post',
        targetId: POST_ID,
        reason: 'spam',
      },
    }),
  )

  assert.equal(errors.length, 1)
  assert.ok(errors[0] instanceof ReportNotFoundError)
  assert.equal(errors[0].code, 'REPORT_NOT_FOUND')
  assert.equal(errors[0].status, 404)
  assert.equal(res.statusCode, null)
  assert.equal(res.body, undefined)
})

test('updateStatus rejects invalid transitions', async () => {
  const { service } = createService({
    updateReportStatus: new ReportStateConflictError(),
  })
  const controller = controllerFor(service)

  const { res, errors } = await invoke(
    controller.updateStatus,
    createRequest({
      auth: { userId: ADMIN_ID, role: 'admin' },
      params: { reportId: REPORT_ID },
      body: { status: 'dismissed' },
    }),
  )

  assert.equal(errors.length, 1)
  assert.ok(errors[0] instanceof ReportStateConflictError)
  assert.equal(errors[0].code, 'REPORT_STATE_CONFLICT')
  assert.equal(errors[0].status, 409)
  assert.equal(res.statusCode, null)
  assert.equal(res.body, undefined)
})
