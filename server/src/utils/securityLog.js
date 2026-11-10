'use strict'

// Structured security events deliberately use an allowlist of fields. Session
// identifiers, cookie values, CSRF secrets, user records and Redis URLs must
// never reach the logs, even if a caller passes them by mistake.
const SAFE_FIELDS = Object.freeze([
  'count',
  'errorCode',
  'operation',
  'outcome',
  'reason',
  'role',
])

const toSafeDetails = (details) => {
  if (!details || typeof details !== 'object') return {}

  const safe = {}

  for (const field of SAFE_FIELDS) {
    const value = details[field]

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      safe[field] = value
    }
  }

  return safe
}

const logSecurityEvent = (event, details = {}, level = 'info') => {
  const write =
    level === 'warn'
      ? console.warn
      : level === 'error'
        ? console.error
        : console.info

  write(
    JSON.stringify({
      type: 'security',
      event,
      timestamp: new Date().toISOString(),
      ...toSafeDetails(details),
    }),
  )
}

module.exports = {
  SAFE_FIELDS,
  logSecurityEvent,
}
