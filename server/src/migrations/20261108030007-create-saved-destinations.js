'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('saved_destinations', {
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
        allowNull: false,
        references: {
          model: 'destinations',
          key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    })

    await queryInterface.addConstraint('saved_destinations', {
      fields: ['user_id', 'destination_id'],
      type: 'unique',
      name: 'saved_destinations_user_id_destination_id_unique',
    })

    await queryInterface.addIndex('saved_destinations', ['destination_id'], {
      name: 'saved_destinations_destination_id_idx',
    })
  },

  async down(queryInterface) {
    await queryInterface.dropTable('saved_destinations')
  },
};
