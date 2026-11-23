'use strict'

const { Op } = require('sequelize')
const cloudinary = require('../config/cloudinary')
const { createPagination } = require('../utils/pagination')
const { toPublicUser } = require('../utils/safeUser')
const { toPublicDestinationImage } = require('../utils/safeDestination')
const {
  AdminConflictError,
  AdminSelfActionError,
  AdminTargetNotFoundError,
} = require('../utils/adminErrors')
const {
  ReportNotFoundError,
  ReportStateConflictError,
} = require('../utils/reportErrors')
const { createAuditLogService } = require('./auditLogService')

const toPlain = (value) => {
  if (!value || typeof value !== 'object') return null
  return typeof value.get === 'function' ? value.get({ plain: true }) : value
}

const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 110) || 'destination'

const toAdminUser = (user) => {
  const safe = toPublicUser(user)
  if (!safe) return null
  const source = toPlain(user)
  return {
    ...safe,
    emailVerified: source.emailVerifiedAt != null,
    emailVerifiedAt: source.emailVerifiedAt ?? null,
    isSuspended: source.status === 'suspended',
  }
}

const toAdminDestination = (destination) => {
  const source = toPlain(destination)
  if (!source) return null
  const images = Array.isArray(source.images)
    ? source.images
        .map(toPublicDestinationImage)
        .filter(Boolean)
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
    : []
  const coverImage = images.find((img) => img.isCover) || images[0] || null

  return {
    id: source.id,
    name: source.name,
    slug: source.slug,
    country: source.country,
    state: source.state ?? null,
    location: source.location ?? null,
    description: source.description,
    latitude: source.latitude !== null && source.latitude !== undefined ? Number(source.latitude) : null,
    longitude: source.longitude !== null && source.longitude !== undefined ? Number(source.longitude) : null,
    featured: Boolean(source.featured),
    status: source.status,
    isPublished: source.status === 'published',
    coverImage,
    images,
    imageCount: images.length,
    createdBy: source.createdBy ?? null,
    createdAt: source.createdAt ?? null,
    updatedAt: source.updatedAt ?? null,
  }
}

const toAdminTrip = (trip, extra = {}) => {
  const source = toPlain(trip)
  if (!source) return null

  const participants = Array.isArray(source.participants)
    ? source.participants.map((p) => ({
        id: p.id,
        status: p.status,
        joinedAt: p.createdAt ?? null,
        user: p.user
          ? {
              id: p.user.id,
              fullName: p.user.fullName,
              email: p.user.email ?? null,
              username: p.user.username ?? null,
              profileImage: p.user.profileImage ?? null,
              status: p.user.status ?? 'active',
            }
          : null,
      }))
    : undefined

  return {
    id: source.id,
    title: source.title,
    description: source.description ?? null,
    tripType: source.tripType,
    startDate: source.startDate,
    endDate: source.endDate,
    maxParticipants: source.maxParticipants ?? null,
    status: source.status,
    creator: source.creator
      ? {
          id: source.creator.id,
          fullName: source.creator.fullName,
          email: source.creator.email ?? null,
          username: source.creator.username ?? null,
          status: source.creator.status ?? 'active',
        }
      : null,
    ...(participants ? { participants } : {}),
    ...(Array.isArray(source.destinations)
      ? {
          destinations: source.destinations.map((stop) => ({
            id: stop.id,
            stopOrder: stop.stopOrder,
            destination: stop.destination
              ? {
                  id: stop.destination.id,
                  name: stop.destination.name,
                  country: stop.destination.country,
                  state: stop.destination.state ?? null,
                }
              : null,
          })),
        }
      : {}),
    createdAt: source.createdAt ?? null,
    updatedAt: source.updatedAt ?? null,
    ...extra,
  }
}

