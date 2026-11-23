'use strict'

const { Op } = require('sequelize')
const { ValidationError } = require('../utils/authErrors')
const {
  DestinationNotFoundError,
} = require('../utils/destinationErrors')
const {
  PUBLIC_DESTINATION_FIELDS,
} = require('../utils/safeDestination')
const { createPagination } = require('../utils/pagination')
const {
  PUBLIC_TRIP_FIELDS,
  toDateOnly,
  toTimeOnly,
  toTripDetail,
  toTripSummary,
} = require('../utils/safeTrip')
const {
  TripActivityNotFoundError,
  TripDatesConflictError,
  TripNotFoundError,
  TripParticipantLimitConflictError,
  TripParticipationStateConflictError,
  TripStopExistsError,
  TripStopNotFoundError,
  TripStopOrderConflictError,
} = require('../utils/tripErrors')

const validateStopDates = (trip, { arrivalDate, departureDate }) => {
  const startDate = toDateOnly(trip.startDate)
  const endDate = toDateOnly(trip.endDate)
  const issues = []

  if (
    arrivalDate &&
    (arrivalDate < startDate || arrivalDate > endDate)
  ) {
    issues.push({
      field: 'arrivalDate',
      message: `Arrival date must be between ${startDate} and ${endDate}.`,
    })
  }

  if (
    departureDate &&
    (departureDate < startDate || departureDate > endDate)
  ) {
    issues.push({
      field: 'departureDate',
      message: `Departure date must be between ${startDate} and ${endDate}.`,
    })
  }

  if (
    arrivalDate &&
    departureDate &&
    departureDate < arrivalDate
  ) {
    issues.push({
      field: 'departureDate',
      message: 'Departure date must be on or after the arrival date.',
    })
  }

  if (issues.length > 0) {
    throw new ValidationError(issues)
  }
}

const validateActivitySchedule = (trip, { activityDate, startTime, endTime }) => {
  const startDate = toDateOnly(trip.startDate)
  const endDate = toDateOnly(trip.endDate)
  const issues = []

  if (activityDate && (activityDate < startDate || activityDate > endDate)) {
    issues.push({
      field: 'activityDate',
      message: `Activity date must be between ${startDate} and ${endDate}.`,
    })
  }

  const normalizedStart = toTimeOnly(startTime)
  const normalizedEnd = toTimeOnly(endTime)
  if (normalizedStart && normalizedEnd && normalizedEnd <= normalizedStart) {
    issues.push({
      field: 'endTime',
      message: 'End time must be later than the start time.',
    })
  }

  if (issues.length > 0) {
    throw new ValidationError(issues)
  }
}

