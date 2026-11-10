'use strict'

const { AuthError } = require('./authErrors')

// Missing and non-owned trips share the same response so ownership checks
// cannot be used to enumerate another user's trips.
class TripNotFoundError extends AuthError {
  constructor() {
    super({
      message: 'Trip not found.',
      code: 'TRIP_NOT_FOUND',
      status: 404,
    })
    this.name = 'TripNotFoundError'
  }
}

class TripStopNotFoundError extends AuthError {
  constructor() {
    super({
      message: 'Trip stop not found.',
      code: 'TRIP_STOP_NOT_FOUND',
      status: 404,
    })
    this.name = 'TripStopNotFoundError'
  }
}

class TripStopExistsError extends AuthError {
  constructor() {
    super({
      message: 'This destination is already a stop on this trip.',
      code: 'TRIP_STOP_EXISTS',
      status: 409,
    })
    this.name = 'TripStopExistsError'
  }
}

class TripStopOrderConflictError extends AuthError {
  constructor() {
    super({
      message: 'The stop order does not match the current stops.',
      code: 'TRIP_STOP_ORDER_CONFLICT',
      status: 409,
    })
    this.name = 'TripStopOrderConflictError'
  }
}

class TripDatesConflictError extends AuthError {
  constructor() {
    super({
      message: 'The trip dates would exclude an existing stop.',
      code: 'TRIP_DATES_CONFLICT',
      status: 409,
    })
    this.name = 'TripDatesConflictError'
  }
}

module.exports = {
  TripDatesConflictError,
  TripNotFoundError,
  TripStopExistsError,
  TripStopNotFoundError,
  TripStopOrderConflictError,
}
