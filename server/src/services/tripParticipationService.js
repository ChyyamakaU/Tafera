'use strict'

const { Op } = require('sequelize')
const { createPagination } = require('../utils/pagination')
const { PUBLIC_PROFILE_FIELDS } = require('../utils/safeUser')
const {
  toTripParticipant,
} = require('../utils/safeTripParticipant')
const {
  TripFullError,
  TripNotFoundError,
  TripNotJoinableError,
  TripOwnerCannotJoinError,
  TripParticipationExistsError,
  TripParticipationNotFoundError,
  TripParticipationStateConflictError,
} = require('../utils/tripErrors')
const {
  createNotificationCreationService,
} = require('./notificationCreationService')

const createTripParticipationService = ({
  Trip,
  TripParticipant,
  User,
  Notification,
  sequelize,
  notificationCreationService,
} = {}) => {
  const tripModel = Trip || require('../models').Trip
  const participantModel =
    TripParticipant || require('../models').TripParticipant
  const userModel = User || require('../models').User
  const database =
    sequelize || tripModel.sequelize || require('../models').sequelize
  const notifications =
    notificationCreationService ||
    createNotificationCreationService({
      Notification:
        Notification || require('../models').Notification,
    })

  const participantUserInclude = {
    model: userModel,
    as: 'participant',
    attributes: [...PUBLIC_PROFILE_FIELDS],
    required: false,
  }

  const findVisibleTrip = async (userId, tripId, options = {}) => {
    const trip = await tripModel.findOne({
      where: {
        id: tripId,
        [Op.or]: [
          { userId },
          { status: { [Op.ne]: 'draft' } },
        ],
      },
      ...options,
    })

    if (!trip) {
      throw new TripNotFoundError()
    }

    return trip
  }

  const findOwnedTrip = async (ownerId, tripId, options = {}) => {
    const trip = await tripModel.findOne({
      where: { id: tripId, userId: ownerId },
      ...options,
    })

    if (!trip) {
      throw new TripNotFoundError()
    }

    return trip
  }

  const findParticipantWithUser = (tripId, participantId) =>
    participantModel.findOne({
      where: { id: participantId, tripId },
      include: [participantUserInclude],
    })

  const assertJoinable = (trip, userId) => {
    if (trip.userId === userId) {
      throw new TripOwnerCannotJoinError()
    }

    if (trip.tripType !== 'group' || trip.status !== 'published') {
      throw new TripNotJoinableError()
    }
  }

  const isTripFull = async (trip, transaction) => {
    if (trip.maxParticipants === null || trip.maxParticipants === undefined) {
      return false
    }

    const approvedCount = await participantModel.count({
      where: { tripId: trip.id, status: 'approved' },
      transaction,
    })

    return Number(approvedCount) >= Number(trip.maxParticipants)
  }

  const requestJoin = async (userId, tripId) => {
    let participantId = null
    let created = false

    try {
      await database.transaction(async (transaction) => {
        const trip = await findVisibleTrip(userId, tripId, {
          transaction,
          lock: transaction.LOCK.UPDATE,
        })

        assertJoinable(trip, userId)

        const existing = await participantModel.findOne({
          where: { tripId, userId },
          transaction,
          lock: transaction.LOCK.UPDATE,
        })

        if (
          existing &&
          (existing.status === 'pending' ||
            existing.status === 'approved')
        ) {
          throw new TripParticipationExistsError()
        }

        if (await isTripFull(trip, transaction)) {
          throw new TripFullError()
        }

        let reactivatedFromCancelled = false

        if (existing) {
          reactivatedFromCancelled = existing.status === 'cancelled'

          await participantModel.update(
            { status: 'pending', joinedAt: null },
            {
              where: { id: existing.id, tripId },
              transaction,
            },
          )
          participantId = existing.id
          created = false
        } else {
          const participant = await participantModel.create(
            {
              tripId,
              userId,
              status: 'pending',
              joinedAt: null,
            },
            { transaction },
          )
          participantId = participant.id
          created = true
        }

        // A new request, or a cancelled record reactivated to pending,
        // notifies the trip owner. A rejected record reactivated to pending
        // does not create a fresh notification. Duplicate pending/approved
        // requests and full trips throw before this point, so they never
        // notify.
        const shouldNotify = created || reactivatedFromCancelled

        if (shouldNotify) {
          const actor = await userModel.findByPk(userId, {
            attributes: ['id', 'fullName'],
          })

          await notifications.createNotification({
            recipientId: trip.userId,
            actorId: userId,
            type: 'trip_join_request',
            message: `${actor.fullName} requested to join your trip.`,
            referenceType: 'trip',
            referenceId: tripId,
            transaction,
          })
        }
      })
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        throw new TripParticipationExistsError()
      }

      throw error
    }

    const participation = await findParticipantWithUser(
      tripId,
      participantId,
    )

    return {
      participation: toTripParticipant(participation),
      created,
    }
  }

  const leaveTrip = async (userId, tripId) => {
    let participantId = null

    await database.transaction(async (transaction) => {
      const trip = await tripModel.findOne({
        where: { id: tripId },
        transaction,
      })

      if (!trip) {
        throw new TripNotFoundError()
      }

      if (trip.userId === userId) {
        throw new TripOwnerCannotJoinError()
      }

      const participant = await participantModel.findOne({
        where: { tripId, userId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      })

      if (!participant) {
        throw new TripParticipationNotFoundError()
      }

      if (
        participant.status === 'rejected' ||
        participant.status === 'cancelled'
      ) {
        throw new TripParticipationStateConflictError()
      }

      await participantModel.update(
        { status: 'cancelled', joinedAt: null },
        {
          where: { id: participant.id, tripId },
          transaction,
        },
      )
      participantId = participant.id
    })

    const participation = await findParticipantWithUser(
      tripId,
      participantId,
    )

    return toTripParticipant(participation)
  }

  const getOwnParticipation = async (userId, tripId) => {
    await findVisibleTrip(userId, tripId)

    const participant = await participantModel.findOne({
      where: { tripId, userId },
      include: [participantUserInclude],
    })

    return participant ? toTripParticipant(participant) : null
  }

  const listParticipants = async (ownerId, tripId, filters) => {
    await findOwnedTrip(ownerId, tripId)

    const where = { tripId }

    if (filters.status) {
      where.status = filters.status
    }

    const { count, rows } = await participantModel.findAndCountAll({
      where,
      include: [participantUserInclude],
      order: [
        ['createdAt', 'ASC'],
        ['id', 'ASC'],
      ],
      limit: filters.limit,
      offset: (filters.page - 1) * filters.limit,
      distinct: true,
    })

    return {
      participants: rows.map(toTripParticipant),
      pagination: createPagination({
        page: filters.page,
        limit: filters.limit,
        total: count,
      }),
    }
  }

  const canModerate = (currentStatus, targetStatus) => {
    if (currentStatus === 'pending') {
      return (
        targetStatus === 'approved' ||
        targetStatus === 'rejected' ||
        targetStatus === 'cancelled'
      )
    }

    if (currentStatus === 'approved') {
      return targetStatus === 'cancelled'
    }

    return false
  }

  const moderateParticipant = async (
    ownerId,
    tripId,
    participantId,
    input,
  ) => {
    await database.transaction(async (transaction) => {
      const trip = await findOwnedTrip(ownerId, tripId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      })

      const participant = await participantModel.findOne({
        where: { id: participantId, tripId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      })

      if (!participant) {
        throw new TripParticipationNotFoundError()
      }

      if (!canModerate(participant.status, input.status)) {
        throw new TripParticipationStateConflictError()
      }

      let joinedAt = null

      if (input.status === 'approved') {
        // The trip row lock serializes approvals for this trip, and the count
        // is repeated inside the transaction so concurrent approvals cannot
        // exceed the current capacity.
        if (await isTripFull(trip, transaction)) {
          throw new TripFullError()
        }

        joinedAt = new Date()
      }

      await participantModel.update(
        { status: input.status, joinedAt },
        {
          where: { id: participantId, tripId },
          transaction,
        },
      )

      // Only pending -> approved/rejected transitions notify the participant.
      // Cancellations and other transitions do not create notifications.
      if (
        participant.status === 'pending' &&
        (input.status === 'approved' || input.status === 'rejected')
      ) {
        const actor = await userModel.findByPk(ownerId, {
          attributes: ['id', 'fullName'],
        })

        const isApproved = input.status === 'approved'
        await notifications.createNotification({
          recipientId: participant.userId,
          actorId: ownerId,
          type: isApproved ? 'trip_join_approved' : 'trip_join_rejected',
          message: isApproved
            ? 'The trip owner approved your request to join.'
            : 'The trip owner rejected your request to join.',
          referenceType: 'trip',
          referenceId: tripId,
          transaction,
        })
      }
    })

    const participation = await findParticipantWithUser(
      tripId,
      participantId,
    )

    return toTripParticipant(participation)
  }

  return {
    getOwnParticipation,
    leaveTrip,
    listParticipants,
    moderateParticipant,
    requestJoin,
  }
}

const tripParticipationService = createTripParticipationService()

module.exports = {
  createTripParticipationService,
  tripParticipationService,
}
