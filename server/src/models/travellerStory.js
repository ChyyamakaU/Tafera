'use strict'

module.exports = (sequelize, DataTypes) => {
  const TravellerStory = sequelize.define(
    'TravellerStory',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      title: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },
      excerpt: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      badgeLabel: {
        type: DataTypes.STRING(60),
        allowNull: false,
        defaultValue: 'Traveller spotlight',
      },
      authorName: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      authorId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      destinationId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      postId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      coverImageUrl: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      coverImagePublicId: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      coverImageAlt: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      isFeatured: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      displayOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0,
        },
      },
      createdBy: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      tableName: 'traveller_stories',
      underscored: true,
      timestamps: true,
    },
  )

  TravellerStory.associate = (models) => {
    TravellerStory.belongsTo(models.User, {
      foreignKey: 'authorId',
      as: 'author',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })

    TravellerStory.belongsTo(models.User, {
      foreignKey: 'createdBy',
      as: 'curator',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })

    TravellerStory.belongsTo(models.Destination, {
      foreignKey: 'destinationId',
      as: 'destination',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })

    TravellerStory.belongsTo(models.Post, {
      foreignKey: 'postId',
      as: 'post',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })
  }

  return TravellerStory
}
