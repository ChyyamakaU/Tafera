'use strict'

class AdminError extends Error {
  constructor(message, { status = 400, code = 'ADMIN_ERROR', details } = {}) {
    super(message)
    this.name = this.constructor.name
    this.status = status
    this.code = code
    this.expose = status < 500
    if (details) {
      this.details = details
    }
  }
}

class AdminSelfActionError extends AdminError {
  constructor(message = 'You cannot suspend or demote your own administrator account.') {
    super(message, { status: 400, code: 'ADMIN_SELF_ACTION_FORBIDDEN' })
  }
}

class AdminTargetNotFoundError extends AdminError {
  constructor(message = 'The requested record could not be found.') {
    super(message, { status: 404, code: 'NOT_FOUND' })
  }
}

class AdminConflictError extends AdminError {
  constructor(message = 'This action conflicts with existing data.') {
    super(message, { status: 409, code: 'CONFLICT' })
  }
}

module.exports = {
  AdminError,
  AdminSelfActionError,
  AdminTargetNotFoundError,
  AdminConflictError,
}
