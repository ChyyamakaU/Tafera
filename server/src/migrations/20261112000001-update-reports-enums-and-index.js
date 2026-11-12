'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;

    // PostgreSQL 12 and later allow ALTER TYPE ... ADD VALUE inside a
    // transaction block. All three up operations execute in one
    // Sequelize-managed transaction so they succeed or fail together:
    // renaming 'reviewed' to 'under_review', adding 'trip' to the target
    // type, and creating the partial unique index. If any operation fails
    // (for example, the index cannot be created because a duplicate active
    // report already exists), the entire transaction rolls back and no
    // schema or data change is partially applied.
    await sequelize.transaction(async (transaction) => {
      // Preserve existing report data: rename the 'reviewed' status to
      // 'under_review' so current records keep their meaning under the new
      // status vocabulary. This is a label rename, so every report already
      // stored as 'reviewed' becomes 'under_review' without being rewritten.
      await sequelize.query(
        `ALTER TYPE "enum_reports_status" RENAME VALUE 'reviewed' TO 'under_review'`,
        { transaction },
      );

      // Allow trips to be reported in addition to users, posts and comments.
      await sequelize.query(
        `ALTER TYPE "enum_reports_target_type" ADD VALUE 'trip'`,
        { transaction },
      );

      // Prevent the same reporter from having multiple active reports against
      // the same target. Active means the report is pending or under review.
      await sequelize.query(
        `CREATE UNIQUE INDEX "reports_reporter_target_active_idx"
         ON "reports" ("reporter_id", "target_type", "target_id")
         WHERE "reporter_id" IS NOT NULL
           AND "status" IN ('pending', 'under_review')`,
        { transaction },
      );
    });
  },

  async down(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize;

    // All down operations run inside a single transaction so that a failure
    // (for example, a trip report blocking the target_type cast) rolls back
    // every change: the dropped index, the status enum rename, and the
    // target_type recreation. No report data is lost.
    await sequelize.transaction(async (transaction) => {
      // Remove the partial unique index added by up.
      await sequelize.query(
        `DROP INDEX IF EXISTS "reports_reporter_target_active_idx"`,
        { transaction },
      );

      // Restore the previous status vocabulary: 'under_review' becomes
      // 'reviewed' again. Existing 'under_review' records become 'reviewed'.
      await sequelize.query(
        `ALTER TYPE "enum_reports_status" RENAME VALUE 'under_review' TO 'reviewed'`,
        { transaction },
      );

      // Restore the previous target_type vocabulary ('user', 'post',
      // 'comment'). PostgreSQL cannot remove a single enum value directly, so
      // the type is recreated. The USING cast fails if any report still
      // targets a trip, which protects report data from being silently
      // corrupted; the surrounding transaction rolls back all prior steps in
      // that case.
      await sequelize.query(
        `ALTER TYPE "enum_reports_target_type" RENAME TO "enum_reports_target_type_old"`,
        { transaction },
      );
      await sequelize.query(
        `CREATE TYPE "enum_reports_target_type" AS ENUM ('user', 'post', 'comment')`,
        { transaction },
      );
      await sequelize.query(
        `ALTER TABLE "reports" ALTER COLUMN "target_type" TYPE "enum_reports_target_type"
         USING "target_type"::text::"enum_reports_target_type"`,
        { transaction },
      );
      await sequelize.query(
        `DROP TYPE "enum_reports_target_type_old"`,
        { transaction },
      );
    });
  },
};
