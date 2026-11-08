'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('follows', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
      },
      follower_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      following_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    })

    await queryInterface.addConstraint('follows', {
      fields: ['follower_id', 'following_id'],
      type: 'unique',
      name: 'follows_follower_id_following_id_unique',
    })

    await queryInterface.addIndex('follows', ['follower_id'], {
      name: 'follows_follower_id_idx',
    })
    await queryInterface.addIndex('follows', ['following_id'], {
      name: 'follows_following_id_idx',
    })

    await queryInterface.sequelize.query(
      'ALTER TABLE "follows" ADD CONSTRAINT "follows_no_self_follow_check" CHECK ("follower_id" <> "following_id");',
    )
  },

  async down(queryInterface) {
    await queryInterface.dropTable('follows')
  },
};
