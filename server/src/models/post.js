'use strict'

module.exports = (sequelize, DataTypes) => {
  const Post = sequelize.define(
    'Post',
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
        allowNull: true,
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
    },
    {
      tableName: 'posts',
      underscored: true,
      timestamps: true,
    },
  )

  Post.associate = (models) => {
    Post.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'author',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })

    Post.belongsTo(models.Destination, {
      foreignKey: 'destinationId',
      as: 'destination',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })

    Post.hasMany(models.PostImage, {
      foreignKey: 'postId',
      as: 'images',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })

    Post.hasMany(models.Comment, {
      foreignKey: 'postId',
      as: 'comments',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })

    Post.hasMany(models.PostLike, {
      foreignKey: 'postId',
      as: 'likes',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })

    Post.hasMany(models.SavedPost, {
      foreignKey: 'postId',
      as: 'savedBy',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })
  }

  return Post
}
