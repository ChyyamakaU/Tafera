'use strict'

const { AuthError } = require('./authErrors')

// Reports are private moderation records. Missing reports and reports owned
// by another user return the same error so ownership cannot be enumerated.
// Error messages never expose internal database identifiers or schema details.
class ReportDuplicateError extends AuthError {
  constructor() {
    super({
      message: 'You already have an active report for this target.',
      code: 'REPORT_DUPLICATE',
      status: 409,
    })
    this.name = 'ReportDuplicateError'
  }
}

class ReportInvalidTargetTypeError extends AuthError {
  constructor() {
    super({
      message: 'Invalid report target type.',
      code: 'REPORT_INVALID_TARGET_TYPE',
      status: 400,
    })
    this.name = 'ReportInvalidTargetTypeError'
  }
}

class ReportTargetNotFoundError extends AuthError {
  constructor() {
    super({
      message: 'Report target not found.',
      code: 'REPORT_TARGET_NOT_FOUND',
      status: 404,
    })
    this.name = 'ReportTargetNotFoundError'
  }
}

class ReportSelfReportError extends AuthError {
  constructor() {
    super({
      message: 'You cannot report yourself.',
      code: 'REPORT_SELF_REPORT',
      status: 409,
    })
    this.name = 'ReportSelfReportError'
  }
}

class ReportNotFoundError extends AuthError {
  constructor() {
    super({
      message: 'Report not found.',
      code: 'REPORT_NOT_FOUND',
      status: 404,
    })
    this.name = 'ReportNotFoundError'
  }
}

class ReportStateConflictError extends AuthError {
  constructor() {
    super({
      message:
        'The report status cannot be changed from its current state.',
      code: 'REPORT_STATE_CONFLICT',
      status: 409,
    })
    this.name = 'ReportStateConflictError'
  }
}

class ReportAdminRequiredError extends AuthError {
  constructor() {
    super({
      message: 'Admin access required.',
      code: 'REPORT_ADMIN_REQUIRED',
      status: 403,
    })
    this.name = 'ReportAdminRequiredError'
  }
}

module.exports = {
  ReportAdminRequiredError,
  ReportDuplicateError,
  ReportInvalidTargetTypeError,
  ReportNotFoundError,
  ReportSelfReportError,
  ReportStateConflictError,
  ReportTargetNotFoundError,
}
