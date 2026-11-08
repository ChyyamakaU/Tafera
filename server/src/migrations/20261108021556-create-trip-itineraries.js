'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('trip_itineraries', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      trip_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'trips',
          key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      trip_destination_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'trip_destinations',
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
      activity_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      start_time: {
        type: Sequelize.TIME,
        allowNull: true,
      },
      end_time: {
        type: Sequelize.TIME,
        allowNull: true,
      },
      location: {
        type: Sequelize.STRING,
        allowNull: true,
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

    await queryInterface.addIndex('trip_itineraries', ['trip_id'], {
      name: 'trip_itineraries_trip_id_idx',
    })
    await queryInterface.addIndex('trip_itineraries', ['trip_destination_id'], {
      name: 'trip_itineraries_trip_destination_id_idx',
    })
    await queryInterface.addIndex('trip_itineraries', ['activity_date'], {
      name: 'trip_itineraries_activity_date_idx',
    })

    await queryInterface.sequelize.query(
      'ALTER TABLE "trip_itineraries" ADD CONSTRAINT "trip_itineraries_time_order_check" CHECK ("start_time" IS NULL OR "end_time" IS NULL OR "end_time" > "start_time");',
    )
  },

  async down(queryInterface) {
    await queryInterface.dropTable('trip_itineraries')
  },
};
