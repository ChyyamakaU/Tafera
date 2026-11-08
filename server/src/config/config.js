const env = require('./env')

const common = {
  username: env.DB.user,
  password: env.DB.password,
  database: env.DB.name,
  host: env.DB.host,
  port: env.DB.port,
  dialect: 'postgres',
  define: {
    underscored: true,
    timestamps: true,
  },
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
}

const production = {
  ...common,
  use_env_variable: 'DATABASE_URL',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
}

module.exports = {
  development: { ...common },
  test: { ...common, database: `${env.DB.name}_test` },
  production,
}