const createAdminService = ({
  User,
  Destination,
  DestinationImage,
  Post,
  Comment,
  Trip,
  TripParticipant,
  TripDestination,
  Report,
  AdminAuditLog,
  auditLogService,
  cloudinaryClient = cloudinary,
  sequelize,
} = {}) => {
  const getModels = () => {
    const models =
      !User ||
      !Destination ||
      !DestinationImage ||
      !Post ||
      !Comment ||
      !Trip ||
      !TripParticipant ||
      !TripDestination ||
      !Report ||
      !AdminAuditLog
        ? require('../models')
        : {}

    return {
      userModel: User || models.User,
      destinationModel: Destination || models.Destination,
      destinationImageModel: DestinationImage || models.DestinationImage,
      postModel: Post || models.Post,
      commentModel: Comment || models.Comment,
      tripModel: Trip || models.Trip,
      tripParticipantModel: TripParticipant || models.TripParticipant,
      tripDestinationModel: TripDestination || models.TripDestination,
      reportModel: Report || models.Report,
      auditLogModel: AdminAuditLog || models.AdminAuditLog,
      database: sequelize || (User && User.sequelize) || models.sequelize,
    }
  }

  const getAuditService = () => {
    if (auditLogService) return auditLogService
    const { auditLogModel, userModel } = getModels()
    return createAuditLogService({
      AdminAuditLog: auditLogModel,
      User: userModel,
    })
  }

  const generateUniqueSlug = async (destinationModel, name, excludeId = null) => {
    const base = slugify(name)
    let candidate = base
    let suffix = 1

    for (let attempt = 0; attempt < 25; attempt += 1) {
      const where = excludeId
        ? { slug: candidate, id: { [Op.ne]: excludeId } }
        : { slug: candidate }
      const existing = await destinationModel.findOne({ where, attributes: ['id'] })
      if (!existing) return candidate
      suffix += 1
      candidate = `${base}-${suffix}`
    }

    return `${base}-${Date.now().toString(36)}`
  }

  const getOverview = async () => {
    const {
      userModel,
      destinationModel,
      postModel,
      tripModel,
      reportModel,
    } = getModels()
    const audit = getAuditService()

    const [
      totalUsers,
      verifiedUsers,
      suspendedUsers,
      totalDestinations,
      publishedDestinations,
      draftDestinations,
      activeGroupTrips,
      totalGroupTrips,
      totalPosts,
      pendingReports,
      totalReports,
      recentAudit,
    ] = await Promise.all([
      userModel.count(),
      userModel.count({ where: { emailVerifiedAt: { [Op.ne]: null } } }),
      userModel.count({ where: { status: 'suspended' } }),
      destinationModel.count(),
      destinationModel.count({ where: { status: 'published' } }),
      destinationModel.count({ where: { status: 'draft' } }),
      tripModel.count({ where: { tripType: 'group', status: 'published' } }),
      tripModel.count({ where: { tripType: 'group' } }),
      postModel.count(),
      reportModel.count({
        where: { status: { [Op.in]: ['pending', 'under_review'] } },
      }),
      reportModel.count(),
      audit.listRecent({ page: 1, limit: 12 }).catch(() => ({ logs: [] })),
    ])

    return {
      metrics: {
        totalUsers,
        verifiedUsers,
        suspendedUsers,
        totalDestinations,
        publishedDestinations,
        draftDestinations,
        activeGroupTrips,
        totalGroupTrips,
        totalPosts,
        pendingReports,
        totalReports,
      },
      recentActivity: recentAudit.logs || [],
    }
  }

  const listAuditLogs = async (filters = {}) => {
    const audit = getAuditService()
    return audit.listRecent(filters)
  }

  // ---- Users ----
  const listUsers = async ({ page = 1, limit = 20, search, role, status } = {}) => {
    const { userModel } = getModels()
    const where = {}

    if (role) where.role = role
    if (status) where.status = status
    if (search) {
      const pattern = `%${search}%`
      where[Op.or] = [
        { fullName: { [Op.iLike]: pattern } },
        { email: { [Op.iLike]: pattern } },
        { username: { [Op.iLike]: pattern } },
      ]
    }

    const { count, rows } = await userModel.findAndCountAll({
      where,
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit,
      offset: (page - 1) * limit,
      distinct: true,
    })

    return {
      users: rows.map(toAdminUser),
      pagination: createPagination({ page, limit, total: count }),
    }
  }

  const getUserDetail = async (userId) => {
    const { userModel, postModel, commentModel, tripModel, reportModel } = getModels()
    const user = await userModel.findByPk(userId)

    if (!user) {
      throw new AdminTargetNotFoundError('User account not found.')
    }

    const [postsCount, commentsCount, tripsCount, reportsAgainstCount] =
      await Promise.all([
        postModel.count({ where: { userId } }),
        commentModel.count({ where: { userId } }),
        tripModel.count({ where: { userId } }),
        reportModel.count({ where: { targetType: 'user', targetId: userId } }),
      ])

    return {
      ...toAdminUser(user),
      activity: {
        postsCount,
        commentsCount,
        tripsCount,
        reportsAgainstCount,
      },
    }
  }

  const updateUserStatus = async (adminId, targetUserId, { status, reason = null }) => {
    if (adminId === targetUserId && status === 'suspended') {
      throw new AdminSelfActionError(
        'You cannot suspend your own administrator account.',
      )
    }

    const { userModel } = getModels()
    const audit = getAuditService()
    const user = await userModel.findByPk(targetUserId)

    if (!user) {
      throw new AdminTargetNotFoundError('User account not found.')
    }

    const previousStatus = user.status
    const nextAuthVersion =
      status === 'suspended' ? (user.authVersion || 1) + 1 : user.authVersion || 1

    await user.update({
      status,
      authVersion: nextAuthVersion,
    })

    await audit.recordAction({
      adminId,
      action: status === 'suspended' ? 'user.suspend' : 'user.restore',
      targetType: 'user',
      targetId: user.id,
      reason,
      metadata: {
        previousStatus,
        nextStatus: status,
        email: user.email,
      },
    })

    return toAdminUser(user)
  }

  const updateUserRole = async (adminId, targetUserId, { role, reason = null }) => {
    if (adminId === targetUserId && role !== 'admin') {
      throw new AdminSelfActionError(
        'You cannot demote your own administrator account.',
      )
    }

    const { userModel } = getModels()
    const audit = getAuditService()
    const user = await userModel.findByPk(targetUserId)

    if (!user) {
      throw new AdminTargetNotFoundError('User account not found.')
    }

    const previousRole = user.role
    const nextAuthVersion =
      previousRole === 'admin' && role !== 'admin'
        ? (user.authVersion || 1) + 1
        : user.authVersion || 1

    await user.update({
      role,
      authVersion: nextAuthVersion,
    })

    await audit.recordAction({
      adminId,
      action: 'user.role_change',
      targetType: 'user',
      targetId: user.id,
      reason,
      metadata: {
        previousRole,
        nextRole: role,
        email: user.email,
      },
    })

    return toAdminUser(user)
  }

  // ---- Destinations & Photos ----
  const listDestinations = async ({
    page = 1,
    limit = 20,
    search,
    status,
    country,
    state,
  } = {}) => {
    const { destinationModel, destinationImageModel, userModel } = getModels()
    const where = {}

    if (status) where.status = status
    if (country) where.country = { [Op.iLike]: `%${country}%` }
    if (state) where.state = { [Op.iLike]: `%${state}%` }
    if (search) {
      const pattern = `%${search}%`
      where[Op.or] = [
        { name: { [Op.iLike]: pattern } },
        { country: { [Op.iLike]: pattern } },
        { state: { [Op.iLike]: pattern } },
        { location: { [Op.iLike]: pattern } },
      ]
    }

    const { count, rows } = await destinationModel.findAndCountAll({
      where,
      include: [
        {
          model: destinationImageModel,
          as: 'images',
          required: false,
          include: [
            {
              model: userModel,
              as: 'contributor',
              attributes: ['id', 'fullName', 'username', 'profileImage'],
              required: false,
            },
          ],
        },
      ],
      order: [
        ['updatedAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit,
      offset: (page - 1) * limit,
      distinct: true,
    })

    return {
      destinations: rows.map(toAdminDestination),
      pagination: createPagination({ page, limit, total: count }),
    }
  }

  const createDestination = async (adminId, input) => {
    const { destinationModel } = getModels()
    const audit = getAuditService()

    const slug = await generateUniqueSlug(destinationModel, input.name)
    const created = await destinationModel.create({
      name: input.name,
      slug,
      country: input.country,
      state: input.state ?? null,
      location: input.location ?? null,
      description: input.description,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      featured: Boolean(input.featured),
      status: input.status || 'published',
      createdBy: adminId,
    })

    await audit.recordAction({
      adminId,
      action: 'destination.create',
      targetType: 'destination',
      targetId: created.id,
      metadata: {
        name: created.name,
        status: created.status,
      },
    })

    return toAdminDestination(created)
  }

  const updateDestination = async (adminId, destinationId, input) => {
    const { destinationModel, destinationImageModel, userModel } = getModels()
    const audit = getAuditService()

    const destination = await destinationModel.findByPk(destinationId, {
      include: [
        {
          model: destinationImageModel,
          as: 'images',
          required: false,
          include: [
            {
              model: userModel,
              as: 'contributor',
              attributes: ['id', 'fullName', 'username', 'profileImage'],
              required: false,
            },
          ],
        },
      ],
    })

    if (!destination) {
      throw new AdminTargetNotFoundError('Destination not found.')
    }

    const previousStatus = destination.status
    const { reason = null, ...changes } = input

    if (changes.name && changes.name !== destination.name) {
      changes.slug = await generateUniqueSlug(destinationModel, changes.name, destination.id)
    }

    await destination.update(changes)

    let action = 'destination.update'
    if (changes.status && changes.status !== previousStatus) {
      action =
        changes.status === 'published'
          ? 'destination.publish'
          : 'destination.unpublish'
    }

    await audit.recordAction({
      adminId,
      action,
      targetType: 'destination',
      targetId: destination.id,
      reason,
      metadata: {
        name: destination.name,
        previousStatus,
        nextStatus: destination.status,
      },
    })

    return toAdminDestination(destination)
  }

  const deleteDestination = async (adminId, destinationId, { reason = null } = {}) => {
    const { destinationModel, tripDestinationModel } = getModels()
    const audit = getAuditService()

    const destination = await destinationModel.findByPk(destinationId)
    if (!destination) {
      throw new AdminTargetNotFoundError('Destination not found.')
    }

    const linkedStops = await tripDestinationModel.count({
      where: { destinationId: destination.id },
    })
    if (linkedStops > 0) {
      throw new AdminConflictError(
        'This destination is linked to active trip itineraries and cannot be deleted. Unpublish it instead.',
      )
    }

    const snapshot = { name: destination.name, slug: destination.slug }
    await destination.destroy()

    await audit.recordAction({
      adminId,
      action: 'destination.delete',
      targetType: 'destination',
      targetId: destinationId,
      reason,
      metadata: snapshot,
    })
  }

  const listDestinationPhotos = async ({ page = 1, limit = 24, destinationId } = {}) => {
    const { destinationImageModel, destinationModel, userModel } = getModels()
    const where = {}
    if (destinationId) where.destinationId = destinationId

    const { count, rows } = await destinationImageModel.findAndCountAll({
      where,
      include: [
        {
          model: destinationModel,
          as: 'destination',
          attributes: ['id', 'name', 'slug', 'country', 'state', 'status'],
          required: true,
        },
        {
          model: userModel,
          as: 'contributor',
          attributes: ['id', 'fullName', 'username', 'email', 'profileImage'],
          required: false,
        },
      ],
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit,
      offset: (page - 1) * limit,
      distinct: true,
    })

    return {
      photos: rows.map((row) => {
        const plain = toPlain(row)
        return {
          ...toPublicDestinationImage(plain),
          destination: plain.destination
            ? {
                id: plain.destination.id,
                name: plain.destination.name,
                slug: plain.destination.slug,
                country: plain.destination.country,
                state: plain.destination.state ?? null,
                status: plain.destination.status,
              }
            : null,
        }
      }),
      pagination: createPagination({ page, limit, total: count }),
    }
  }

  const deleteDestinationPhoto = async (
    adminId,
    destinationId,
    imageId,
    { reason = null } = {},
  ) => {
    const { destinationImageModel } = getModels()
    const audit = getAuditService()

    const image = await destinationImageModel.findOne({
      where: { id: imageId, destinationId },
    })

    if (!image) {
      throw new AdminTargetNotFoundError('Destination photo not found.')
    }

    const publicId = image.publicId
    await image.destroy()

    if (publicId && cloudinaryClient?.uploader?.destroy) {
      try {
        await cloudinaryClient.uploader.destroy(publicId, { resource_type: 'image' })
      } catch {
        // DB deletion succeeded; log audit entry regardless of remote storage response.
      }
    }

    await audit.recordAction({
      adminId,
      action: 'destination_image.delete',
      targetType: 'destination_image',
      targetId: imageId,
      reason,
      metadata: { destinationId, contributorId: image.userId ?? null },
    })
  }

  // ---- Moderation & Reports ----
  const hydrateReportTargets = async (reports) => {
    const { userModel, postModel, commentModel, tripModel } = getModels()
    const idsByType = { user: [], post: [], comment: [], trip: [] }

    for (const report of reports) {
      if (idsByType[report.targetType] && report.targetId) {
        idsByType[report.targetType].push(report.targetId)
      }
    }

    const [users, posts, comments, trips] = await Promise.all([
      idsByType.user.length
        ? userModel.findAll({
            where: { id: { [Op.in]: [...new Set(idsByType.user)] } },
            attributes: ['id', 'fullName', 'email', 'username', 'role', 'status'],
          })
        : [],
      idsByType.post.length
        ? postModel.findAll({
            where: { id: { [Op.in]: [...new Set(idsByType.post)] } },
            attributes: ['id', 'userId', 'content', 'createdAt'],
            include: [
              {
                model: userModel,
                as: 'author',
                attributes: ['id', 'fullName', 'email', 'status'],
                required: false,
              },
            ],
          })
        : [],
      idsByType.comment.length
        ? commentModel.findAll({
            where: { id: { [Op.in]: [...new Set(idsByType.comment)] } },
            attributes: ['id', 'userId', 'postId', 'content', 'createdAt'],
            include: [
              {
                model: userModel,
                as: 'author',
                attributes: ['id', 'fullName', 'email', 'status'],
                required: false,
              },
            ],
          })
        : [],
      idsByType.trip.length
        ? tripModel.findAll({
            where: { id: { [Op.in]: [...new Set(idsByType.trip)] } },
            attributes: ['id', 'userId', 'title', 'status', 'startDate', 'endDate'],
            include: [
              {
                model: userModel,
                as: 'creator',
                attributes: ['id', 'fullName', 'email', 'status'],
                required: false,
              },
            ],
          })
        : [],
    ])

    const lookup = {
      user: new Map(users.map((u) => [u.id, toPlain(u)])),
      post: new Map(posts.map((p) => [p.id, toPlain(p)])),
      comment: new Map(comments.map((c) => [c.id, toPlain(c)])),
      trip: new Map(trips.map((t) => [t.id, toPlain(t)])),
    }

    return reports.map((report) => {
      const target = lookup[report.targetType]?.get(report.targetId) || null
      let targetSummary = null

      if (report.targetType === 'user' && target) {
        targetSummary = {
          exists: true,
          label: target.fullName,
          subtitle: target.email,
          status: target.status,
          ownerId: target.id,
        }
      } else if (report.targetType === 'post' && target) {
        targetSummary = {
          exists: true,
          label: target.content,
          subtitle: target.author ? `By ${target.author.fullName}` : null,
          ownerId: target.userId,
          ownerStatus: target.author?.status ?? null,
        }
      } else if (report.targetType === 'comment' && target) {
        targetSummary = {
          exists: true,
          label: target.content,
          subtitle: target.author ? `By ${target.author.fullName}` : null,
          ownerId: target.userId,
          ownerStatus: target.author?.status ?? null,
        }
      } else if (report.targetType === 'trip' && target) {
        targetSummary = {
          exists: true,
          label: target.title,
          subtitle: target.creator
            ? `Organised by ${target.creator.fullName} · ${target.status}`
            : target.status,
          status: target.status,
          ownerId: target.userId,
          ownerStatus: target.creator?.status ?? null,
        }
      } else {
        targetSummary = {
          exists: false,
          label: 'Content no longer available',
          subtitle: null,
          ownerId: null,
        }
      }

      return {
        ...report,
        targetSummary,
      }
    })
  }

  const listReports = async ({ page = 1, limit = 20, status, targetType } = {}) => {
    const { reportModel, userModel } = getModels()
    const where = {}
    if (status) where.status = status
    if (targetType) where.targetType = targetType

    const { count, rows } = await reportModel.findAndCountAll({
      where,
      include: [
        {
          model: userModel,
          as: 'reporter',
          attributes: ['id', 'fullName', 'email', 'username'],
          required: false,
        },
        {
          model: userModel,
          as: 'reviewer',
          attributes: ['id', 'fullName', 'email'],
          required: false,
        },
      ],
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit,
      offset: (page - 1) * limit,
      distinct: true,
    })

    const plainReports = rows.map((row) => {
      const source = toPlain(row)
      return {
        id: source.id,
        reporterId: source.reporterId,
        reporter: source.reporter || null,
        targetType: source.targetType,
        targetId: source.targetId,
        reason: source.reason,
        description: source.description ?? null,
        status: source.status,
        reviewedBy: source.reviewedBy ?? null,
        reviewer: source.reviewer || null,
        reviewedAt: source.reviewedAt ?? null,
        resolutionNote: source.resolutionNote ?? null,
        createdAt: source.createdAt,
        updatedAt: source.updatedAt,
      }
    })

    const hydrated = await hydrateReportTargets(plainReports)

    return {
      reports: hydrated,
      pagination: createPagination({ page, limit, total: count }),
    }
  }

  const moderateReport = async (
    adminId,
    reportId,
    { status, resolutionNote = null, action = 'none', reason = null },
  ) => {
    const { reportModel, postModel, commentModel, tripModel } = getModels()
    const audit = getAuditService()

    const report = await reportModel.findByPk(reportId)
    if (!report) {
      throw new ReportNotFoundError()
    }

    const allowedTransitions = {
      pending: ['under_review', 'resolved', 'dismissed'],
      under_review: ['resolved', 'dismissed'],
    }
    if (!allowedTransitions[report.status]?.includes(status)) {
      throw new ReportStateConflictError()
    }

    const decisionReason = resolutionNote || reason || null
    let enforcementOutcome = null

    if (action === 'remove_content') {
      if (report.targetType === 'post') {
        const post = await postModel.findByPk(report.targetId)
        if (post) {
          await post.destroy()
          await audit.recordAction({
            adminId,
            action: 'post.delete',
            targetType: 'post',
            targetId: report.targetId,
            reason: decisionReason,
            metadata: { reportId: report.id },
          })
          enforcementOutcome = 'post_deleted'
        }
      } else if (report.targetType === 'comment') {
        const comment = await commentModel.findByPk(report.targetId)
        if (comment) {
          await comment.destroy()
          await audit.recordAction({
            adminId,
            action: 'comment.delete',
            targetType: 'comment',
            targetId: report.targetId,
            reason: decisionReason,
            metadata: { reportId: report.id },
          })
          enforcementOutcome = 'comment_deleted'
        }
      } else if (report.targetType === 'trip') {
        const trip = await tripModel.findByPk(report.targetId)
        if (trip) {
          await trip.update({ status: 'cancelled' })
          await audit.recordAction({
            adminId,
            action: 'trip.update_status',
            targetType: 'trip',
            targetId: report.targetId,
            reason: decisionReason,
            metadata: { reportId: report.id, nextStatus: 'cancelled' },
          })
          enforcementOutcome = 'trip_cancelled'
        }
      }
    } else if (action === 'suspend_user') {
      let offendingUserId = null
      if (report.targetType === 'user') {
        offendingUserId = report.targetId
      } else if (report.targetType === 'post') {
        const post = await postModel.findByPk(report.targetId, { attributes: ['userId'] })
        offendingUserId = post?.userId || null
      } else if (report.targetType === 'comment') {
        const comment = await commentModel.findByPk(report.targetId, { attributes: ['userId'] })
        offendingUserId = comment?.userId || null
      } else if (report.targetType === 'trip') {
        const trip = await tripModel.findByPk(report.targetId, { attributes: ['userId'] })
        offendingUserId = trip?.userId || null
      }

      if (offendingUserId) {
        await updateUserStatus(adminId, offendingUserId, {
          status: 'suspended',
          reason: decisionReason || `Suspended via moderation report ${report.id}`,
        })
        enforcementOutcome = 'user_suspended'
      }
    }

    await report.update({
      status,
      reviewedBy: adminId,
      reviewedAt: new Date(),
      resolutionNote: decisionReason,
    })

    await audit.recordAction({
      adminId,
      action: `report.${status}`,
      targetType: 'report',
      targetId: report.id,
      reason: decisionReason,
      metadata: {
        reportTargetType: report.targetType,
        reportTargetId: report.targetId,
        enforcementAction: action,
        enforcementOutcome,
      },
    })

    const source = toPlain(report)
    const [hydrated] = await hydrateReportTargets([source])
    return {
      ...hydrated,
      enforcementOutcome,
    }
  }

  const deletePostAsAdmin = async (adminId, postId, { reason = null } = {}) => {
    const { postModel } = getModels()
    const audit = getAuditService()
    const post = await postModel.findByPk(postId)

    if (!post) {
      throw new AdminTargetNotFoundError('Post not found.')
    }

    await post.destroy()
    await audit.recordAction({
      adminId,
      action: 'post.delete',
      targetType: 'post',
      targetId: postId,
      reason,
      metadata: { authorId: post.userId },
    })
  }

  const deleteCommentAsAdmin = async (adminId, commentId, { reason = null } = {}) => {
    const { commentModel } = getModels()
    const audit = getAuditService()
    const comment = await commentModel.findByPk(commentId)

    if (!comment) {
      throw new AdminTargetNotFoundError('Comment not found.')
    }

    await comment.destroy()
    await audit.recordAction({
      adminId,
      action: 'comment.delete',
      targetType: 'comment',
      targetId: commentId,
      reason,
      metadata: { authorId: comment.userId, postId: comment.postId },
    })
  }

  // ---- Group Trips ----
  const listGroupTrips = async ({ page = 1, limit = 20, search, status } = {}) => {
    const { tripModel, userModel, tripParticipantModel, reportModel } = getModels()
    const where = { tripType: 'group' }

    if (status) where.status = status
    if (search) {
      const pattern = `%${search}%`
      where[Op.or] = [
        { title: { [Op.iLike]: pattern } },
        { description: { [Op.iLike]: pattern } },
      ]
    }

    const { count, rows } = await tripModel.findAndCountAll({
      where,
      include: [
        {
          model: userModel,
          as: 'creator',
          attributes: ['id', 'fullName', 'email', 'username', 'status'],
          required: false,
        },
        {
          model: tripParticipantModel,
          as: 'participants',
          attributes: ['id', 'status'],
          required: false,
        },
      ],
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit,
      offset: (page - 1) * limit,
      distinct: true,
    })

    const tripIds = rows.map((row) => row.id)
    const openReports = tripIds.length
      ? await reportModel.findAll({
          where: {
            targetType: 'trip',
            targetId: { [Op.in]: tripIds },
            status: { [Op.in]: ['pending', 'under_review'] },
          },
          attributes: ['targetId'],
        })
      : []

    const reportCounts = new Map()
    for (const rep of openReports) {
      reportCounts.set(rep.targetId, (reportCounts.get(rep.targetId) || 0) + 1)
    }

    return {
      trips: rows.map((row) => {
        const plain = toPlain(row)
        const allParticipants = Array.isArray(plain.participants) ? plain.participants : []
        const approvedCount = allParticipants.filter((p) => p.status === 'approved').length
        const pendingCount = allParticipants.filter((p) => p.status === 'pending').length

        return toAdminTrip(
          { ...plain, participants: undefined },
          {
            participantCount: approvedCount,
            pendingParticipantCount: pendingCount,
            openReportsCount: reportCounts.get(plain.id) || 0,
          },
        )
      }),
      pagination: createPagination({ page, limit, total: count }),
    }
  }

  const getGroupTripDetail = async (tripId) => {
    const {
      tripModel,
      userModel,
      tripParticipantModel,
      tripDestinationModel,
      destinationModel,
      reportModel,
    } = getModels()

    const trip = await tripModel.findOne({
      where: { id: tripId, tripType: 'group' },
      include: [
        {
          model: userModel,
          as: 'creator',
          attributes: ['id', 'fullName', 'email', 'username', 'status'],
          required: false,
        },
        {
          model: tripParticipantModel,
          as: 'participants',
          required: false,
          include: [
            {
              model: userModel,
              as: 'user',
              attributes: ['id', 'fullName', 'email', 'username', 'profileImage', 'status'],
              required: false,
            },
          ],
        },
        {
          model: tripDestinationModel,
          as: 'destinations',
          required: false,
          include: [
            {
              model: destinationModel,
              as: 'destination',
              attributes: ['id', 'name', 'country', 'state'],
              required: false,
            },
          ],
        },
      ],
    })

    if (!trip) {
      throw new AdminTargetNotFoundError('Group trip not found.')
    }

    const reports = await reportModel.findAll({
      where: { targetType: 'trip', targetId: trip.id },
      order: [['createdAt', 'DESC']],
    })

    return toAdminTrip(trip, {
      reports: reports.map(toPlain),
    })
  }

  const updateGroupTripStatus = async (adminId, tripId, { status, reason = null }) => {
    const { tripModel } = getModels()
    const audit = getAuditService()

    const trip = await tripModel.findOne({ where: { id: tripId, tripType: 'group' } })
    if (!trip) {
      throw new AdminTargetNotFoundError('Group trip not found.')
    }

    const previousStatus = trip.status
    await trip.update({ status })

    await audit.recordAction({
      adminId,
      action: 'trip.update_status',
      targetType: 'trip',
      targetId: trip.id,
      reason,
      metadata: {
        title: trip.title,
        previousStatus,
        nextStatus: status,
      },
    })

    return toAdminTrip(trip)
  }

  const deleteGroupTrip = async (adminId, tripId, { reason = null } = {}) => {
    const { tripModel } = getModels()
    const audit = getAuditService()

    const trip = await tripModel.findOne({ where: { id: tripId, tripType: 'group' } })
    if (!trip) {
      throw new AdminTargetNotFoundError('Group trip not found.')
    }

    const snapshot = { title: trip.title, organizerId: trip.userId }
    await trip.destroy()

    await audit.recordAction({
      adminId,
      action: 'trip.delete',
      targetType: 'trip',
      targetId: tripId,
      reason,
      metadata: snapshot,
    })
  }

  return {
    getOverview,
    listAuditLogs,
    listUsers,
    getUserDetail,
    updateUserStatus,
    updateUserRole,
    listDestinations,
    createDestination,
    updateDestination,
    deleteDestination,
    listDestinationPhotos,
    deleteDestinationPhoto,
    listReports,
    moderateReport,
    deletePostAsAdmin,
    deleteCommentAsAdmin,
    listGroupTrips,
    getGroupTripDetail,
    updateGroupTripStatus,
    deleteGroupTrip,
  }
}

module.exports = {
  createAdminService,
  toAdminUser,
  toAdminDestination,
  toAdminTrip,
}
