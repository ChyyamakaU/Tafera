'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('reports', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      reporter_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      target_type: {
        type: Sequelize.ENUM('user', 'post', 'comment'),
        allowNull: false,
      },
      target_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      reason: {
        type: Sequelize.ENUM(
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
        type: Sequelize.TEXT,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM('pending', 'reviewed', 'resolved', 'dismissed'),
        allowNull: false,
        defaultValue: 'pending',
      },
      reviewed_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      reviewed_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      resolution_note: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    })

    await queryInterface.addIndex('reports', ['reporter_id'], {
      name: 'reports_reporter_id_idx',
    })
    await queryInterface.addIndex('reports', ['target_type', 'target_id'], {
      name: 'reports_target_type_target_id_idx',
    })
    await queryInterface.addIndex('reports', ['status'], {
      name: 'reports_status_idx',
    })
    await queryInterface.addIndex('reports', ['created_at'], {
      name: 'reports_created_at_idx',
    })
    await queryInterface.addIndex('reports', ['reviewed_by'], {
      name: 'reports_reviewed_by_idx',
    })
  },

  async down(queryInterface) {
    await queryInterface.dropTable('reports')

    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_reports_target_type";',
    )
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_reports_reason";',
    )
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_reports_status";',
    )
  },
};
