'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('scrapbook_journals', {
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
      trip_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'trips',
          key: 'id',
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      title: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      is_public: {
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
    });

    await queryInterface.addIndex('scrapbook_journals', ['user_id'], {
      name: 'scrapbook_journals_user_id_idx',
    });
    await queryInterface.addIndex('scrapbook_journals', ['trip_id'], {
      name: 'scrapbook_journals_trip_id_idx',
    });
    await queryInterface.addIndex('scrapbook_journals', ['is_public'], {
      name: 'scrapbook_journals_is_public_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('scrapbook_journals');
  },
};
