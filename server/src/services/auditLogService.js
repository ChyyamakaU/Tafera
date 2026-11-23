'use strict'

const { createPagination } = require('../utils/pagination')

const toPlain = (value) => {
  if (!value || typeof value !== 'object') return null
  return typeof value.get === 'function' ? value.get({ plain: true }) : value
}

const toSafeAuditLog = (entry) => {
  const source = toPlain(entry)
  if (!source) return null

  return {
    id: source.id,
    adminId: source.adminId ?? null,
    admin: source.admin
      ? {
          id: source.admin.id,
          fullName: source.admin.fullName,
          email: source.admin.email,
          username: source.admin.username ?? null,
        }
      : null,
    action: source.action,
    targetType: source.targetType,
    targetId: source.targetId ?? null,
    reason: source.reason ?? null,
    metadata: source.metadata ?? null,
    timestamp: source.createdAt ?? null,
    createdAt: source.createdAt ?? null,
  }
}

const createAuditLogService = ({ AdminAuditLog, User } = {}) => {
  const getModels = () => {
    const models = !AdminAuditLog || !User ? require('../models') : {}
    return {
      auditLogModel: AdminAuditLog || models.AdminAuditLog,
      userModel: User || models.User,
    }
  }

  const recordAction = async ({
    adminId,
    action,
    targetType,
    targetId = null,
    reason = null,
    metadata = null,
    transaction,
  }) => {
    const { auditLogModel } = getModels()
    const created = await auditLogModel.create(
      {
        adminId: adminId || null,
        action,
        targetType,
        targetId: targetId || null,
        reason: reason ? String(reason).trim() : null,
        metadata: metadata || null,
      },
      transaction ? { transaction } : undefined,
    )
    return toSafeAuditLog(created)
  }

  const listRecent = async ({ page = 1, limit = 20, action, targetType } = {}) => {
    const { auditLogModel, userModel } = getModels()
    const where = {}
    if (action) where.action = action
    if (targetType) where.targetType = targetType

    const { count, rows } = await auditLogModel.findAndCountAll({
      where,
      include: [
        {
          model: userModel,
          as: 'admin',
          attributes: ['id', 'fullName', 'email', 'username'],
          required: false,
        },
      ],
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit,
      offset: (page - 1) * limit,
      distinct: true,
    })

    return {
      logs: rows.map(toSafeAuditLog),
      pagination: createPagination({ page, limit, total: count }),
    }
  }

  return {
    recordAction,
    listRecent,
  }
}

module.exports = {
  createAuditLogService,
  toSafeAuditLog,
}