const createTripService = ({
  Trip,
  TripDestination,
  TripItinerary,
  TripParticipant,
  Destination,
  DestinationImage,
  sequelize,
} = {}) => {
  const tripModel = Trip || require('../models').Trip
  const stopModel =
    TripDestination || require('../models').TripDestination
  const activityModel =
    TripItinerary || (Trip ? null : require('../models').TripItinerary)
  const participantModel =
    TripParticipant || require('../models').TripParticipant
  const destinationModel =
    Destination || require('../models').Destination
  const imageModel =
    DestinationImage || require('../models').DestinationImage
  const database = sequelize || require('../models').sequelize

  const destinationImagesInclude = {
    model: imageModel,
    as: 'images',
    attributes: ['id', 'imageUrl', 'altText', 'displayOrder', 'isCover'],
    required: false,
    separate: true,
    order: [
      ['displayOrder', 'ASC'],
      ['id', 'ASC'],
    ],
  }

  const stopDestinationInclude = {
    model: destinationModel,
    as: 'destination',
    attributes: [...PUBLIC_DESTINATION_FIELDS],
    required: false,
    include: [destinationImagesInclude],
  }

  const tripStopsInclude = {
    model: stopModel,
    as: 'destinations',
    required: false,
    separate: true,
    order: [
      ['stopOrder', 'ASC'],
      ['id', 'ASC'],
    ],
    include: [stopDestinationInclude],
  }

  const tripActivitiesInclude =
    activityModel && (!Trip || tripModel.associations?.itineraries)
      ? {
          model: activityModel,
          as: 'itineraries',
          required: false,
          separate: true,
          order: [
            ['activityDate', 'ASC'],
            ['startTime', 'ASC'],
            ['createdAt', 'ASC'],
            ['id', 'ASC'],
          ],
        }
      : null

  const tripDetailIncludes = [
    tripStopsInclude,
    ...(tripActivitiesInclude ? [tripActivitiesInclude] : []),
  ]

  const findOwnedTrip = async (userId, tripId, options = {}) => {
    const trip = await tripModel.findOne({
      where: { id: tripId, userId },
      ...options,
    })

    if (!trip) {
      throw new TripNotFoundError()
    }

    return trip
  }

  const getOwnedTripDetail = async (userId, tripId) => {
    const trip = await tripModel.findOne({
      where: { id: tripId, userId },
      include: tripDetailIncludes,
    })

    if (!trip) {
      throw new TripNotFoundError()
    }

    return toTripDetail(trip, userId)
  }

  const assertDestinationAvailable = async (
    destinationId,
    transaction,
  ) => {
    // Draft destinations are treated as missing so trip stops cannot expose
    // unpublished destination content.
    const destination = await destinationModel.findOne({
      where: { id: destinationId, status: 'published' },
      attributes: ['id'],
      transaction,
    })

    if (!destination) {
      throw new DestinationNotFoundError()
    }
  }

  const listTrips = async (userId, filters) => {
    const where = { userId }

    if (filters.status) {
      where.status = filters.status
    }

    const { count, rows } = await tripModel.findAndCountAll({
      where,
      attributes: [...PUBLIC_TRIP_FIELDS],
      order: [
        ['startDate', 'DESC'],
        ['id', 'ASC'],
      ],
      limit: filters.limit,
      offset: (filters.page - 1) * filters.limit,
    })

    return {
      trips: rows.map(toTripSummary),
      pagination: createPagination({
        page: filters.page,
        limit: filters.limit,
        total: count,
      }),
    }
  }

  const listPublicTrips = async (viewerUserId, filters) => {
    const where = {
      status: 'published',
    }

    const { count, rows } = await tripModel.findAndCountAll({
      where,
      attributes: [...PUBLIC_TRIP_FIELDS],
      include: [
        {
          model: require('../models').User,
          as: 'creator',
          attributes: [
            'id',
            'fullName',
            'profileImage',
            'bio',
            'emailVerifiedAt',
          ],
        },
      ],
      order: [
        ['startDate', 'ASC'],
        ['id', 'ASC'],
      ],
      limit: filters.limit,
      offset: (filters.page - 1) * filters.limit,
    })

    const tripsWithParticipantCounts = await Promise.all(
      rows.map(async (trip) => {
        const plain = trip.get({ plain: true })
        const approvedCount = await participantModel.count({
          where: { tripId: plain.id, status: 'approved' },
        })
        const spotsRemaining =
          plain.maxParticipants !== null
            ? Math.max(0, Number(plain.maxParticipants) - approvedCount)
            : null

        return {
          ...toTripSummary(plain),
          creator: {
            id: plain.creator.id,
            fullName: plain.creator.fullName,
            profileImage: plain.creator.profileImage,
            bio: plain.creator.bio,
            emailVerified: plain.creator.emailVerifiedAt !== null,
          },
          spotsRemaining,
        }
      }),
    )

    return {
      trips: tripsWithParticipantCounts,
      pagination: createPagination({
        page: filters.page,
        limit: filters.limit,
        total: count,
      }),
    }
  }

  const getTrip = async (tripId, viewerUserId = null) => {
    const where = { id: tripId }

    if (viewerUserId) {
      where[Op.or] = [
        { userId: viewerUserId },
        { status: { [Op.ne]: 'draft' } },
      ]
    } else {
      where.status = { [Op.ne]: 'draft' }
    }

    const trip = await tripModel.findOne({
      where,
      include: tripDetailIncludes,
    })

    if (!trip) {
      throw new TripNotFoundError()
    }

    return toTripDetail(trip, viewerUserId)
  }

  const createTrip = async (userId, input) => {
    // userId is always taken from the authenticated session and placed after
    // the validated input so a future schema mistake cannot override it.
    const trip = await tripModel.create({
      ...input,
      userId,
    })

    return toTripDetail(trip)
  }

  const updateTrip = async (userId, tripId, input) => {
    await database.transaction(async (transaction) => {
      const trip = await findOwnedTrip(userId, tripId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      })

      const nextStartDate =
        input.startDate !== undefined
          ? input.startDate
          : toDateOnly(trip.startDate)
      const nextEndDate =
        input.endDate !== undefined
          ? input.endDate
          : toDateOnly(trip.endDate)

      if (nextEndDate < nextStartDate) {
        throw new ValidationError([
          {
            field: 'endDate',
            message: 'End date must be on or after the start date.',
          },
        ])
      }

      if (
        input.startDate !== undefined ||
        input.endDate !== undefined
      ) {
        const conflictingStop = await stopModel.findOne({
          where: {
            tripId,
            [Op.or]: [
              { arrivalDate: { [Op.lt]: nextStartDate } },
              { arrivalDate: { [Op.gt]: nextEndDate } },
              { departureDate: { [Op.lt]: nextStartDate } },
              { departureDate: { [Op.gt]: nextEndDate } },
            ],
          },
          transaction,
        })

        if (conflictingStop) {
          throw new TripDatesConflictError()
        }

        if (activityModel && typeof activityModel.findOne === 'function') {
          const conflictingActivity = await activityModel.findOne({
            where: {
              tripId,
              [Op.or]: [
                { activityDate: { [Op.lt]: nextStartDate } },
                { activityDate: { [Op.gt]: nextEndDate } },
              ],
            },
            transaction,
          })

          if (conflictingActivity) {
            throw new TripDatesConflictError()
          }
        }
      }

      // Capacity is defined by approved joiners only. The owner has no
      // participation row, so ownership never consumes a slot.
      if (
        input.maxParticipants !== undefined &&
        input.maxParticipants !== null
      ) {
        const approvedCount = await participantModel.count({
          where: { tripId, status: 'approved' },
          transaction,
        })

        if (Number(approvedCount) > Number(input.maxParticipants)) {
          throw new TripParticipantLimitConflictError()
        }
      }

      // Pending requests are active membership intent, so they also block a
      // group trip from becoming personal. Rejected and cancelled history does
      // not.
      if (
        input.tripType === 'personal' &&
        trip.tripType === 'group'
      ) {
        const activeCount = await participantModel.count({
          where: {
            tripId,
            status: { [Op.in]: ['pending', 'approved'] },
          },
          transaction,
        })

        if (Number(activeCount) > 0) {
          throw new TripParticipationStateConflictError()
        }
      }

      await tripModel.update(input, {
        where: { id: tripId, userId },
        transaction,
      })
    })

    return getOwnedTripDetail(userId, tripId)
  }

  const deleteTrip = async (userId, tripId) => {
    const deleted = await tripModel.destroy({
      where: { id: tripId, userId },
    })

    if (!deleted) {
      throw new TripNotFoundError()
    }
  }

  const addStop = async (userId, tripId, input) => {
    await database.transaction(async (transaction) => {
      const trip = await findOwnedTrip(userId, tripId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      })

      await assertDestinationAvailable(
        input.destinationId,
        transaction,
      )

      const existingStop = await stopModel.findOne({
        where: {
          tripId,
          destinationId: input.destinationId,
        },
        transaction,
      })

      if (existingStop) {
        throw new TripStopExistsError()
      }

      const arrivalDate = input.arrivalDate ?? null
      const departureDate = input.departureDate ?? null

      validateStopDates(trip, { arrivalDate, departureDate })

      // The trip row lock above serializes concurrent stop additions, so this
      // max+1 assignment cannot race into the unique (trip_id, stop_order)
      // constraint.
      const maxOrder = await stopModel.max('stopOrder', {
        where: { tripId },
        transaction,
      })
      const stopOrder = (Number(maxOrder) || 0) + 1

      await stopModel.create(
        {
          tripId,
          destinationId: input.destinationId,
          stopOrder,
          arrivalDate,
          departureDate,
        },
        { transaction },
      )
    })

    return getOwnedTripDetail(userId, tripId)
  }

  const updateStop = async (userId, tripId, stopId, input) => {
    await database.transaction(async (transaction) => {
      const trip = await findOwnedTrip(userId, tripId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      })

      const stop = await stopModel.findOne({
        where: { id: stopId, tripId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      })

      if (!stop) {
        throw new TripStopNotFoundError()
      }

      const nextArrivalDate =
        input.arrivalDate !== undefined
          ? input.arrivalDate
          : toDateOnly(stop.arrivalDate)
      const nextDepartureDate =
        input.departureDate !== undefined
          ? input.departureDate
          : toDateOnly(stop.departureDate)

      validateStopDates(trip, {
        arrivalDate: nextArrivalDate,
        departureDate: nextDepartureDate,
      })

      await stopModel.update(input, {
        where: { id: stopId, tripId },
        transaction,
      })
    })

    return getOwnedTripDetail(userId, tripId)
  }

  const deleteStop = async (userId, tripId, stopId) => {
    await database.transaction(async (transaction) => {
      await findOwnedTrip(userId, tripId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      })

      const stop = await stopModel.findOne({
        where: { id: stopId, tripId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      })

      if (!stop) {
        throw new TripStopNotFoundError()
      }

      await stopModel.destroy({
        where: { id: stopId, tripId },
        transaction,
      })

      // Keep orders contiguous after a removal. Updating in ascending order
      // is safe under the unique (trip_id, stop_order) constraint because
      // every target order has already been vacated.
      const remainingStops = await stopModel.findAll({
        where: { tripId },
        order: [
          ['stopOrder', 'ASC'],
          ['id', 'ASC'],
        ],
        transaction,
        lock: transaction.LOCK.UPDATE,
      })

      let expectedOrder = 1

      for (const remainingStop of remainingStops) {
        if (Number(remainingStop.stopOrder) !== expectedOrder) {
          await stopModel.update(
            { stopOrder: expectedOrder },
            {
              where: { id: remainingStop.id, tripId },
              transaction,
            },
          )
        }

        expectedOrder += 1
      }
    })

    return getOwnedTripDetail(userId, tripId)
  }

  const reorderStops = async (userId, tripId, input) => {
    await database.transaction(async (transaction) => {
      await findOwnedTrip(userId, tripId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      })

      const stops = await stopModel.findAll({
        where: { tripId },
        order: [
          ['stopOrder', 'ASC'],
          ['id', 'ASC'],
        ],
        transaction,
        lock: transaction.LOCK.UPDATE,
      })

      const currentIds = stops.map((stop) => stop.id)
      const requestedIds = input.stopIds
      const currentIdSet = new Set(currentIds)

      if (
        requestedIds.length !== currentIds.length ||
        new Set(requestedIds).size !== requestedIds.length
      ) {
        throw new TripStopOrderConflictError()
      }

      for (const requestedId of requestedIds) {
        if (!currentIdSet.has(requestedId)) {
          throw new TripStopOrderConflictError()
        }
      }

      if (currentIds.length === 0) return

      const currentMaxOrder = stops.reduce(
        (maximum, stop) =>
          Math.max(maximum, Number(stop.stopOrder) || 0),
        0,
      )

      // Move every row above the current maximum first. This avoids transient
      // collisions on the unique (trip_id, stop_order) constraint while the
      // final 1..n order is written.
      await stopModel.increment(
        { stopOrder: currentMaxOrder + 1 },
        {
          where: { tripId },
          transaction,
        },
      )

      for (let index = 0; index < requestedIds.length; index += 1) {
        await stopModel.update(
          { stopOrder: index + 1 },
          {
            where: { id: requestedIds[index], tripId },
            transaction,
          },
        )
      }
    })

    return getOwnedTripDetail(userId, tripId)
  }

  const assertTripStopBelongsToTrip = async (
    tripId,
    tripDestinationId,
    transaction,
  ) => {
    if (tripDestinationId === undefined || tripDestinationId === null) return

    const stop = await stopModel.findOne({
      where: { id: tripDestinationId, tripId },
      attributes: ['id'],
      transaction,
    })

    if (!stop) {
      throw new TripStopNotFoundError()
    }
  }

  const addActivity = async (userId, tripId, input) => {
    await database.transaction(async (transaction) => {
      const trip = await findOwnedTrip(userId, tripId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      })

      validateActivitySchedule(trip, {
        activityDate: input.activityDate,
        startTime: input.startTime ?? null,
        endTime: input.endTime ?? null,
      })

      await assertTripStopBelongsToTrip(
        tripId,
        input.tripDestinationId,
        transaction,
      )

      await activityModel.create(
        {
          tripId,
          tripDestinationId: input.tripDestinationId ?? null,
          title: input.title,
          description: input.description ?? null,
          activityDate: input.activityDate,
          startTime: input.startTime ?? null,
          endTime: input.endTime ?? null,
          location: input.location ?? null,
        },
        { transaction },
      )
    })

    return getOwnedTripDetail(userId, tripId)
  }

  const updateActivity = async (userId, tripId, activityId, input) => {
    await database.transaction(async (transaction) => {
      const trip = await findOwnedTrip(userId, tripId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      })

      const activity = await activityModel.findOne({
        where: { id: activityId, tripId },
        transaction,
        lock: transaction.LOCK.UPDATE,
      })

      if (!activity) {
        throw new TripActivityNotFoundError()
      }

      const nextActivityDate =
        input.activityDate !== undefined
          ? input.activityDate
          : toDateOnly(activity.activityDate)
      const nextStartTime =
        input.startTime !== undefined
          ? input.startTime
          : toTimeOnly(activity.startTime)
      const nextEndTime =
        input.endTime !== undefined
          ? input.endTime
          : toTimeOnly(activity.endTime)

      validateActivitySchedule(trip, {
        activityDate: nextActivityDate,
        startTime: nextStartTime,
        endTime: nextEndTime,
      })

      if (input.tripDestinationId !== undefined) {
        await assertTripStopBelongsToTrip(
          tripId,
          input.tripDestinationId,
          transaction,
        )
      }

      await activityModel.update(input, {
        where: { id: activityId, tripId },
        transaction,
      })
    })

    return getOwnedTripDetail(userId, tripId)
  }

  const deleteActivity = async (userId, tripId, activityId) => {
    await database.transaction(async (transaction) => {
      await findOwnedTrip(userId, tripId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      })

      const deleted = await activityModel.destroy({
        where: { id: activityId, tripId },
        transaction,
      })

      if (!deleted) {
        throw new TripActivityNotFoundError()
      }
    })

    return getOwnedTripDetail(userId, tripId)
  }

  return {
    addActivity,
    addStop,
    createTrip,
    deleteActivity,
    deleteStop,
    deleteTrip,
    getTrip,
    listTrips,
    listPublicTrips,
    reorderStops,
    updateActivity,
    updateStop,
    updateTrip,
  }
}

const tripService = createTripService()

module.exports = {
  createTripService,
  createPagination,
  tripService,
  validateActivitySchedule,
  validateStopDates,
}
