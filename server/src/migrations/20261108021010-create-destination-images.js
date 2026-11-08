'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('destination_images', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
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
      image_url: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      public_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      alt_text: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      display_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      is_cover: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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

    await queryInterface.addIndex('destination_images', ['destination_id'], {
      name: 'destination_images_destination_id_idx',
    })
  },

  async down(queryInterface) {
    await queryInterface.dropTable('destination_images')
  },
};
