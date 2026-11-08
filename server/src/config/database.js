require('dotenv').config({ quiet: true })

const base = {
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'tafera',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  dialect: 'postgres',
  define: {
    underscored: true,
    timestamps: true,
  },
}

module.exports = {
  development: { ...base },
  test: { ...base, database: `${base.database}_test` },
  production: {
    use_env_variable: 'DATABASE_URL',
    dialect: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
    define: {
      underscored: true,
      timestamps: true,
    },
  },
}
