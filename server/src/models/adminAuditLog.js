'use strict'

module.exports = (sequelize, DataTypes) => {
  const AdminAuditLog = sequelize.define(
    'AdminAuditLog',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      adminId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      action: {
        type: DataTypes.STRING(80),
        allowNull: false,
      },
      targetType: {
        type: DataTypes.STRING(40),
        allowNull: false,
      },
      targetId: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
    },
    {
      tableName: 'admin_audit_logs',
      underscored: true,
      timestamps: true,
      updatedAt: false,
    },
  )

  AdminAuditLog.associate = (models) => {
    AdminAuditLog.belongsTo(models.User, {
      foreignKey: 'adminId',
      as: 'admin',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })
  }

  return AdminAuditLog
}
