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

class TripParticipationNotFoundError extends AuthError {
  constructor() {
    super({
      message: 'Trip participation not found.',
      code: 'TRIP_PARTICIPATION_NOT_FOUND',
      status: 404,
    })
    this.name = 'TripParticipationNotFoundError'
  }
}

class TripParticipationExistsError extends AuthError {
  constructor() {
    super({
      message: 'A participation request already exists for this trip.',
      code: 'TRIP_PARTICIPATION_EXISTS',
      status: 409,
    })
    this.name = 'TripParticipationExistsError'
  }
}

class TripNotJoinableError extends AuthError {
  constructor() {
    super({
      message: 'This trip cannot be joined.',
      code: 'TRIP_NOT_JOINABLE',
      status: 409,
    })
    this.name = 'TripNotJoinableError'
  }
}

class TripOwnerCannotJoinError extends AuthError {
  constructor() {
    super({
      message: 'The trip owner cannot join their own trip.',
      code: 'TRIP_OWNER_CANNOT_JOIN',
      status: 409,
    })
    this.name = 'TripOwnerCannotJoinError'
  }
}

class TripFullError extends AuthError {
  constructor() {
    super({
      message: 'This trip is full.',
      code: 'TRIP_FULL',
      status: 409,
    })
    this.name = 'TripFullError'
  }
}

class TripParticipationStateConflictError extends AuthError {
  constructor() {
    super({
      message:
        'The participation status cannot be changed from its current state.',
      code: 'TRIP_PARTICIPATION_STATE_CONFLICT',
      status: 409,
    })
    this.name = 'TripParticipationStateConflictError'
  }
}

class TripParticipantLimitConflictError extends AuthError {
  constructor() {
    super({
      message:
        'The participant limit cannot be lower than the current approved participants.',
      code: 'TRIP_PARTICIPANT_LIMIT_CONFLICT',
      status: 409,
    })
    this.name = 'TripParticipantLimitConflictError'
  }
}

module.exports = {
  TripDatesConflictError,
  TripFullError,
  TripNotFoundError,
  TripNotJoinableError,
  TripOwnerCannotJoinError,
  TripParticipantLimitConflictError,
  TripParticipationExistsError,
  TripParticipationNotFoundError,
  TripParticipationStateConflictError,
  TripStopExistsError,
  TripStopNotFoundError,
  TripStopOrderConflictError,
}
