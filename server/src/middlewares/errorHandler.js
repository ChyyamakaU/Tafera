const env = require('../config/env')

const isProduction = env.NODE_ENV === 'production'

const DEFAULT_MESSAGES = {
  400: 'The request could not be processed.',
  401: 'Authentication is required.',
  403: 'You are not allowed to perform this action.',
  404: 'The requested resource was not found.',
  409: 'The request conflicts with the current state of the resource.',
  413: 'The request body is too large.',
  415: 'The request uses an unsupported media type.',
  422: 'The request could not be validated.',
  429: 'Too many requests. Please try again later.',
  500: 'An unexpected error occurred.',
  503: 'The service is temporarily unavailable.',
}

const DEFAULT_CODES = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
  503: 'SERVICE_UNAVAILABLE',
}

const DATABASE_ERROR_NAMES = new Set([
  'SequelizeValidationError',
  'SequelizeUniqueConstraintError',
  'SequelizeForeignKeyConstraintError',
  'SequelizeExclusionConstraintError',
  'SequelizeDatabaseError',
  'SequelizeConnectionError',
  'SequelizeConnectionRefusedError',
  'SequelizeConnectionTimedOutError',
  'SequelizeConnectionAcquireTimeoutError',
  'SequelizeTimeoutError',
])

const isBodyParserError = (err) =>
  typeof err.type === 'string' &&
  (err.type.startsWith('entity.') ||
    err.type.startsWith('encoding.') ||
    err.type.startsWith('charset.'))

const normalizeStatus = (value) =>
  Number.isInteger(value) && value >= 400 && value <= 599 ? value : 500

const normalizeError = (err) => {
  if (err.type === 'entity.parse.failed') {
    return {
      status: 400,
      code: 'INVALID_JSON',
      message: 'Request body contains malformed JSON.',
      isBodyParserError: true,
    }
  }

  if (err.type === 'entity.too.large') {
    return {
      status: 413,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request body exceeds the allowed size.',
      isBodyParserError: true,
    }
  }

  if (isBodyParserError(err)) {
    return {
      status: 415,
      code: 'UNSUPPORTED_MEDIA_TYPE',
      message: DEFAULT_MESSAGES[415],
      isBodyParserError: true,
    }
  }

  if (err.name === 'SequelizeValidationError') {
    return {
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'The request could not be validated.',
      isDatabaseError: true,
    }
  }

  if (err.name === 'SequelizeUniqueConstraintError') {
    return {
      status: 409,
      code: 'CONFLICT',
      message: 'A record with these values already exists.',
      isDatabaseError: true,
    }
  }

  if (
    err.name === 'SequelizeForeignKeyConstraintError' ||
    err.name === 'SequelizeExclusionConstraintError'
  ) {
    return {
      status: 409,
      code: 'CONFLICT',
      message: DEFAULT_MESSAGES[409],
      isDatabaseError: true,
    }
  }

  if (
    err.name === 'SequelizeConnectionError' ||
    err.name === 'SequelizeConnectionRefusedError' ||
    err.name === 'SequelizeConnectionTimedOutError' ||
    err.name === 'SequelizeConnectionAcquireTimeoutError' ||
    err.name === 'SequelizeTimeoutError'
  ) {
    return {
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: DEFAULT_MESSAGES[503],
      isDatabaseError: true,
    }
  }

  if (DATABASE_ERROR_NAMES.has(err.name)) {
    return {
      status: 500,
      code: 'INTERNAL_ERROR',
      message: DEFAULT_MESSAGES[500],
      isDatabaseError: true,
    }
  }

  const rawStatus = err.status ?? err.statusCode
  const status = normalizeStatus(Number(rawStatus))

  // Operational overload responses are safe to expose, but never include
  // stack traces or internal details for them.
  if (err.code === 'PASSWORD_SERVICE_BUSY' && status === 503) {
    return {
      status: 503,
      code: 'PASSWORD_SERVICE_BUSY',
      message: 'The password service is temporarily busy. Please try again later.',
      isPublicServiceError: true,
    }
  }

  if (err.expose && status < 500) {
    return {
      status,
      code: err.code || DEFAULT_CODES[status] || 'REQUEST_ERROR',
      message: err.message || DEFAULT_MESSAGES[status],
    }
  }

  return {
    status,
    code:
      status === 500
        ? 'INTERNAL_ERROR'
        : DEFAULT_CODES[status] || 'REQUEST_ERROR',
    message: DEFAULT_MESSAGES[status] || DEFAULT_MESSAGES[500],
  }
}

const buildValidationDetails = (err) => {
  if (!Array.isArray(err.errors)) return undefined

  const details = err.errors
    .map(({ path, message }) => ({
      field: path,
      message,
    }))
    .filter(({ field, message }) => Boolean(field || message))

  return details.length > 0 ? details : undefined
}

const buildUniqueDetails = (err) => {
  if (!Array.isArray(err.errors)) return undefined

  const details = err.errors
    .map(({ path }) => ({ field: path, message: 'already in use' }))
    .filter(({ field }) => Boolean(field))

  return details.length > 0 ? details : undefined
}

const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err)
  }

  const normalized = normalizeError(err)
  const status = normalized.status

  const path = (req.originalUrl || req.url || '').split('?')[0]
  const logMessage = `[error] ${req.method} ${path} -> ${status} ${normalized.code}`
  const safeLog = err && (err.stack || err.message || String(err))

  if (status >= 500) {
    console.error(logMessage, safeLog)
  } else if (!isProduction) {
    console.warn(logMessage)
  }

  const body = {
    error: {
      code: normalized.code,
      message: normalized.message,
      status,
    },
  }

  if (!isProduction) {
    if (err.name === 'SequelizeValidationError') {
      body.error.details = buildValidationDetails(err)
    } else if (err.name === 'SequelizeUniqueConstraintError') {
      body.error.details = buildUniqueDetails(err)
    } else if (
      !normalized.isDatabaseError &&
      !normalized.isBodyParserError &&
      !normalized.isPublicServiceError &&
      err.details
    ) {
      body.error.details = err.details
    }
  }

  if (
    !isProduction &&
    !normalized.isDatabaseError &&
    !normalized.isBodyParserError &&
    !normalized.isPublicServiceError
  ) {
    body.error.stack = err.stack
  }

  res.set('Cache-Control', 'no-store').status(status).json(body)
}

module.exports = errorHandler
