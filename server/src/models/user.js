'use strict'

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    'User',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      fullName: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      passwordHash: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      profileImage: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      bio: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      role: {
        type: DataTypes.ENUM('user', 'admin'),
        allowNull: false,
        defaultValue: 'user',
      },
      status: {
        type: DataTypes.ENUM('active', 'suspended'),
        allowNull: false,
        defaultValue: 'active',
      },
    },
    {
      tableName: 'users',
      underscored: true,
      timestamps: true,
    },
  )

  User.associate = (models) => {
    User.hasMany(models.Destination, {
      foreignKey: 'createdBy',
      as: 'destinations',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })

    User.hasMany(models.Trip, {
      foreignKey: 'userId',
      as: 'trips',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })

    User.hasMany(models.TripParticipant, {
      foreignKey: 'userId',
      as: 'tripParticipation',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })
  }

  return User
}
