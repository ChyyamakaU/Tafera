const { DataTypes } = require('sequelize')
const sequelize = require('../config/db')

const db = {
  sequelize,
  Sequelize: require('sequelize'),
  DataTypes,
}

module.exports = db
