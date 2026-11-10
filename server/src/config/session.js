'use strict'

const session = require('express-session')
const env = require('./env')
const { client } = require('./redis')
const { TaferaSessionStore } = require('./sessionStore')
const {
  getSessionCookieName,
  getSessionCookieOptions,
  getSessionStorePrefix,
  getSessionPolicy,
} = require('./sessionPolicy')

// The cookie is initially issued with the anonymous idle window. Once a
// session is authenticated, sessionService replaces this with the role's
// policy, always capped by the remaining absolute lifetime.
const INITIAL_COOKIE_MAX_AGE_MS = getSessionPolicy('anonymous').idleMs

const createSessionMiddleware = ({
  nodeEnv = env.NODE_ENV,
  namespace = env.SESSION_NAMESPACE,
  client: redisClient = client,
  secret = env.SESSION_SECRET,
} = {}) => {
  // getSessionCookieOptions sets Path=/ and never sets Domain, which is
  // required for the __Host- prefix in production.
  const cookie = getSessionCookieOptions(
    nodeEnv,
    INITIAL_COOKIE_MAX_AGE_MS,
  )

  return session({
    store: new TaferaSessionStore({
      client: redisClient,
      prefix: getSessionStorePrefix(namespace),
    }),
    name: getSessionCookieName(nodeEnv),
    secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie,
  })
}

const sessionMiddleware = createSessionMiddleware()

module.exports = sessionMiddleware
module.exports.createSessionMiddleware = createSessionMiddleware
