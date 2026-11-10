'use strict'

const UNIT_MS = Object.freeze({
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
  y: 365 * 24 * 60 * 60 * 1000,
})

const DURATION_PATTERN = /^(\d+)(ms|[smhdwy])?$/i

// Accepts the same duration syntax used by the JWT environment variables.
// A bare number is interpreted as seconds, matching common Node conventions.
const parseDurationMs = (value) => {
  const match = DURATION_PATTERN.exec(String(value).trim())

  if (!match) {
    throw new TypeError('Duration must look like 30m, 24h, 7d or a number of seconds')
  }

  const amount = Number(match[1])
  const unit = (match[2] || 's').toLowerCase()
  const milliseconds = amount * UNIT_MS[unit]

  if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0) {
    throw new TypeError('Duration must be a positive, finite value')
  }

  return milliseconds
}

module.exports = {
  DURATION_PATTERN,
  parseDurationMs,
}
