'use strict'

const { ReportAdminRequiredError } = require('../utils/reportErrors')

// Admin-only authorization guard. It must run after the standard
// authenticate middleware, which is the only component allowed to establish
// req.auth. Running this middleware without authentication can never grant
// access: a missing or incomplete auth context is rejected rather than
// allowed through.
//
// The role is always read from req.auth, which authenticate populates from
// the database. The request body and session are never trusted for the role.
const createRequireAdmin = ({} = {}) => {
  return (req, res, next) => {
    const role = req.auth && req.auth.role

    if (role !== 'admin') {
      next(new ReportAdminRequiredError())
      return
    }

    next()
  }
}

const requireAdmin = createRequireAdmin()

module.exports = requireAdmin
module.exports.createRequireAdmin = createRequireAdmin
