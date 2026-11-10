/* eslint-disable no-undef */
'use strict'

const env = require('../config/env')
const { client: defaultClient } = require('../config/redis')
const {
  SESSION_POLICIES,
  DEFAULT_SESSION_NAMESPACE,
  getSessionStorePrefix,
  getUserSessionsKey,
} = require('../config/sessionPolicy')
const { logSecurityEvent } = require('../utils/securityLog')
const { SessionStoreUnavailableError } = require('../utils/sessionErrors')

const MAX_SESSIONS_PER_USER = 10
const INDEX_TTL_SECONDS =
  Math.ceil(SESSION_POLICIES.user.absoluteMs / 1000) + 60 * 60

const REGISTER_SESSION_SCRIPT = `
local indexKey = KEYS[1]
local sessionId = ARGV[1]
local score = tonumber(ARGV[2])
local maxSessions = tonumber(ARGV[3])
local sessionPrefix = ARGV[4]
local ttlSeconds = tonumber(ARGV[5])

redis.call('ZADD', indexKey, score, sessionId)

local count = redis.call('ZCARD', indexKey)
local removed = {}

if count > maxSessions then
  removed = redis.call('ZRANGE', indexKey, 0, count - maxSessions - 1)
  for i = 1, #removed do
    redis.call('DEL', sessionPrefix .. removed[i])
    redis.call('ZREM', indexKey, removed[i])
  end
end

-- Remove index entries whose session payload has already expired or been
-- destroyed. The new session is saved before this script runs, so it is kept.
local members = redis.call('ZRANGE', indexKey, 0, -1)
for i = 1, #members do
  if redis.call('EXISTS', sessionPrefix .. members[i]) == 0 then
    redis.call('ZREM', indexKey, members[i])
  end
end

redis.call('EXPIRE', indexKey, ttlSeconds)

return removed
`

const REVOKE_ALL_SESSIONS_SCRIPT = `
local indexKey = KEYS[1]
local sessionPrefix = ARGV[1]
local members = redis.call('ZRANGE', indexKey, 0, -1)

for i = 1, #members do
  redis.call('DEL', sessionPrefix .. members[i])
end

redis.call('DEL', indexKey)
return #members
`

const resolveNamespace = () =>
  env.SESSION_NAMESPACE || DEFAULT_SESSION_NAMESPACE

const createSessionIndex = ({
  client = defaultClient,
  namespace = resolveNamespace(),
  maxSessions = MAX_SESSIONS_PER_USER,
  indexTtlSeconds = INDEX_TTL_SECONDS,
} = {}) => {
  const sessionPrefix = getSessionStorePrefix(namespace)

  const fail = (operation, err) => {
    logSecurityEvent(
      'session_index_error',
      {
        operation,
        outcome: 'failure',
        errorCode: err.code || err.name || 'SESSION_INDEX_ERROR',
      },
      'error',
    )

    return new SessionStoreUnavailableError(err)
  }

  const registerSession = async ({
    userId,
    sessionId,
    createdAt = Date.now(),
  }) => {
    if (typeof userId !== 'string' || userId.length === 0) {
      throw new TypeError('userId is required')
    }

    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      throw new TypeError('sessionId is required')
    }

    if (!Number.isFinite(createdAt)) {
      throw new TypeError('createdAt must be a finite timestamp')
    }

    try {
      const removedSessionIds = await client.eval(REGISTER_SESSION_SCRIPT, {
        keys: [getUserSessionsKey(userId, namespace)],
        arguments: [
          sessionId,
          String(createdAt),
          String(maxSessions),
          sessionPrefix,
          String(indexTtlSeconds),
        ],
      })

      const removed = Array.isArray(removedSessionIds)
        ? removedSessionIds
        : []

      if (removed.length > 0) {
        logSecurityEvent('session_limit_enforced', {
          count: removed.length,
          outcome: 'success',
        })
      }

      return { removedSessionIds: removed }
    } catch (err) {
      throw fail('register', err)
    }
  }

  const removeSession = async ({ userId, sessionId }) => {
    if (typeof userId !== 'string' || typeof sessionId !== 'string') {
      return 0
    }

    try {
      return await client.zRem(
        getUserSessionsKey(userId, namespace),
        sessionId,
      )
    } catch (err) {
      throw fail('remove', err)
    }
  }

  const countSessions = async (userId) => {
    try {
      return await client.zCard(getUserSessionsKey(userId, namespace))
    } catch (err) {
      throw fail('count', err)
    }
  }

  const listSessions = async (userId) => {
    try {
      return await client.zRangeWithScores(
        getUserSessionsKey(userId, namespace),
        0,
        -1,
      )
    } catch (err) {
      throw fail('list', err)
    }
  }

  const revokeAllSessions = async (userId) => {
    try {
      const count = await client.eval(REVOKE_ALL_SESSIONS_SCRIPT, {
        keys: [getUserSessionsKey(userId, namespace)],
        arguments: [sessionPrefix],
      })

      const revoked = Number(count) || 0

      if (revoked > 0) {
        logSecurityEvent('session_revoked_all', {
          count: revoked,
          outcome: 'success',
        })
      }

      return revoked
    } catch (err) {
      throw fail('revoke_all', err)
    }
  }

  return {
    namespace,
    sessionPrefix,
    maxSessions,
    indexTtlSeconds,
    registerSession,
    removeSession,
    countSessions,
    listSessions,
    revokeAllSessions,
  }
}

const sessionIndex = createSessionIndex()

module.exports = {
  MAX_SESSIONS_PER_USER,
  INDEX_TTL_SECONDS,
  createSessionIndex,
  sessionIndex,
}
