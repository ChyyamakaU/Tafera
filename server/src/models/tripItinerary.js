'use strict'

module.exports = (sequelize, DataTypes) => {
  const TripItinerary = sequelize.define(
    'TripItinerary',
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
      tripDestinationId: {
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
      activityDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      startTime: {
        type: DataTypes.TIME,
        allowNull: true,
      },
      endTime: {
        type: DataTypes.TIME,
        allowNull: true,
      },
      location: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    {
      tableName: 'trip_itineraries',
      underscored: true,
      timestamps: true,
      validate: {
        endTimeAfterStartTime() {
          if (
            this.startTime &&
            this.endTime &&
            this.endTime <= this.startTime
          ) {
            throw new Error('End time must be later than the start time.')
          }
        },
      },
    },
  )

  TripItinerary.associate = (models) => {
    TripItinerary.belongsTo(models.Trip, {
      foreignKey: 'tripId',
      as: 'trip',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })

    TripItinerary.belongsTo(models.TripDestination, {
      foreignKey: 'tripDestinationId',
      as: 'destinationStop',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })
  }

  return TripItinerary
}
