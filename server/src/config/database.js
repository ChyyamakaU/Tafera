const env = require('./env')

const dialect = 'postgres'

const define = {
  underscored: true,
  timestamps: true,
}

const pool = {
  max: 10,
  min: 0,
  acquire: 30000,
  idle: 10000,
}

const ssl = {
  require: true,
  rejectUnauthorized: false,
}

const testDatabaseName = () => `${env.DB.name}_test`

// Tests must always use their own database, even when DATABASE_URL is set.
const usesDatabaseUrl = () => Boolean(env.DB.url) && env.NODE_ENV !== 'test'

const runtimeConfig = () => {
  const options = {
    dialect,
    define,
    pool,
    logging: env.NODE_ENV === 'development' ? console.log : false,
    ...(env.NODE_ENV === 'production'
      ? { dialectOptions: { ssl } }
      : {}),
  }

  if (usesDatabaseUrl()) {
    return { url: env.DB.url, options }
  }

  return {
    database: env.NODE_ENV === 'test' ? testDatabaseName() : env.DB.name,
    username: env.DB.user,
    password: env.DB.password,
    host: env.DB.host,
    port: env.DB.port,
    options,
  }
}

const withEnvironmentUrl = (config) =>
  env.DB.url ? { ...config, use_env_variable: 'DATABASE_URL' } : config

const cliConfig = () => {
  const base = {
    dialect,
    define,
    pool,
    username: env.DB.user,
    password: env.DB.password,
    host: env.DB.host,
    port: env.DB.port,
  }

  return {
    development: withEnvironmentUrl({
      ...base,
      database: env.DB.name,
    }),
    test: {
      ...base,
      database: testDatabaseName(),
    },
    production: withEnvironmentUrl({
      ...base,
      database: env.DB.name,
      dialectOptions: { ssl },
    }),
  }
}

module.exports = { runtimeConfig, cliConfig, testDatabaseName }
