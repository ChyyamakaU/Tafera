'use strict'

module.exports = (sequelize, DataTypes) => {
  const PostLike = sequelize.define(
    'PostLike',
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
      postId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
    },
    {
      tableName: 'post_likes',
      underscored: true,
      timestamps: true,
      updatedAt: false,
    },
  )

  PostLike.associate = (models) => {
    PostLike.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })

    PostLike.belongsTo(models.Post, {
      foreignKey: 'postId',
      as: 'post',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })
  }

  return PostLike
}
