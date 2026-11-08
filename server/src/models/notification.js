'use strict'

module.exports = (sequelize, DataTypes) => {
  const Notification = sequelize.define(
    'Notification',
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
      actorId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      type: {
        type: DataTypes.ENUM(
          'new_follower',
          'post_like',
          'post_comment',
          'trip_join_request',
          'trip_join_approved',
          'trip_join_rejected',
        ),
        allowNull: false,
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      referenceType: {
        type: DataTypes.ENUM('user', 'post', 'comment', 'trip'),
        allowNull: true,
      },
      referenceId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      isRead: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      readAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: 'notifications',
      underscored: true,
      timestamps: true,
      validate: {
        referencePairConsistency() {
          const hasReferenceType =
            this.referenceType !== null && this.referenceType !== undefined
          const hasReferenceId =
            this.referenceId !== null && this.referenceId !== undefined

          if (hasReferenceType !== hasReferenceId) {
            throw new Error(
              'referenceType and referenceId must either both be set or both be null.',
            )
          }
        },
      },
    },
  )

  Notification.associate = (models) => {
    Notification.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'recipient',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })

    Notification.belongsTo(models.User, {
      foreignKey: 'actorId',
      as: 'actor',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })
  }

  return Notification
}
