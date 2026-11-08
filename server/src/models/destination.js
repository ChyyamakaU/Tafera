'use strict'

module.exports = (sequelize, DataTypes) => {
  const Destination = sequelize.define(
    'Destination',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      slug: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      country: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      state: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      location: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      latitude: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: true,
      },
      longitude: {
        type: DataTypes.DECIMAL(10, 7),
        allowNull: true,
      },
      featured: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      status: {
        type: DataTypes.ENUM('draft', 'published'),
        allowNull: false,
        defaultValue: 'draft',
      },
      createdBy: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      tableName: 'destinations',
      underscored: true,
      timestamps: true,
    },
  )

  Destination.associate = (models) => {
    Destination.belongsTo(models.User, {
      foreignKey: 'createdBy',
      as: 'creator',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })

    Destination.hasMany(models.DestinationImage, {
      foreignKey: 'destinationId',
      as: 'images',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })
  }

  return Destination
}
