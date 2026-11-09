'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Preflight before any schema or data change. The migration is
      // transactional, so a duplicate failure leaves the database untouched.
      const duplicates = await queryInterface.sequelize.query(
        `SELECT lower(trim(email)) AS normalized_email, COUNT(*)::int AS count
         FROM users
         GROUP BY lower(trim(email))
         HAVING COUNT(*) > 1
         ORDER BY normalized_email`,
        {
          type: Sequelize.QueryTypes.SELECT,
          transaction,
        },
      )

      if (duplicates.length > 0) {
        const normalizedEmails = duplicates
          .map(({ normalized_email: normalizedEmail }) => normalizedEmail)
          .join(', ')

        throw new Error(
          'Cannot add case-insensitive email uniqueness: duplicate ' +
            `normalized email addresses found (${normalizedEmails}). ` +
            'Resolve these duplicates manually, then run the migration again. ' +
            'No user records were modified.',
        )
      }

      await queryInterface.addColumn(
        'users',
        'auth_version',
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 1,
        },
        { transaction },
      )

      await queryInterface.addColumn(
        'users',
        'email_verified_at',
        {
          type: Sequelize.DATE,
          allowNull: true,
          defaultValue: null,
        },
        { transaction },
      )

      // Normalisation is intentionally irreversible. Existing values are
      // trimmed and lowercased before the functional unique index is created.
      await queryInterface.sequelize.query(
        `UPDATE users
         SET email = lower(trim(email))
         WHERE email <> lower(trim(email))`,
        { transaction },
      )

      await queryInterface.sequelize.query(
        `CREATE UNIQUE INDEX users_email_lower_unique
         ON users (lower(email))`,
        { transaction },
      )
    })
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.sequelize.query(
        'DROP INDEX IF EXISTS users_email_lower_unique',
        { transaction },
      )

      await queryInterface.removeColumn('users', 'email_verified_at', {
        transaction,
      })

      await queryInterface.removeColumn('users', 'auth_version', {
        transaction,
      })

      // Original email capitalisation and whitespace are intentionally not
      // restored; normalisation is one-way.
    })
  },
};
