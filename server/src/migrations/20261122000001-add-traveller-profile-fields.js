'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'username', {
      type: Sequelize.STRING(30),
      allowNull: true,
    })
    await queryInterface.addColumn('users', 'city', { type: Sequelize.STRING(100), allowNull: true })
    await queryInterface.addColumn('users', 'state', { type: Sequelize.STRING(100), allowNull: true })
    await queryInterface.addColumn('users', 'website_url', { type: Sequelize.STRING(500), allowNull: true })
    await queryInterface.addColumn('users', 'instagram_url', { type: Sequelize.STRING(500), allowNull: true })
    await queryInterface.addColumn('users', 'tiktok_url', { type: Sequelize.STRING(500), allowNull: true })
    await queryInterface.addColumn('users', 'youtube_url', { type: Sequelize.STRING(500), allowNull: true })
    await queryInterface.addColumn('users', 'profile_image_public_id', { type: Sequelize.STRING, allowNull: true })
    await queryInterface.addIndex('users', ['username'], {
      name: 'users_username_unique_idx',
      unique: true,
      where: { username: { [Sequelize.Op.ne]: null } },
    })
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('users', 'users_username_unique_idx')
    for (const column of ['profile_image_public_id', 'youtube_url', 'tiktok_url', 'instagram_url', 'website_url', 'state', 'city', 'username']) {
      await queryInterface.removeColumn('users', column)
    }
  },
}
