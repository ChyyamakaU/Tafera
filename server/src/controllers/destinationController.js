'use strict'

const {
  parseDestinationIdentifier,
  parseDestinationListQuery,
} = require('../validators/destination')

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next)
}

const noStore = (res) => res.set('Cache-Control', 'no-store')

const createDestinationController = ({ destinationService }) => ({
  list: asyncHandler(async (req, res) => {
    const filters = parseDestinationListQuery(req.query)
    const { destinations, pagination } =
      await destinationService.listDestinations(filters)

    noStore(res).status(200).json({
      data: { destinations, pagination },
    })
  }),

  detail: asyncHandler(async (req, res) => {
    const { idOrSlug } = parseDestinationIdentifier(req.params)
    const destination =
      await destinationService.getDestination(idOrSlug)

    noStore(res).status(200).json({
      data: { destination },
    })
  }),
})

module.exports = { createDestinationController }
