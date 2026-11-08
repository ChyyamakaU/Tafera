'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      full_name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      email: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      password_hash: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      profile_image: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      bio: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      role: {
        type: Sequelize.ENUM('user', 'admin'),
        allowNull: false,
        defaultValue: 'user',
      },
      status: {
        type: Sequelize.ENUM('active', 'suspended'),
        allowNull: false,
        defaultValue: 'active',
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

    await queryInterface.addIndex('users', ['role'], {
      name: 'users_role_idx',
    })
    await queryInterface.addIndex('users', ['status'], {
      name: 'users_status_idx',
    })
  },

  async down(queryInterface) {
    await queryInterface.dropTable('users')

    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_users_role";',
    )
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_users_status";',
    )
  },
};
