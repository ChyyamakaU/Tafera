'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { AuthError } = require('../src/utils/authErrors')
const {
  ReportAdminRequiredError,
  ReportDuplicateError,
  ReportInvalidTargetTypeError,
  ReportNotFoundError,
  ReportSelfReportError,
  ReportStateConflictError,
  ReportTargetNotFoundError,
} = require('../src/utils/reportErrors')

const CASES = [
  [
    ReportDuplicateError,
    'ReportDuplicateError',
    'REPORT_DUPLICATE',
    409,
  ],
  [
    ReportInvalidTargetTypeError,
    'ReportInvalidTargetTypeError',
    'REPORT_INVALID_TARGET_TYPE',
    400,
  ],
  [
    ReportTargetNotFoundError,
    'ReportTargetNotFoundError',
    'REPORT_TARGET_NOT_FOUND',
    404,
  ],
  [
    ReportSelfReportError,
    'ReportSelfReportError',
    'REPORT_SELF_REPORT',
    409,
  ],
  [
    ReportNotFoundError,
    'ReportNotFoundError',
    'REPORT_NOT_FOUND',
    404,
  ],
  [
    ReportStateConflictError,
    'ReportStateConflictError',
    'REPORT_STATE_CONFLICT',
    409,
  ],
  [
    ReportAdminRequiredError,
    'ReportAdminRequiredError',
    'REPORT_ADMIN_REQUIRED',
    403,
  ],
]

for (const [ErrorClass, name, code, status] of CASES) {
  test(`${name} exposes the report error contract`, () => {
    const error = new ErrorClass()

    assert.ok(error instanceof AuthError)
    assert.ok(error instanceof Error)
    assert.equal(error.name, name)
    assert.equal(error.code, code)
    assert.equal(error.status, status)
    assert.equal(error.expose, true)
    assert.equal(typeof error.message, 'string')
    assert.ok(error.message.length > 0)
    assert.doesNotMatch(error.message, /password|token|session/i)
  })
}
