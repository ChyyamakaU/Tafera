'use strict'

process.env.NODE_ENV = 'development'
process.env.SESSION_SECRET =
  'test-only-session-secret-0123456789abcdef'

const { test, before, after, beforeEach } = require('node:test')
const assert = require('node:assert/strict')
const { Sequelize, DataTypes, Op } = require('sequelize')
const { runtimeConfig } = require('../src/config/database')
const UserModel = require('../src/models/user')
const PostModel = require('../src/models/post')
const ReportModel = require('../src/models/report')
const { createReportService } = require('../src/services/reportService')
const { ReportStateConflictError } = require('../src/utils/reportErrors')

const config = runtimeConfig()
const connection = {
  ...config.options,
  host: config.host,
  port: config.port,
  logging: false,
}

let base = null
let scoped = null
let User = null
let Post = null
let Report = null
let schema = null
let databaseAvailable = false

before(async () => {
  base = new Sequelize(config.database, config.username, config.password, connection)
  try {
    await base.authenticate()
    schema = 'tafera_report_concurrency_' + process.pid + '_' + Date.now()
    await base.query('CREATE SCHEMA "' + schema + '"')

    await base.query(
      'CREATE TYPE "' + schema + '".enum_users_role AS ENUM (\'user\', \'admin\')'
    )
    await base.query(
      'CREATE TYPE "' + schema + '".enum_users_status AS ENUM (\'active\', \'suspended\')'
    )
    await base.query(
      'CREATE TYPE "' + schema + '".enum_reports_reason AS ENUM (\'spam\', \'harassment\', \'inappropriate_content\', \'impersonation\', \'misinformation\', \'other\')'
    )
    await base.query(
      'CREATE TYPE "' + schema + '".enum_reports_target_type AS ENUM (\'user\', \'post\', \'comment\', \'trip\')'
    )
    await base.query(
      'CREATE TYPE "' + schema + '".enum_reports_status AS ENUM (\'pending\', \'under_review\', \'resolved\', \'dismissed\')'
    )

    await base.query(
      'CREATE TABLE "' + schema + '".users (' +
      'id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ' +
      'full_name varchar(255) NOT NULL, ' +
      'email varchar(255) NOT NULL, ' +
      'password_hash varchar(255) NOT NULL, ' +
      'profile_image varchar(255), ' +
      'bio text, ' +
      'role "' + schema + '".enum_users_role NOT NULL DEFAULT \'user\', ' +
      'status "' + schema + '".enum_users_status NOT NULL DEFAULT \'active\', ' +
      'auth_version integer NOT NULL DEFAULT 1, ' +
      'email_verified_at timestamptz, ' +
      'created_at timestamptz NOT NULL DEFAULT now(), ' +
      'updated_at timestamptz NOT NULL DEFAULT now()' +
      ')'
    )

    await base.query(
      'CREATE TABLE "' + schema + '".posts (' +
      'id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ' +
      'user_id uuid NOT NULL REFERENCES "' + schema + '".users(id) ON DELETE CASCADE ON UPDATE CASCADE, ' +
      'destination_id uuid, ' +
      'content text NOT NULL, ' +
      'created_at timestamptz NOT NULL DEFAULT now(), ' +
      'updated_at timestamptz NOT NULL DEFAULT now()' +
      ')'
    )

    await base.query(
      'CREATE TABLE "' + schema + '".reports (' +
      'id uuid PRIMARY KEY DEFAULT gen_random_uuid(), ' +
      'reporter_id uuid NOT NULL REFERENCES "' + schema + '".users(id) ON DELETE SET NULL ON UPDATE CASCADE, ' +
      'target_type "' + schema + '".enum_reports_target_type NOT NULL, ' +
      'target_id uuid NOT NULL, ' +
      'reason "' + schema + '".enum_reports_reason NOT NULL, ' +
      'description text, ' +
      'status "' + schema + '".enum_reports_status NOT NULL DEFAULT \'pending\', ' +
      'reviewed_by uuid REFERENCES "' + schema + '".users(id) ON DELETE SET NULL ON UPDATE CASCADE, ' +
      'reviewed_at timestamptz, ' +
      'resolution_note text, ' +
      'created_at timestamptz NOT NULL DEFAULT now(), ' +
      'updated_at timestamptz NOT NULL DEFAULT now()' +
      ')'
    )

    await base.query(
      'CREATE UNIQUE INDEX "reports_reporter_target_active_idx" ' +
      'ON "' + schema + '".reports ("reporter_id", "target_type", "target_id") ' +
      'WHERE "reporter_id" IS NOT NULL AND "status" IN (\'pending\', \'under_review\')'
    )

    scoped = new Sequelize(config.database, config.username, config.password, {
      ...connection,
      searchPath: schema,
      dialectOptions: { ...(config.options.dialectOptions || {}), prependSearchPath: true },
    })
    await scoped.authenticate()

    User = UserModel(scoped, DataTypes)
    Post = PostModel(scoped, DataTypes)
    Report = ReportModel(scoped, DataTypes)

    User.hasMany(Report, {
      foreignKey: 'reporterId',
      as: 'submittedReports',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })
    Report.belongsTo(User, {
      foreignKey: 'reporterId',
      as: 'reporter',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    })

    databaseAvailable = true
  } catch {
    databaseAvailable = false
  }
})

