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

    User.hasMany(models.Post, {
      foreignKey: 'userId',
      as: 'posts',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })

    User.hasMany(models.Comment, {
      foreignKey: 'userId',
      as: 'comments',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })

    User.hasMany(models.Follow, {
      foreignKey: 'followerId',
      as: 'following',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })

    User.hasMany(models.Follow, {
      foreignKey: 'followingId',
      as: 'followers',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })

    User.hasMany(models.PostLike, {
      foreignKey: 'userId',
      as: 'postLikes',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })

    User.hasMany(models.SavedPost, {
      foreignKey: 'userId',
      as: 'savedPosts',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })

    User.hasMany(models.SavedDestination, {
      foreignKey: 'userId',
      as: 'savedDestinations',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })

    User.hasMany(models.Notification, {
      foreignKey: 'userId',
      as: 'notifications',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    })

    User.hasMany(models.Notification, {
      foreignKey: 'actorId',
      as: 'triggeredNotifications',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })

    User.hasMany(models.Report, {
      foreignKey: 'reporterId',
      as: 'submittedReports',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })

    User.hasMany(models.Report, {
      foreignKey: 'reviewedBy',
      as: 'reviewedReports',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })
  }

  return User
}
