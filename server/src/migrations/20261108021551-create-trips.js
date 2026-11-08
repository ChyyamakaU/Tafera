'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('trips', {
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
      title: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      trip_type: {
        type: Sequelize.ENUM('personal', 'group'),
        allowNull: false,
        defaultValue: 'personal',
      },
      start_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      end_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      max_participants: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM('draft', 'published', 'cancelled', 'completed'),
        allowNull: false,
        defaultValue: 'draft',
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

    await queryInterface.addIndex('trips', ['user_id'], {
      name: 'trips_user_id_idx',
    })
    await queryInterface.addIndex('trips', ['trip_type'], {
      name: 'trips_trip_type_idx',
    })
    await queryInterface.addIndex('trips', ['status'], {
      name: 'trips_status_idx',
    })
    await queryInterface.addIndex('trips', ['start_date'], {
      name: 'trips_start_date_idx',
    })
    await queryInterface.addIndex('trips', ['end_date'], {
      name: 'trips_end_date_idx',
    })

    await queryInterface.sequelize.query(
      'ALTER TABLE "trips" ADD CONSTRAINT "trips_end_date_check" CHECK ("end_date" >= "start_date");',
    )
    await queryInterface.sequelize.query(
      'ALTER TABLE "trips" ADD CONSTRAINT "trips_max_participants_check" CHECK ("max_participants" IS NULL OR "max_participants" > 0);',
    )
  },

  async down(queryInterface) {
    await queryInterface.dropTable('trips')

    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_trips_trip_type";',
    )
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_trips_status";',
    )
  },
};
