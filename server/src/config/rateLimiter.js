const rateLimit = require('express-rate-limit')
const { RedisStore } = require('rate-limit-redis')
const { client } = require('./redis')

const createApiLimiter = () =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: client.isOpen
      ? new RedisStore({
          sendCommand: (...args) => client.sendCommand(args),
        })
      : undefined,
  })

module.exports = createApiLimiter
