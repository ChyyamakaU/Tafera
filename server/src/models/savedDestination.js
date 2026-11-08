'use strict'

module.exports = (sequelize, DataTypes) => {
  const SavedDestination = sequelize.define(
    'SavedDestination',
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
      destinationId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
    },
    {
      tableName: 'saved_destinations',
      underscored: true,
      timestamps: true,
      updatedAt: false,
    },
  )

  SavedDestination.associate = (models) => {
    SavedDestination.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })

    SavedDestination.belongsTo(models.Destination, {
      foreignKey: 'destinationId',
      as: 'destination',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })
  }

  return SavedDestination
}
