/* eslint-disable no-undef */
const http = require('http')
const env = require('./config/env')
const sequelize = require('./config/db')
const { client, connectRedis } = require('./config/redis')

const SHUTDOWN_TIMEOUT_MS = 10000

let server = null
let shutdownStarted = false

const closeHttpServer = () =>
  new Promise((resolve) => {
    if (!server || !server.listening) {
      return resolve()
    }

    server.close((err) => {
      if (err) {
        console.error('HTTP server close error:', err.message)
      }
      resolve()
    })

    // Release idle keep-alive sockets; in-flight requests are allowed to finish.
    server.closeIdleConnections()
  })

const closeRedis = async () => {
  if (!client.isOpen) return

  try {
    await client.quit()
  } catch (err) {
    console.error('Redis close error:', err.message)
    client.destroy()
  }
}

const closeDatabase = async () => {
  try {
    await sequelize.close()
  } catch (err) {
    console.error('PostgreSQL close error:', err.message)
  }
}

const withTimeout = (promise, label) => {
  let timer

  return Promise.race([
    promise,
    new Promise((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label} timed out`)),
        SHUTDOWN_TIMEOUT_MS,
      )
    }),
  ]).finally(() => clearTimeout(timer))
}

const closeAllResources = async () => {
  const results = await Promise.allSettled([
    withTimeout(closeRedis(), 'Redis close'),
    withTimeout(closeDatabase(), 'PostgreSQL close'),
  ])

  for (const result of results) {
    if (result.status === 'rejected') {
      const reason = result.reason
      console.error(
        'Resource close error:',
        reason && reason.message ? reason.message : reason,
      )
    }
  }
}

const shutdown = async (signal) => {
  if (shutdownStarted) {
    console.log(`${signal} received; shutdown is already in progress`)
    return
  }

  shutdownStarted = true
  console.log(`${signal} received; shutting down gracefully`)

  const forceTimer = setTimeout(() => {
    console.error(
      `Graceful shutdown timed out after ${SHUTDOWN_TIMEOUT_MS}ms; closing remaining connections`,
    )
    if (server) {
      server.closeAllConnections()
    }
  }, SHUTDOWN_TIMEOUT_MS)
  forceTimer.unref()

  let exitCode = 0

  try {
    await closeHttpServer()
    await closeAllResources()
    console.log('Shutdown complete')
  } catch (err) {
    exitCode = 1
    console.error(
      'Shutdown failed:',
      err && err.message ? err.message : err,
    )
  } finally {
    clearTimeout(forceTimer)
  }

  process.exit(exitCode)
}

const failStartup = async (message, err) => {
  if (shutdownStarted) return

  shutdownStarted = true
  console.error(message)
  if (err && err.stack) {
    console.error(err.stack)
  }

  // Force-close Redis: quit() can wait indefinitely while the client is still
  // reconnecting during a failed startup.
  if (client.isOpen) {
    client.destroy()
  }

  try {
    await closeHttpServer()
    await closeAllResources()
  } finally {
    process.exit(1)
  }
}

const onSignal = (signal) => {
  shutdown(signal).catch((err) => {
    console.error(
      'Shutdown failed:',
      err && err.message ? err.message : err,
    )
    process.exit(1)
  })
}

process.once('SIGINT', () => onSignal('SIGINT'))
process.once('SIGTERM', () => onSignal('SIGTERM'))

const start = async () => {
  await connectRedis()
  await client.ping()
  console.log('Redis connected')

  await sequelize.authenticate()
  console.log('PostgreSQL connected')

  // Loaded after dependencies are connected so the Redis-backed rate-limit
  // store and session store initialize against a live client.
  const app = require('./app')

  server = http.createServer(app)

  server.once('error', (err) => {
    const detail = err && err.message ? err.message : String(err)
    void failStartup(`HTTP server failed on port ${env.PORT}: ${detail}`, err)
  })

  server.listen(env.PORT, () => {
    console.log(`Tafera API running on port ${env.PORT} (${env.NODE_ENV})`)
  })
}

start().catch((err) => {
  const detail = err && err.message ? err.message : String(err)
  void failStartup(`Tafera failed to start: ${detail}`, err)
})
