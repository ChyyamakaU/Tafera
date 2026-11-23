'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('admin_audit_logs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      admin_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      action: {
        type: Sequelize.STRING(80),
        allowNull: false,
      },
      target_type: {
        type: Sequelize.STRING(40),
        allowNull: false,
      },
      target_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      reason: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    })

    await queryInterface.addIndex('admin_audit_logs', ['created_at'], {
      name: 'admin_audit_logs_created_at_idx',
    })
    await queryInterface.addIndex('admin_audit_logs', ['admin_id'], {
      name: 'admin_audit_logs_admin_id_idx',
    })
    await queryInterface.addIndex('admin_audit_logs', ['target_type', 'target_id'], {
      name: 'admin_audit_logs_target_idx',
    })
  },

  async down(queryInterface) {
    await queryInterface.dropTable('admin_audit_logs')
  },
}
