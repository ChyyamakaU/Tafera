'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('posts', {
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
      destination_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'destinations',
          key: 'id',
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: false,
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

    await queryInterface.addIndex('posts', ['user_id'], {
      name: 'posts_user_id_idx',
    })
    await queryInterface.addIndex('posts', ['destination_id'], {
      name: 'posts_destination_id_idx',
    })
    await queryInterface.addIndex('posts', ['created_at'], {
      name: 'posts_created_at_idx',
    })
  },

  async down(queryInterface) {
    await queryInterface.dropTable('posts')
  },
};
