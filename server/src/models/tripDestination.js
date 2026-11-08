'use strict'

module.exports = (sequelize, DataTypes) => {
  const TripDestination = sequelize.define(
    'TripDestination',
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
      destinationId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      stopOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        validate: {
          min: 1,
        },
      },
      arrivalDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      departureDate: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
    },
    {
      tableName: 'trip_destinations',
      underscored: true,
      timestamps: true,
      validate: {
        departureNotBeforeArrival() {
          if (
            this.arrivalDate &&
            this.departureDate &&
            this.departureDate < this.arrivalDate
          ) {
            throw new Error(
              'Departure date must be on or after the arrival date.',
            )
          }
        },
      },
    },
  )

  TripDestination.associate = (models) => {
    TripDestination.belongsTo(models.Trip, {
      foreignKey: 'tripId',
      as: 'trip',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })

    TripDestination.belongsTo(models.Destination, {
      foreignKey: 'destinationId',
      as: 'destination',
      onDelete: 'RESTRICT',
      onUpdate: 'CASCADE',
    })

    TripDestination.hasMany(models.TripItinerary, {
      foreignKey: 'tripDestinationId',
      as: 'itineraries',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })
  }

  return TripDestination
}
