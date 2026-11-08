const fs = require('fs')
const path = require('path')
const { Sequelize, DataTypes } = require('sequelize')
const sequelize = require('../config/db')

const db = {
  sequelize,
  Sequelize,
  DataTypes,
}

fs.readdirSync(__dirname)
  .filter((file) => file !== 'index.js' && file.endsWith('.js'))
  .forEach((file) => {
    const model = require(path.join(__dirname, file))(sequelize, DataTypes)
    db[model.name] = model
  })

Object.keys(db).forEach((modelName) => {
  if (db[modelName].associate) {
    db[modelName].associate(db)
  }
})

module.exports = db
