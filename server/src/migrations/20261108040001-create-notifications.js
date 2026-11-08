'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('notifications', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      actor_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      type: {
        type: Sequelize.ENUM(
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
        type: Sequelize.TEXT,
        allowNull: false,
      },
      reference_type: {
        type: Sequelize.ENUM('user', 'post', 'comment', 'trip'),
        allowNull: true,
      },
      reference_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      is_read: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      read_at: {
        type: Sequelize.DATE,
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

    await queryInterface.addIndex('notifications', ['user_id'], {
      name: 'notifications_user_id_idx',
    })
    await queryInterface.addIndex('notifications', ['actor_id'], {
      name: 'notifications_actor_id_idx',
    })
    await queryInterface.addIndex('notifications', ['is_read'], {
      name: 'notifications_is_read_idx',
    })
    await queryInterface.addIndex('notifications', ['created_at'], {
      name: 'notifications_created_at_idx',
    })
    await queryInterface.addIndex(
      'notifications',
      ['user_id', 'is_read', 'created_at'],
      {
        name: 'notifications_user_id_is_read_created_at_idx',
      },
    )

    await queryInterface.sequelize.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "notifications_reference_pair_check" CHECK (
        ("reference_type" IS NULL AND "reference_id" IS NULL)
        OR ("reference_type" IS NOT NULL AND "reference_id" IS NOT NULL)
      );`,
    )
  },

  async down(queryInterface) {
    await queryInterface.dropTable('notifications')

    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_notifications_type";',
    )
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_notifications_reference_type";',
    )
  },
};
