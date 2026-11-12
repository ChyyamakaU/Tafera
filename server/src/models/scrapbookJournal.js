'use strict'

module.exports = (sequelize, DataTypes) => {
  const ScrapbookJournal = sequelize.define(
    'ScrapbookJournal',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      tripId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      isPublic: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      tableName: 'scrapbook_journals',
      underscored: true,
      timestamps: true,
    },
  )

  ScrapbookJournal.associate = (models) => {
    ScrapbookJournal.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })

    ScrapbookJournal.belongsTo(models.Trip, {
      foreignKey: 'tripId',
      as: 'trip',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })

    ScrapbookJournal.hasMany(models.ScrapbookImage, {
      foreignKey: 'journalId',
      as: 'images',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })
  }

  return ScrapbookJournal
}
