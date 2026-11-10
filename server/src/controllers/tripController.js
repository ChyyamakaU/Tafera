'use strict'

const {
  parseCreateStop,
  parseCreateTrip,
  parseReorderStops,
  parseStopId,
  parseTripId,
  parseTripListQuery,
  parseUpdateStop,
  parseUpdateTrip,
} = require('../validators/trip')

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next)
}

const noStore = (res) => res.set('Cache-Control', 'no-store')

const createTripController = ({ tripService }) => ({
  create: asyncHandler(async (req, res) => {
    const input = parseCreateTrip(req.body)
    const trip = await tripService.createTrip(req.auth.userId, input)

    noStore(res).status(201).json({
      data: { trip },
    })
  }),

  list: asyncHandler(async (req, res) => {
    const filters = parseTripListQuery(req.query)
    const { trips, pagination } = await tripService.listTrips(
      req.auth.userId,
      filters,
    )

    noStore(res).status(200).json({
      data: { trips, pagination },
    })
  }),

  detail: asyncHandler(async (req, res) => {
    const { tripId } = parseTripId(req.params)
    const viewerUserId = req.auth ? req.auth.userId : null
    const trip = await tripService.getTrip(tripId, viewerUserId)

    noStore(res).status(200).json({
      data: { trip },
    })
  }),

  update: asyncHandler(async (req, res) => {
    const { tripId } = parseTripId(req.params)
    const input = parseUpdateTrip(req.body)
    const trip = await tripService.updateTrip(
      req.auth.userId,
      tripId,
      input,
    )

    noStore(res).status(200).json({
      data: { trip },
    })
  }),

  remove: asyncHandler(async (req, res) => {
    const { tripId } = parseTripId(req.params)
    await tripService.deleteTrip(req.auth.userId, tripId)

    noStore(res).status(204).end()
  }),

  addStop: asyncHandler(async (req, res) => {
    const { tripId } = parseTripId(req.params)
    const input = parseCreateStop(req.body)
    const trip = await tripService.addStop(
      req.auth.userId,
      tripId,
      input,
    )

    noStore(res).status(201).json({
      data: { trip },
    })
  }),

  updateStop: asyncHandler(async (req, res) => {
    const { tripId, stopId } = parseStopId(req.params)
    const input = parseUpdateStop(req.body)
    const trip = await tripService.updateStop(
      req.auth.userId,
      tripId,
      stopId,
      input,
    )

    noStore(res).status(200).json({
      data: { trip },
    })
  }),

  removeStop: asyncHandler(async (req, res) => {
    const { tripId, stopId } = parseStopId(req.params)
    const trip = await tripService.deleteStop(
      req.auth.userId,
      tripId,
      stopId,
    )

    noStore(res).status(200).json({
      data: { trip },
    })
  }),

  reorderStops: asyncHandler(async (req, res) => {
    const { tripId } = parseTripId(req.params)
    const input = parseReorderStops(req.body)
    const trip = await tripService.reorderStops(
      req.auth.userId,
      tripId,
      input,
    )

    noStore(res).status(200).json({
      data: { trip },
    })
  }),
})

module.exports = { createTripController }
