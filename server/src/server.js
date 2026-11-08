/* eslint-disable no-undef */
const env = require('./config/env')
const sequelize = require('./config/db')
const { client, connectRedis } = require('./config/redis')

const start = async () => {
  try {
    await sequelize.authenticate()
    console.log('PostgreSQL connected')
  } catch (err) {
    console.error('PostgreSQL connection failed:', err.message)
  }

  try {
    await connectRedis()
    console.log('Redis connected')
  } catch (err) {
    console.error('Redis connection failed:', err.message)
  }

  // Loaded after Redis is connected so the rate-limit store initializes correctly.
  const app = require('./app')

  const server = app.listen(env.PORT, () => {
    console.log(`Tafera API running on port ${env.PORT} (${env.NODE_ENV})`)
  })

  const shutdown = async () => {
    console.log('Shutting down...')
    server.close()
    if (client.isOpen) await client.quit()
    await sequelize.close()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

start()
