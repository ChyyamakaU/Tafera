'use strict'

const { RedisStore } = require('connect-redis')
const { getSessionTtlSeconds } = require('./sessionPolicy')
const { logSecurityEvent } = require('../utils/securityLog')
const { SessionStoreUnavailableError } = require('../utils/sessionErrors')

const withSafeErrors = (operation, callback) => (err, data) => {
  if (!err) {
    return callback(null, data)
  }

  logSecurityEvent(
    'session_store_error',
    {
      operation,
      outcome: 'failure',
      errorCode: err.code || err.name || 'SESSION_STORE_ERROR',
    },
    'error',
  )

  return callback(new SessionStoreUnavailableError(err))
}

// connect-redis derives TTL from the cookie by default. That would allow
// rolling renewal to outlive the absolute expiry, so Tafera always derives TTL
// from the session's own metadata instead.
class TaferaSessionStore extends RedisStore {
  getTTL(session) {
    return getSessionTtlSeconds(session)
  }

  get(sid, callback) {
    if (typeof callback !== 'function') return super.get(sid)
    return super.get(sid, withSafeErrors('get', callback))
  }

  set(sid, session, callback) {
    if (typeof callback !== 'function') return super.set(sid, session)
    return super.set(sid, session, withSafeErrors('set', callback))
  }

  touch(sid, session, callback) {
    if (typeof callback !== 'function') return super.touch(sid, session)
    return super.touch(sid, session, withSafeErrors('touch', callback))
  }

  destroy(sid, callback) {
    if (typeof callback !== 'function') return super.destroy(sid)
    return super.destroy(sid, withSafeErrors('destroy', callback))
  }

  clear(callback) {
    if (typeof callback !== 'function') return super.clear()
    return super.clear(withSafeErrors('clear', callback))
  }

  length(callback) {
    if (typeof callback !== 'function') return super.length()
    return super.length(withSafeErrors('length', callback))
  }

  ids(callback) {
    if (typeof callback !== 'function') return super.ids()
    return super.ids(withSafeErrors('ids', callback))
  }

  all(callback) {
    if (typeof callback !== 'function') return super.all()
    return super.all(withSafeErrors('all', callback))
  }
}

module.exports = { TaferaSessionStore }
