'use strict'

module.exports = (sequelize, DataTypes) => {
  const DestinationImage = sequelize.define(
    'DestinationImage',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      destinationId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      imageUrl: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      publicId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      altText: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      displayOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      isCover: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
    },
    {
      tableName: 'destination_images',
      underscored: true,
      timestamps: true,
    },
  )

  DestinationImage.associate = (models) => {
    DestinationImage.belongsTo(models.Destination, {
      foreignKey: 'destinationId',
      as: 'destination',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })
  }

  return DestinationImage
}