after(async () => {
  if (base && schema) {
    await base.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE').catch(() => {})
  }
  if (scoped) await scoped.close().catch(() => {})
  if (base) await base.close().catch(() => {})
})

beforeEach(async () => {
  if (databaseAvailable) {
    await base.query(
      'TRUNCATE TABLE "' + schema + '".reports, "' + schema + '".posts, "' + schema + '".users CASCADE'
    )
  }
})

const skip = (t) => {
  if (!databaseAvailable) {
    t.skip('PostgreSQL is unavailable; concurrency test skipped')
    return true
  }
  return false
}

const createTestUser = async (overrides = {}) => {
  return await User.create({
    fullName: 'Test User',
    email: 'user-' + Date.now() + '-' + Math.random() + '@example.com',
    passwordHash: 'hash',
    role: 'user',
    status: 'active',
    authVersion: 1,
    emailVerifiedAt: new Date(),
    ...overrides,
  })
}

const createTestPost = async (userId, overrides = {}) => {
  return await Post.create({
    userId,
    content: 'Test post content',
    ...overrides,
  })
}

test('concurrent report creation: only one active report per reporter+target', async (t) => {
  if (skip(t)) return

  const reporter = await createTestUser()
  const targetUser = await createTestUser()
  const post = await createTestPost(targetUser.id)

  const results = await Promise.allSettled([
    Report.create({
      reporterId: reporter.id,
      targetType: 'post',
      targetId: post.id,
      reason: 'spam',
      description: 'Spam content',
      status: 'pending',
    }),
    Report.create({
      reporterId: reporter.id,
      targetType: 'post',
      targetId: post.id,
      reason: 'harassment',
      description: 'Harassment content',
      status: 'pending',
    }),
  ])

  const fulfilled = results.filter((r) => r.status === 'fulfilled')
  const rejected = results.filter((r) => r.status === 'rejected')

  assert.equal(fulfilled.length, 1, 'exactly one report should be created')
  assert.equal(rejected.length, 1, 'exactly one report should be rejected')

  const rejectedError = rejected[0].reason
  assert.ok(
    rejectedError.name === 'SequelizeUniqueConstraintError',
    'Expected SequelizeUniqueConstraintError, got ' + rejectedError.name
  )
  assert.equal(rejectedError.parent.code, '23505')

  const storedReports = await Report.findAll({
    where: {
      reporterId: reporter.id,
      targetType: 'post',
      targetId: post.id,
      status: { [Op.in]: ['pending', 'under_review'] },
    },
  })
  assert.equal(storedReports.length, 1, 'exactly one active report stored')
  assert.equal(storedReports[0].status, 'pending')
})

test('concurrent status updates: row locking prevents invalid final state', async (t) => {
  if (skip(t)) return

  const reporter = await createTestUser()
  const admin = await createTestUser({ role: 'admin' })
  const post = await createTestPost(reporter.id)

  const reportService = createReportService({
    Report,
    User,
    Post,
    sequelize: scoped,
  })

  const report = await Report.create({
    reporterId: reporter.id,
    targetType: 'post',
    targetId: post.id,
    reason: 'spam',
    status: 'pending',
  })
  assert.equal(report.status, 'pending')

  const results = await Promise.allSettled([
    reportService.updateReportStatus(report.id, admin.id, {
      status: 'resolved',
    }),
    reportService.updateReportStatus(report.id, admin.id, {
      status: 'dismissed',
    }),
  ])

  const fulfilled = results.filter((r) => r.status === 'fulfilled')
  const rejected = results.filter((r) => r.status === 'rejected')

  // Exactly one should succeed, the other should get ReportStateConflictError.
  // Neither 'resolved' nor 'dismissed' is a valid transition from the other,
  // so regardless of which update acquires the row lock first, exactly one
  // succeeds and the other fails with a state conflict.
  assert.equal(fulfilled.length, 1, 'exactly one update should succeed')
  assert.equal(rejected.length, 1, 'exactly one update should be rejected')

  const rejectedError = rejected[0].reason
  assert.ok(
    rejectedError instanceof ReportStateConflictError,
    'Expected ReportStateConflictError, got ' + (rejectedError && rejectedError.name)
  )
  assert.equal(rejectedError.code, 'REPORT_STATE_CONFLICT')
  assert.equal(rejectedError.status, 409)

  // Verify the final database record has a valid status and review metadata.
  const storedReport = await Report.findByPk(report.id)
  assert.ok(
    storedReport.status === 'resolved' ||
      storedReport.status === 'dismissed',
    'final status should be resolved or dismissed, got ' + storedReport.status
  )
  assert.ok(storedReport.reviewedBy, 'reviewedBy should be set')
  assert.ok(storedReport.reviewedAt, 'reviewedAt should be set')
})
