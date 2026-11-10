'use strict'

const {
  tripParticipationService: defaultTripParticipationService,
} = require('../services/tripParticipationService')
const {
  parseJoinTrip,
  parseParticipantId,
  parseParticipantListQuery,
  parseParticipantModeration,
  parseTripId,
} = require('../validators/tripParticipant')

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next)
}

const noStore = (res) => res.set('Cache-Control', 'no-store')

const createTripParticipationController = ({
  tripParticipationService = defaultTripParticipationService,
} = {}) => ({
  requestJoin: asyncHandler(async (req, res) => {
    const { tripId } = parseTripId(req.params)
    // The join body is intentionally empty; parsing strips any protected
    // fields before the service sees the request.
    parseJoinTrip(req.body)

    const { participation, created } =
      await tripParticipationService.requestJoin(
        req.auth.userId,
        tripId,
      )

    noStore(res)
      .status(created ? 201 : 200)
      .json({ data: { participation } })
  }),

  leaveTrip: asyncHandler(async (req, res) => {
    const { tripId } = parseTripId(req.params)
    const participation = await tripParticipationService.leaveTrip(
      req.auth.userId,
      tripId,
    )

    noStore(res).status(200).json({ data: { participation } })
  }),

  getOwnParticipation: asyncHandler(async (req, res) => {
    const { tripId } = parseTripId(req.params)
    const participation =
      await tripParticipationService.getOwnParticipation(
        req.auth.userId,
        tripId,
      )

    noStore(res).status(200).json({ data: { participation } })
  }),

  listParticipants: asyncHandler(async (req, res) => {
    const { tripId } = parseTripId(req.params)
    const filters = parseParticipantListQuery(req.query)
    const { participants, pagination } =
      await tripParticipationService.listParticipants(
        req.auth.userId,
        tripId,
        filters,
      )

    noStore(res).status(200).json({
      data: { participants, pagination },
    })
  }),

  moderateParticipant: asyncHandler(async (req, res) => {
    const { tripId, participantId } = parseParticipantId(req.params)
    const input = parseParticipantModeration(req.body)
    const participation =
      await tripParticipationService.moderateParticipant(
        req.auth.userId,
        tripId,
        participantId,
        input,
      )

    noStore(res).status(200).json({ data: { participation } })
  }),
})

module.exports = { createTripParticipationController }
