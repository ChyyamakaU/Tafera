const router = require('express').Router()
const sequelize = require('../config/db')
const { client } = require('../config/redis')
const authRouter = require('./auth')
const usersRouter = require('./users')

const CHECK_TIMEOUT_MS = 2000

const checkWithTimeout = async (probe) => {
  let timer

  try {
    await Promise.race([
      Promise.resolve().then(probe),
      new Promise((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('Readiness check timed out')),
          CHECK_TIMEOUT_MS,
        )
      }),
    ])
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

router.use('/auth', authRouter)
router.use('/users', usersRouter)

// Liveness: the process is up. This must not depend on PostgreSQL or Redis.
router.get('/health', (req, res) => {
  res.set('Cache-Control', 'no-store').status(200).json({
    status: 'ok',
    service: 'tafera-api',
  })
})

// Readiness: both dependencies must be reachable before accepting traffic.
router.get('/ready', async (req, res) => {
  const [databaseReady, redisReady] = await Promise.all([
    checkWithTimeout(() => sequelize.authenticate()),
    checkWithTimeout(() => client.ping()),
  ])

  const ready = databaseReady && redisReady

  res
    .set('Cache-Control', 'no-store')
    .status(ready ? 200 : 503)
    .json({
      status: ready ? 'ready' : 'not_ready',
      checks: {
        database: databaseReady ? 'ok' : 'unavailable',
        redis: redisReady ? 'ok' : 'unavailable',
      },
    })
})

module.exports = router
