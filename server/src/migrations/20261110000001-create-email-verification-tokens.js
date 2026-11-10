'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('email_verification_tokens', {
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
      token_hash: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      consumed_at: {
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

    await queryInterface.addConstraint(
      'email_verification_tokens',
      {
        fields: ['token_hash'],
        type: 'unique',
        name: 'email_verification_tokens_token_hash_unique',
      },
    )

    await queryInterface.addIndex(
      'email_verification_tokens',
      ['user_id', 'created_at'],
      {
        name: 'email_verification_tokens_user_created_at_idx',
      },
    )
  },

  async down(queryInterface) {
    await queryInterface.dropTable('email_verification_tokens')
  },
};
