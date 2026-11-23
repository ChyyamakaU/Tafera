'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('destination_images', 'user_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })
    await queryInterface.addColumn('destination_images', 'caption', {
      type: Sequelize.STRING(500),
      allowNull: true,
    })
    await queryInterface.addIndex('destination_images', ['user_id'], {
      name: 'destination_images_user_id_idx',
    })
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('destination_images', 'destination_images_user_id_idx')
    await queryInterface.removeColumn('destination_images', 'caption')
    await queryInterface.removeColumn('destination_images', 'user_id')
  },
}
