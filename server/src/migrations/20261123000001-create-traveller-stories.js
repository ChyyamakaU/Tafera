'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('traveller_stories', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      title: {
        type: Sequelize.STRING(150),
        allowNull: false,
      },
      excerpt: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      badge_label: {
        type: Sequelize.STRING(60),
        allowNull: false,
        defaultValue: 'Traveller spotlight',
      },
      author_name: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      author_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      destination_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'destinations',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      post_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'posts',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      cover_image_url: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      cover_image_public_id: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      cover_image_alt: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      is_featured: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      display_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
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

    await queryInterface.addIndex(
      'traveller_stories',
      ['is_featured', 'display_order', 'created_at'],
      {
        name: 'traveller_stories_featured_order_idx',
      },
    )

    await queryInterface.sequelize.query(
      'ALTER TABLE "traveller_stories" ADD CONSTRAINT "traveller_stories_display_order_non_negative" CHECK ("display_order" >= 0);',
    )
  },

  async down(queryInterface) {
    await queryInterface.dropTable('traveller_stories')
  },
}
