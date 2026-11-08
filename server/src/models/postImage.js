'use strict'

module.exports = (sequelize, DataTypes) => {
  const PostImage = sequelize.define(
    'PostImage',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      postId: {
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
        type: DataTypes.TEXT,
        allowNull: true,
      },
      displayOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0,
        },
      },
    },
    {
      tableName: 'post_images',
      underscored: true,
      timestamps: true,
    },
  )

  PostImage.associate = (models) => {
    PostImage.belongsTo(models.Post, {
      foreignKey: 'postId',
      as: 'post',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })
  }

  return PostImage
}
