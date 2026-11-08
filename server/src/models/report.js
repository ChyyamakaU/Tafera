'use strict'

module.exports = (sequelize, DataTypes) => {
  const Report = sequelize.define(
    'Report',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      reporterId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      targetType: {
        type: DataTypes.ENUM('user', 'post', 'comment'),
        allowNull: false,
      },
      targetId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      reason: {
        type: DataTypes.ENUM(
          'spam',
          'harassment',
          'inappropriate_content',
          'impersonation',
          'misinformation',
          'other',
        ),
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM('pending', 'reviewed', 'resolved', 'dismissed'),
        allowNull: false,
        defaultValue: 'pending',
      },
      reviewedBy: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      reviewedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      resolutionNote: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: 'reports',
      underscored: true,
      timestamps: true,
    },
  )

  Report.associate = (models) => {
    Report.belongsTo(models.User, {
      foreignKey: 'reporterId',
      as: 'reporter',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })

    Report.belongsTo(models.User, {
      foreignKey: 'reviewedBy',
      as: 'reviewer',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })
  }

  return Report
}
