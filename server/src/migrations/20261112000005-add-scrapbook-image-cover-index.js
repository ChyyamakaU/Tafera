'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;

    // Resolve any duplicate covers before creating the partial unique index.
    // PostgreSQL does not allow CREATE UNIQUE INDEX when duplicate rows match
    // the WHERE clause. We keep the preferred existing cover (lowest
    // display_order, then lowest id) and unset is_cover on any duplicates.
    await sequelize.transaction(async (transaction) => {
      await sequelize.query(
        `
        WITH ranked AS (
          SELECT journal_id, id,
                 ROW_NUMBER() OVER (
                   PARTITION BY journal_id
                   ORDER BY display_order ASC, id ASC
                 ) AS rn
          FROM scrapbook_images
          WHERE is_cover = true
        )
        UPDATE scrapbook_images si
        SET is_cover = false
        FROM ranked r
        WHERE si.id = r.id
          AND r.rn > 1
        `,
        { transaction },
      );

      // Create the partial unique index: at most one cover image per
      // journal where is_cover = true.
      await sequelize.query(
        `CREATE UNIQUE INDEX "scrapbook_images_one_cover_idx"
         ON "scrapbook_images" ("journal_id")
         WHERE "is_cover" = true`,
        { transaction },
      );
    });
  },

  async down(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;

    await sequelize.transaction(async (transaction) => {
      await sequelize.query(
        `DROP INDEX IF EXISTS "scrapbook_images_one_cover_idx"`,
        { transaction },
      );
    });
  },
};
