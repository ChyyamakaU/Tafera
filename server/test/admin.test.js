'use strict'

const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { createAdminService } = require('../src/services/adminService')
const { createAdminRouter } = require('../src/routes/admin')
const { createAuditLogService } = require('../src/services/auditLogService')
const { parseRegistration } = require('../src/validators/auth')
const { parseProfileUpdate } = require('../src/validators/profile')
const { AdminSelfActionError } = require('../src/utils/adminErrors')
const errorHandler = require('../src/middlewares/errorHandler')

const ADMIN_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const DEST_ID = '33333333-3333-4333-8333-333333333333'
const REPORT_ID = '44444444-4444-4444-8444-444444444444'
const POST_ID = '55555555-5555-4555-8555-555555555555'
const TRIP_ID = '66666666-6666-4666-8666-666666666666'

const createMockUserRecord = (overrides = {}) => {
  const state = {
    id: USER_ID,
    fullName: 'Ada Traveller',
    username: 'ada',
    email: 'ada@example.com',
    role: 'user',
    status: 'active',
    authVersion: 1,
    emailVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  }
  return {
    ...state,
    get() {
      return { ...state }
    },
    async update(changes) {
      Object.assign(state, changes)
      Object.assign(this, changes)
      return this
    },
  }
}

describe('Admin security, self-protection, and audit logging', () => {
  it('strips role and isSuspended/status from registration and profile update validators', () => {
    const reg = parseRegistration({
      fullName: 'Regular User',
      email: 'regular@example.com',
      password: 'VeryStrongPassword!123',
      role: 'admin',
      status: 'suspended',
      isSuspended: true,
    })
    assert.equal('role' in reg, false)
    assert.equal('status' in reg, false)
    assert.equal('isSuspended' in reg, false)

    const prof = parseProfileUpdate({
      fullName: 'Updated Name',
      role: 'admin',
      status: 'suspended',
      isSuspended: true,
    })
    assert.equal('role' in prof, false)
    assert.equal('status' in prof, false)
    assert.equal('isSuspended' in prof, false)
  })

  it('strictly blocks an admin from suspending or demoting their own account', async () => {
    const auditLogs = []
    const adminUser = createMockUserRecord({ id: ADMIN_ID, role: 'admin', email: 'admin@example.com' })

    const service = createAdminService({
      User: { findByPk: async () => adminUser },
      Destination: {},
      DestinationImage: {},
      Post: {},
      Comment: {},
      Trip: {},
      TripParticipant: {},
      TripDestination: {},
      Report: {},
      AdminAuditLog: {},
      auditLogService: {
        recordAction: async (entry) => {
          auditLogs.push(entry)
          return entry
        },
        listRecent: async () => ({ logs: auditLogs, pagination: { total: 0 } }),
      },
    })

    await assert.rejects(
      () => service.updateUserStatus(ADMIN_ID, ADMIN_ID, { status: 'suspended', reason: 'test' }),
      AdminSelfActionError,
    )
    await assert.rejects(
      () => service.updateUserRole(ADMIN_ID, ADMIN_ID, { role: 'user', reason: 'test' }),
      AdminSelfActionError,
    )
    assert.equal(auditLogs.length, 0)
  })

  it('suspends and restores a user, increments authVersion on suspend, and writes AdminAuditLog entries', async () => {
    const recorded = []
    const targetUser = createMockUserRecord({ id: USER_ID, authVersion: 2 })

    const auditLogService = createAuditLogService({
      AdminAuditLog: {
        create: async (payload) => {
          const entry = {
            id: `log-${recorded.length + 1}`,
            ...payload,
            createdAt: new Date('2026-11-23T12:00:00.000Z'),
          }
          recorded.push(entry)
          return entry
        },
      },
      User: {},
    })

    const service = createAdminService({
      User: { findByPk: async (id) => (id === USER_ID ? targetUser : null) },
      Destination: {},
      DestinationImage: {},
      Post: {},
      Comment: {},
      Trip: {},
      TripParticipant: {},
      TripDestination: {},
      Report: {},
      AdminAuditLog: {},
      auditLogService,
    })

    const suspended = await service.updateUserStatus(ADMIN_ID, USER_ID, {
      status: 'suspended',
      reason: 'Repeated spam',
    })
    assert.equal(suspended.status, 'suspended')
    assert.equal(targetUser.authVersion, 3)
    assert.equal(recorded.length, 1)
    assert.equal(recorded[0].action, 'user.suspend')
    assert.equal(recorded[0].adminId, ADMIN_ID)
    assert.equal(recorded[0].targetId, USER_ID)
    assert.equal(recorded[0].reason, 'Repeated spam')

    const restored = await service.updateUserStatus(ADMIN_ID, USER_ID, {
      status: 'active',
      reason: 'Appeal approved',
    })
    assert.equal(restored.status, 'active')
    assert.equal(recorded.length, 2)
    assert.equal(recorded[1].action, 'user.restore')
  })

  it('records audit logs when publishing/unpublishing destinations, moderating reports, and cancelling group trips', async () => {
    const recorded = []
    const destState = {
      id: DEST_ID,
      name: 'Obudu Plateau',
      slug: 'obudu-plateau',
      country: 'Nigeria',
      state: 'Cross River',
      description: 'Highland resort in Cross River State.',
      status: 'published',
      featured: false,
      images: [],
    }
    const destRecord = {
      ...destState,
      get() {
        return { ...destState }
      },
      async update(changes) {
        Object.assign(destState, changes)
        Object.assign(this, changes)
        return this
      },
    }

    let postDestroyed = false
    const reportState = {
      id: REPORT_ID,
      reporterId: USER_ID,
      targetType: 'post',
      targetId: POST_ID,
      reason: 'spam',
      status: 'pending',
    }
    const reportRecord = {
      ...reportState,
      get() {
        return { ...reportState }
      },
      async update(changes) {
        Object.assign(reportState, changes)
        Object.assign(this, changes)
        return this
      },
    }

    const tripState = {
      id: TRIP_ID,
      userId: USER_ID,
      title: 'Abuja Weekend',
      tripType: 'group',
      startDate: '2026-12-01',
      endDate: '2026-12-03',
      status: 'published',
    }
    const tripRecord = {
      ...tripState,
      get() {
        return { ...tripState }
      },
      async update(changes) {
        Object.assign(tripState, changes)
        Object.assign(this, changes)
        return this
      },
    }

    const service = createAdminService({
      User: { findAll: async () => [] },
      Destination: {
        findByPk: async () => destRecord,
        findOne: async () => null,
      },
      DestinationImage: {},
      Post: {
        findByPk: async () => ({
          id: POST_ID,
          userId: USER_ID,
          destroy: async () => {
            postDestroyed = true
          },
        }),
        findAll: async () => [],
      },
      Comment: { findAll: async () => [] },
      Trip: {
        findOne: async () => tripRecord,
        findAll: async () => [],
      },
      TripParticipant: {},
      TripDestination: {},
      Report: { findByPk: async () => reportRecord },
      AdminAuditLog: {},
      auditLogService: {
        recordAction: async (entry) => {
          recorded.push(entry)
          return entry
        },
        listRecent: async () => ({ logs: recorded, pagination: { total: recorded.length } }),
      },
    })

    const unpublished = await service.updateDestination(ADMIN_ID, DEST_ID, {
      status: 'draft',
      reason: 'Updating description',
    })
    assert.equal(unpublished.isPublished, false)
    assert.equal(recorded.at(-1).action, 'destination.unpublish')

    const moderated = await service.moderateReport(ADMIN_ID, REPORT_ID, {
      status: 'resolved',
      action: 'remove_content',
      resolutionNote: 'Confirmed spam post',
    })
    assert.equal(postDestroyed, true)
    assert.equal(moderated.status, 'resolved')
    assert.equal(moderated.enforcementOutcome, 'post_deleted')
    assert.ok(recorded.some((r) => r.action === 'post.delete'))
    assert.ok(recorded.some((r) => r.action === 'report.resolved'))

    const cancelledTrip = await service.updateGroupTripStatus(ADMIN_ID, TRIP_ID, {
      status: 'cancelled',
      reason: 'Safety notice',
    })
    assert.equal(cancelledTrip.status, 'cancelled')
    assert.equal(recorded.at(-1).action, 'trip.update_status')
  })

  it('enforces requireAdmin (403 for non-admins, 200 for admins) on /api/admin routes', async () => {
    const activeUsers = {
      [ADMIN_ID]: createMockUserRecord({ id: ADMIN_ID, role: 'admin', email: 'admin@example.com' }),
      [USER_ID]: createMockUserRecord({ id: USER_ID, role: 'user', email: 'user@example.com' }),
    }

    const fakeAdminService = {
      getOverview: async () => ({
        metrics: { totalUsers: 2, verifiedUsers: 2, pendingReports: 0 },
        recentActivity: [],
      }),
    }

    let currentSessionUserId = USER_ID

    const app = express()
    app.use(express.json())
    app.use((req, _res, next) => {
      const now = Date.now()
      req.session = {
        userId: currentSessionUserId,
        roleAtLogin: activeUsers[currentSessionUserId].role,
        authVersion: activeUsers[currentSessionUserId].authVersion,
        createdAt: now,
        lastSeenAt: now,
        absoluteExpiresAt: now + 60 * 60 * 1000,
        csrfToken: 'test-csrf',
      }
      next()
    })

    const router = createAdminRouter({
      adminService: fakeAdminService,
      User: { findByPk: async (id) => activeUsers[id] || null },
      sessions: {
        destroySession: async () => ({ destroyed: true }),
      },
    })
    app.use('/api/admin', router)
    app.use(errorHandler)

    const server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s))
    })

    try {
      const { port } = server.address()
      const baseUrl = `http://127.0.0.1:${port}`

      // Non-admin receives 403 Forbidden from requireAdmin
      currentSessionUserId = USER_ID
      const forbiddenRes = await fetch(`${baseUrl}/api/admin/overview`)
      assert.equal(forbiddenRes.status, 403)
      const forbiddenBody = await forbiddenRes.json()
      assert.equal(forbiddenBody.error.code, 'REPORT_ADMIN_REQUIRED')

      // Admin receives 200 OK with live metrics
      currentSessionUserId = ADMIN_ID
      const okRes = await fetch(`${baseUrl}/api/admin/overview`)
      assert.equal(okRes.status, 200)
      const okBody = await okRes.json()
      assert.equal(okBody.data.metrics.totalUsers, 2)
    } finally {
      await new Promise((resolve) => server.close(resolve))
    }
  })
})
