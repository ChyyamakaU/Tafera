'use strict'

module.exports = (sequelize, DataTypes) => {
  const SavedPost = sequelize.define(
    'SavedPost',
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
      tableName: 'saved_posts',
      underscored: true,
      timestamps: true,
      updatedAt: false,
    },
  )

  SavedPost.associate = (models) => {
    SavedPost.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })

    SavedPost.belongsTo(models.Post, {
      foreignKey: 'postId',
      as: 'post',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })
  }

  return SavedPost
}
