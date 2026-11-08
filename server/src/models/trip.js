'use strict'

module.exports = (sequelize, DataTypes) => {
  const Trip = sequelize.define(
    'Trip',
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
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      tripType: {
        type: DataTypes.ENUM('personal', 'group'),
        allowNull: false,
        defaultValue: 'personal',
      },
      startDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      endDate: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      maxParticipants: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: 1,
        },
      },
      status: {
        type: DataTypes.ENUM('draft', 'published', 'cancelled', 'completed'),
        allowNull: false,
        defaultValue: 'draft',
      },
    },
    {
      tableName: 'trips',
      underscored: true,
      timestamps: true,
      validate: {
        endDateNotBeforeStartDate() {
          if (this.startDate && this.endDate && this.endDate < this.startDate) {
            throw new Error('End date must be on or after the start date.')
          }
        },
      },
    },
  )

  Trip.associate = (models) => {
    Trip.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'creator',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })

    Trip.hasMany(models.TripDestination, {
      foreignKey: 'tripId',
      as: 'destinations',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })

    Trip.hasMany(models.TripParticipant, {
      foreignKey: 'tripId',
      as: 'participants',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })

    Trip.hasMany(models.TripItinerary, {
      foreignKey: 'tripId',
      as: 'itineraries',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })
  }

  return Trip
}
