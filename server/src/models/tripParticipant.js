'use strict'

module.exports = (sequelize, DataTypes) => {
  const TripParticipant = sequelize.define(
    'TripParticipant',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      tripId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
      },
      joinedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: 'trip_participants',
      underscored: true,
      timestamps: true,
    },
  )

  TripParticipant.associate = (models) => {
    TripParticipant.belongsTo(models.Trip, {
      foreignKey: 'tripId',
      as: 'trip',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })

    TripParticipant.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'participant',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })
  }

  return TripParticipant
}
