'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('trip_participants', {
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
      status: {
        type: Sequelize.ENUM('pending', 'approved', 'rejected', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
      },
      joined_at: {
        type: Sequelize.DATE,
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

    await queryInterface.addConstraint('trip_participants', {
      fields: ['trip_id', 'user_id'],
      type: 'unique',
      name: 'trip_participants_trip_id_user_id_unique',
    })

    await queryInterface.addIndex('trip_participants', ['trip_id'], {
      name: 'trip_participants_trip_id_idx',
    })
    await queryInterface.addIndex('trip_participants', ['user_id'], {
      name: 'trip_participants_user_id_idx',
    })
    await queryInterface.addIndex('trip_participants', ['status'], {
      name: 'trip_participants_status_idx',
    })
  },

  async down(queryInterface) {
    await queryInterface.dropTable('trip_participants')

    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_trip_participants_status";',
    )
  },
};
