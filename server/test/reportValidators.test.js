'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { ValidationError } = require('../src/utils/authErrors')
const {
  ADMIN_REVIEW_STATUSES,
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  DESCRIPTION_MAX_LENGTH,
  MAX_LIMIT,
  parseCreateReport,
  parseReporterReportListQuery,
  parseReportId,
  parseReportListQuery,
  parseUpdateReportStatus,
  REPORT_REASONS,
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
  reasonSchema,
  targetTypeSchema,
} = require('../src/validators/report')

const REPORT_ID = '11111111-1111-4111-8111-111111111111'
const TARGET_ID = '22222222-2222-4222-8222-222222222222'

const assertValidationError = (callback) => {
  let caught

  try {
    callback()
  } catch (error) {
    caught = error
  }

  assert.ok(caught instanceof ValidationError)
  assert.equal(caught.code, 'VALIDATION_ERROR')
  assert.equal(caught.status, 400)
  assert.equal(caught.expose, true)
  assert.ok(Array.isArray(caught.details))
  assert.ok(caught.details.length > 0)

  return caught
}

test('report submission validates target type', () => {
  for (const targetType of REPORT_TARGET_TYPES) {
    const parsed = parseCreateReport({
      targetType,
      targetId: TARGET_ID,
      reason: 'spam',
    })
    assert.equal(parsed.targetType, targetType)
  }

  assertValidationError(() =>
    parseCreateReport({ targetType: 'event', targetId: TARGET_ID, reason: 'spam' }),
  )
  assertValidationError(() =>
    parseCreateReport({ targetType: '', targetId: TARGET_ID, reason: 'spam' }),
  )
  assertValidationError(() =>
    parseCreateReport({ targetId: TARGET_ID, reason: 'spam' }),
  )
})

test('report submission validates target ID as UUID', () => {
  assert.deepEqual(
    parseCreateReport({
      targetType: 'post',
      targetId: TARGET_ID.toUpperCase(),
      reason: 'spam',
    }),
    { targetType: 'post', targetId: TARGET_ID, reason: 'spam' },
  )

  assert.deepEqual(
    parseCreateReport({
      targetType: 'post',
      targetId: ` ${TARGET_ID} `,
      reason: 'spam',
    }),
    { targetType: 'post', targetId: TARGET_ID, reason: 'spam' },
  )

  assertValidationError(() =>
    parseCreateReport({ targetType: 'post', targetId: 'not-a-uuid', reason: 'spam' }),
  )
  assertValidationError(() =>
    parseCreateReport({ targetType: 'post', reason: 'spam' }),
  )
})

test('report submission validates reason', () => {
  for (const reason of REPORT_REASONS) {
    const parsed = parseCreateReport({
      targetType: 'post',
      targetId: TARGET_ID,
      reason,
    })
    assert.equal(parsed.reason, reason)
  }

  assertValidationError(() =>
    parseCreateReport({ targetType: 'post', targetId: TARGET_ID, reason: 'abuse' }),
  )
  assertValidationError(() =>
    parseCreateReport({ targetType: 'post', targetId: TARGET_ID }),
  )
})

test('report submission validates optional description', () => {
  const parsed = parseCreateReport({
    targetType: 'post',
    targetId: TARGET_ID,
    reason: 'spam',
    description: '  Harassment details  ',
  })
  assert.equal(parsed.description, 'Harassment details')

  assert.deepEqual(
    parseCreateReport({
      targetType: 'post',
      targetId: TARGET_ID,
      reason: 'spam',
    }),
    { targetType: 'post', targetId: TARGET_ID, reason: 'spam' },
  )

  assert.deepEqual(
    parseCreateReport({
      targetType: 'post',
      targetId: TARGET_ID,
      reason: 'spam',
      description: '',
    }),
    { targetType: 'post', targetId: TARGET_ID, reason: 'spam', description: null },
  )

  assert.deepEqual(
    parseCreateReport({
      targetType: 'post',
      targetId: TARGET_ID,
      reason: 'spam',
      description: null,
    }),
    { targetType: 'post', targetId: TARGET_ID, reason: 'spam', description: null },
  )

  const maximum = 'a'.repeat(DESCRIPTION_MAX_LENGTH)
  assert.equal(
    parseCreateReport({
      targetType: 'post',
      targetId: TARGET_ID,
      reason: 'spam',
      description: maximum,
    }).description,
    maximum,
  )

  assertValidationError(() =>
    parseCreateReport({
      targetType: 'post',
      targetId: TARGET_ID,
      reason: 'spam',
      description: 'a'.repeat(DESCRIPTION_MAX_LENGTH + 1),
    }),
  )
})

