// Centralised mapping of backend error codes and HTTP statuses to
// user-facing messages. Every message here is safe to display to users and
// never exposes database errors, SQL messages, stack traces, internal paths
// or other technical details.
//
// Backend errors always arrive with a `code` (e.g. INVALID_CREDENTIALS) and a
// `status` (HTTP status code). Validation errors additionally include a
// `details` array with field-level messages that are preserved and shown next
// to the relevant inputs.

const FALLBACK_MESSAGE =
  'An unexpected error occurred. Please try again later.'

// Messages keyed by backend error code. These take precedence over status-based
// messages because they are more specific.
const CODE_MESSAGES = {
  // Authentication
  INVALID_CREDENTIALS:
    "The email or password you entered is incorrect. Please check your details and try again.",
  EMAIL_IN_USE:
    "An account with this email address already exists. Try signing in instead.",
  SESSION_INVALID: 'Your session has expired. Please sign in again.',
  AUTH_REQUIRED: 'Please sign in to continue.',
  ACCOUNT_INACTIVE: 'This account is not eligible to sign in.',
  EMAIL_VERIFICATION_REQUIRED:
    'Please verify your email address before continuing.',
  VERIFICATION_TOKEN_INVALID:
    'This verification link is invalid or has expired. You can request another verification email.',
  EMAIL_VERIFICATION_RATE_LIMITED:
    'You have requested too many verification emails. Please wait a little while before trying again.',
  CSRF_TOKEN_INVALID:
    'The request could not be verified. Please refresh the page and try again.',

  // Rate limiting
  RATE_LIMITED: "You've made too many attempts. Please wait a little while before trying again.",

  // Validation
  VALIDATION_ERROR: 'Please check the form and correct the errors below.',

  // Authorisation / resources
  FORBIDDEN: 'You are not allowed to perform this action.',
  NOT_FOUND: 'The requested resource could not be found.',
  PROFILE_NOT_FOUND: 'This profile could not be found.',
  POST_NOT_FOUND: 'This post could not be found.',
  COMMENT_NOT_FOUND: 'This comment could not be found.',
  FOLLOW_NOT_FOUND: 'This follow relationship could not be found.',
  FOLLOW_EXISTS: 'You already follow this user.',
  POST_ACCESS_DENIED: 'You are not allowed to modify this post.',
  COMMENT_ACCESS_DENIED: 'You are not allowed to modify this comment.',

  // Service / network
  SERVICE_UNAVAILABLE: 'The server is temporarily unavailable. Please try again later.',
  EMAIL_DELIVERY_UNAVAILABLE:
    'Email delivery is not available right now. Please try again later.',
  PASSWORD_SERVICE_BUSY:
    'The password service is temporarily busy. Please try again later.',
  NETWORK_ERROR:
    'Unable to connect to the server. Please check your internet connection and try again.',
  INTERNAL_ERROR: 'An unexpected error occurred. Please try again later.',
  REQUEST_ERROR: 'The request could not be completed. Please try again.',
}

// Messages keyed by HTTP status, used when no more specific code mapping
// exists.
const STATUS_MESSAGES = {
  400: 'The request could not be processed.',
  401: 'Please sign in to continue.',
  403: 'You are not allowed to perform this action.',
  404: 'The requested resource could not be found.',
  409: 'This request conflicts with the current state. Please try again.',
  413: 'The request body is too large.',
  415: 'The request uses an unsupported media type.',
  422: 'The request could not be validated.',
  429: "You've made too many attempts. Please wait a little while before trying again.",
  500: 'An unexpected error occurred. Please try again later.',
  503: 'The server is temporarily unavailable. Please try again later.',
}

// Convert a Retry-After value (seconds) into a human-readable waiting period.
const formatRetryAfter = (retryAfterSeconds) => {
  const seconds = Number(retryAfterSeconds)
  if (!Number.isFinite(seconds) || seconds <= 0) return null

  if (seconds < 60) {
    return `${seconds} second${seconds > 1 ? 's' : ''}`
  }

  const minutes = Math.ceil(seconds / 60)
  if (minutes >= 1) {
    return `${minutes} minute${minutes > 1 ? 's' : ''}`
  }
  return `${seconds} second${seconds > 1 ? 's' : ''}`
}

// Map an error thrown by the API client (or any error object) to a safe,
// user-facing message.
const getErrorMessage = (error) => {
  if (!error) return FALLBACK_MESSAGE

  // Network failures have no HTTP response.
  if (error.isNetworkError) {
    return CODE_MESSAGES.NETWORK_ERROR
  }

  // Rate-limited responses may include a retry-after period supplied by the
  // backend (Retry-After header / retryAfterSeconds).
  if (
    error.code === 'RATE_LIMITED' ||
    error.code === 'EMAIL_VERIFICATION_RATE_LIMITED' ||
    error.status === 429
  ) {
    const period = formatRetryAfter(error.retryAfterSeconds)
    if (period) {
      return `You've made too many attempts. Please wait about ${period} before trying again.`
    }
    return CODE_MESSAGES.RATE_LIMITED
  }

  // Most specific match: backend error code.
  if (error.code && CODE_MESSAGES[error.code]) {
    return CODE_MESSAGES[error.code]
  }

  // The backend normalises all responses, so a message accompanied by a code
  // is a safe operational message. Use it directly when no code-specific map
  // entry exists, before falling back to a generic status message.
  if (error.message && error.code) {
    return error.message
  }

  // Next most specific: HTTP status. This also ensures generic request errors
  // such as "Request failed: 401" are never shown in place of a useful message.
  if (error.status && STATUS_MESSAGES[error.status]) {
    return STATUS_MESSAGES[error.status]
  }

  // A bare message with no code may come from the frontend itself; surface it
  // rather than a generic fallback.
  if (error.message) {
    return error.message
  }

  return FALLBACK_MESSAGE
}

// Extract field-level validation errors for display next to inputs.
const getFieldErrors = (error) => {
  if (!error || !Array.isArray(error.details)) return []

  return error.details
    .filter(
      (detail) => detail && typeof detail.field === 'string' && detail.message
    )
    .map((detail) => ({
      field: detail.field,
      message: detail.message,
    }))
}

export {
  FALLBACK_MESSAGE,
  CODE_MESSAGES,
  STATUS_MESSAGES,
  formatRetryAfter,
  getErrorMessage,
  getFieldErrors,
}
