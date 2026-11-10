'use strict'

// A deliberately opaque error for session-store and session-index failures.
// The original cause is preserved for diagnostics but is never serialised or
// logged, because Redis errors can contain connection details.
class SessionStoreUnavailableError extends Error {
  constructor(cause) {
    super('Session storage is temporarily unavailable.')
    this.name = 'SessionStoreUnavailableError'
    this.code = 'SESSION_STORE_UNAVAILABLE'
    this.status = 503
    this.expose = false

    if (cause !== undefined) {
      this.cause = cause
    }
  }
}

module.exports = { SessionStoreUnavailableError }
