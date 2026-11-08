'use strict'

module.exports = (sequelize, DataTypes) => {
  const Follow = sequelize.define(
    'Follow',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      followerId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      followingId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
    },
    {
      tableName: 'follows',
      underscored: true,
      timestamps: true,
      updatedAt: false,
      validate: {
        noSelfFollow() {
          if (
            this.followerId &&
            this.followingId &&
            this.followerId === this.followingId
          ) {
            throw new Error('Users cannot follow themselves.')
          }
        },
      },
    },
  )

  Follow.associate = (models) => {
    Follow.belongsTo(models.User, {
      foreignKey: 'followerId',
      as: 'follower',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })

    Follow.belongsTo(models.User, {
      foreignKey: 'followingId',
      as: 'followingUser',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })
  }

  return Follow
}
