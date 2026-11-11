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

const createTripParticipationService = ({
  Trip,
  TripParticipant,
  User,
  sequelize,
} = {}) => {
  const tripModel = Trip || require('../models').Trip
  const participantModel =
    TripParticipant || require('../models').TripParticipant
  const userModel = User || require('../models').User
  const database = sequelize || require('../models').sequelize

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

        if (existing) {
          await participantModel.update(
            { status: 'pending', joinedAt: null },
            {
              where: { id: existing.id, tripId },
              transaction,
            },
          )
          participantId = existing.id
          created = false
          return
        }

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