test('report submission strips unknown fields', () => {
  const parsed = parseCreateReport({
    targetType: 'post',
    targetId: TARGET_ID,
    reason: 'spam',
    reporterId: 'attacker-controlled',
    status: 'resolved',
    createdAt: '2020-01-01T00:00:00.000Z',
  })

  assert.deepEqual(parsed, {
    targetType: 'post',
    targetId: TARGET_ID,
    reason: 'spam',
  })
  assert.equal(Object.hasOwn(parsed, 'reporterId'), false)
  assert.equal(Object.hasOwn(parsed, 'status'), false)
  assert.equal(Object.hasOwn(parsed, 'createdAt'), false)
})

test('report ID parameters are validated and normalized', () => {
  assert.deepEqual(parseReportId({ reportId: REPORT_ID }), {
    reportId: REPORT_ID,
  })
  assert.deepEqual(
    parseReportId({ reportId: REPORT_ID.toUpperCase() }),
    { reportId: REPORT_ID },
  )
  assert.deepEqual(
    parseReportId({ reportId: ` ${REPORT_ID} ` }),
    { reportId: REPORT_ID },
  )

  assertValidationError(() => parseReportId({ reportId: 'not-a-uuid' }))
  assertValidationError(() => parseReportId({}))
  assertValidationError(() => parseReportId({ reportId: '' }))
})

test('admin report list query applies pagination and optional filters', () => {
  assert.deepEqual(parseReportListQuery({}), {
    page: DEFAULT_PAGE,
    limit: DEFAULT_LIMIT,
  })
  assert.deepEqual(
    parseReportListQuery({ page: '3', limit: '10' }),
    { page: 3, limit: 10 },
  )

  for (const status of REPORT_STATUSES) {
    assert.deepEqual(
      parseReportListQuery({ page: '1', limit: '10', status }),
      { page: 1, limit: 10, status },
    )
  }

  for (const targetType of REPORT_TARGET_TYPES) {
    assert.deepEqual(
      parseReportListQuery({ page: '1', limit: '10', targetType }),
      { page: 1, limit: 10, targetType },
    )
  }

  assertValidationError(() => parseReportListQuery({ status: 'under-review' }))
  assertValidationError(() => parseReportListQuery({ targetType: 'event' }))
  assertValidationError(() => parseReportListQuery({ page: '0' }))
  assertValidationError(() =>
    parseReportListQuery({ limit: String(MAX_LIMIT + 1) }),
  )
})

test('reporter report list query applies pagination only', () => {
  assert.deepEqual(parseReporterReportListQuery({}), {
    page: DEFAULT_PAGE,
    limit: DEFAULT_LIMIT,
  })
  assert.deepEqual(
    parseReporterReportListQuery({ page: '2', limit: '5' }),
    { page: 2, limit: 5 },
  )

  // Admin-only filters are stripped, not accepted.
  const stripped = parseReporterReportListQuery({
    page: '1',
    limit: '10',
    status: 'pending',
    targetType: 'post',
  })
  assert.deepEqual(stripped, { page: 1, limit: 10 })
  assert.equal(Object.hasOwn(stripped, 'status'), false)
  assert.equal(Object.hasOwn(stripped, 'targetType'), false)
})

test('admin status update validates status and optional resolution note', () => {
  for (const status of ADMIN_REVIEW_STATUSES) {
    const parsed = parseUpdateReportStatus({ status })
    assert.equal(parsed.status, status)
  }

  const parsed = parseUpdateReportStatus({
    status: 'resolved',
    resolutionNote: '  Spam confirmed  ',
  })
  assert.equal(parsed.status, 'resolved')
  assert.equal(parsed.resolutionNote, 'Spam confirmed')

  assert.deepEqual(
    parseUpdateReportStatus({ status: 'dismissed', resolutionNote: '' }),
    { status: 'dismissed', resolutionNote: null },
  )
  assert.deepEqual(
    parseUpdateReportStatus({ status: 'dismissed', resolutionNote: null }),
    { status: 'dismissed', resolutionNote: null },
  )

  const maximum = 'a'.repeat(DESCRIPTION_MAX_LENGTH)
  assert.equal(
    parseUpdateReportStatus({ status: 'under_review', resolutionNote: maximum })
      .resolutionNote,
    maximum,
  )

  // 'pending' is not an admin-moderation target.
  assertValidationError(() => parseUpdateReportStatus({ status: 'pending' }))
  assertValidationError(() => parseUpdateReportStatus({}))
  // Unknown fields are stripped, not rejected.
  const stripped = parseUpdateReportStatus({
    status: 'resolved',
    reason: 'spam',
    reporterId: 'attacker-controlled',
  })
  assert.deepEqual(stripped, { status: 'resolved' })
  assert.equal(Object.hasOwn(stripped, 'reason'), false)
  assert.equal(Object.hasOwn(stripped, 'reporterId'), false)
})

test('invalid resolution note length is rejected', () => {
  assertValidationError(() =>
    parseUpdateReportStatus({
      status: 'resolved',
      resolutionNote: 'a'.repeat(DESCRIPTION_MAX_LENGTH + 1),
    }),
  )
})
