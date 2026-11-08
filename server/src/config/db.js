const { Sequelize } = require('sequelize')
const { runtimeConfig } = require('./database')

const config = runtimeConfig()

const sequelize = config.url
  ? new Sequelize(config.url, config.options)
  : new Sequelize(config.database, config.username, config.password, {
      ...config.options,
      host: config.host,
      port: config.port,
    })

module.exports = sequelize
