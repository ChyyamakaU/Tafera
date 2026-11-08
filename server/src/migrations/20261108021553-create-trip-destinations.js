'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('trip_destinations', {
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
      destination_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'destinations',
          key: 'id',
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      stop_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      arrival_date: {
        type: Sequelize.DATEONLY,
        allowNull: true,
      },
      departure_date: {
        type: Sequelize.DATEONLY,
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

    await queryInterface.addConstraint('trip_destinations', {
      fields: ['trip_id', 'destination_id'],
      type: 'unique',
      name: 'trip_destinations_trip_id_destination_id_unique',
    })
    await queryInterface.addConstraint('trip_destinations', {
      fields: ['trip_id', 'stop_order'],
      type: 'unique',
      name: 'trip_destinations_trip_id_stop_order_unique',
    })

    await queryInterface.addIndex('trip_destinations', ['destination_id'], {
      name: 'trip_destinations_destination_id_idx',
    })

    await queryInterface.sequelize.query(
      'ALTER TABLE "trip_destinations" ADD CONSTRAINT "trip_destinations_stop_order_check" CHECK ("stop_order" > 0);',
    )
    await queryInterface.sequelize.query(
      'ALTER TABLE "trip_destinations" ADD CONSTRAINT "trip_destinations_dates_check" CHECK ("arrival_date" IS NULL OR "departure_date" IS NULL OR "departure_date" >= "arrival_date");',
    )
  },

  async down(queryInterface) {
    await queryInterface.dropTable('trip_destinations')
  },
};
