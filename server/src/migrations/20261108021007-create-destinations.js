'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('destinations', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      slug: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true,
      },
      country: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      state: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      location: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      latitude: {
        type: Sequelize.DECIMAL(10, 7),
        allowNull: true,
      },
      longitude: {
        type: Sequelize.DECIMAL(10, 7),
        allowNull: true,
      },
      featured: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      status: {
        type: Sequelize.ENUM('draft', 'published'),
        allowNull: false,
        defaultValue: 'draft',
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
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

    await queryInterface.addIndex('destinations', ['country'], {
      name: 'destinations_country_idx',
    })
    await queryInterface.addIndex('destinations', ['status'], {
      name: 'destinations_status_idx',
    })
    await queryInterface.addIndex('destinations', ['featured'], {
      name: 'destinations_featured_idx',
    })
    await queryInterface.addIndex('destinations', ['created_by'], {
      name: 'destinations_created_by_idx',
    })
  },

  async down(queryInterface) {
    await queryInterface.dropTable('destinations')

    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_destinations_status";',
    )
  },
};
