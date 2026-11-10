/* eslint-disable no-undef */
const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const morgan = require('morgan')
const cookieParser = require('cookie-parser')
const env = require('./config/env')
const sessionMiddleware = require('./config/session')
const sessionPolicy = require('./middlewares/sessionPolicy')
const createApiLimiter = require('./config/rateLimiter')
const routes = require('./routes')
const notFound = require('./middlewares/notFound')
const errorHandler = require('./middlewares/errorHandler')

const BODY_LIMIT = '1mb'

const app = express()

app.disable('x-powered-by')
app.set('trust proxy', env.TRUST_PROXY)

app.use(helmet())
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  }),
)

// Rate limiting runs before body parsing and session handling so abusive
// requests are rejected before expensive work is performed.
app.use(createApiLimiter())
app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'))

app.use(express.json({ limit: BODY_LIMIT }))
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }))
app.use(cookieParser())
app.use(sessionMiddleware)
app.use(sessionPolicy)

app.use('/api', routes)

app.use(notFound)
app.use(errorHandler)

module.exports = app
