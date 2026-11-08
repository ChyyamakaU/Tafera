const { createClient } = require('redis')
const env = require('./env')

const client = createClient({
  url: env.REDIS_URL,
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 5) return new Error('Redis reconnect limit reached')
      return Math.min(retries * 200, 2000)
    },
  },
})

client.on('error', (err) => {
  console.error('Redis error:', err.message)
})

const connectRedis = async () => {
  if (client.isOpen) return

  try {
    await client.connect()
  } catch (err) {
    const reason = err && err.message ? ` (${err.message})` : ''
    throw new Error(
      `Redis is unavailable${reason}. Redis is required for session storage and rate limiting; start Redis and restart the API.`,
      { cause: err },
    )
  }
}

module.exports = { client, connectRedis }
