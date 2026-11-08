const session = require('express-session')
const { RedisStore } = require('connect-redis')
const { client } = require('./redis')
const env = require('./env')

const sessionMiddleware = session({
  store: new RedisStore({
    client,
    prefix: 'tafera:sess:',
  }),
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
})

module.exports = sessionMiddleware
