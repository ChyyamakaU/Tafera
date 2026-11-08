const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const morgan = require('morgan')
const cookieParser = require('cookie-parser')
const env = require('./config/env')
const sessionMiddleware = require('./config/session')
const createApiLimiter = require('./config/rateLimiter')
const routes = require('./routes')

const app = express()

app.use(helmet())
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  }),
)
app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(sessionMiddleware)

app.use('/api', createApiLimiter(), routes)

module.exports = app
