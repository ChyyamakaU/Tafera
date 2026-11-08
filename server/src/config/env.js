require('dotenv').config({ quiet: true })

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT) || 5001,
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:5173',

  DB: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    name: process.env.DB_NAME || 'tafera',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    url: process.env.DATABASE_URL || '',
  },

  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',

  JWT: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'change-me-access',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'change-me-refresh',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  SESSION_SECRET: process.env.SESSION_SECRET || 'change-me-session',

  CLOUDINARY: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
    apiKey: process.env.CLOUDINARY_API_KEY || '',
    apiSecret: process.env.CLOUDINARY_API_SECRET || '',
  },
}
