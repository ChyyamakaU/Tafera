'use strict'

const { Op } = require('sequelize')
const { DestinationNotFoundError } = require('../utils/destinationErrors')
const {
  PUBLIC_DESTINATION_FIELDS,
  toDestinationDetail,
  toDestinationSummary,
} = require('../utils/safeDestination')

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SORT_COLUMNS = Object.freeze({
  featured: 'featured',
  name: 'name',
  country: 'country',
  createdAt: 'createdAt',
})

const DEFAULT_ORDER = Object.freeze({
  featured: 'desc',
  name: 'asc',
  country: 'asc',
  createdAt: 'desc',
})

const isUuid = (value) =>
  typeof value === 'string' && UUID_PATTERN.test(value)

// Postgres LIKE patterns treat backslash, percent and underscore specially.
// Escape them so user input is matched literally instead of acting as a
// wildcard or escape sequence.
const escapeLikePattern = (value) => value.replace(/[\\%_]/g, '\\$&')

const buildWhere = ({ q, country, state, featured }) => {
  const where = { status: 'published' }

  if (country) {
    where.country = { [Op.iLike]: escapeLikePattern(country) }
  }

  if (state) {
    where.state = { [Op.iLike]: escapeLikePattern(state) }
  }

  if (featured !== undefined) {
    where.featured = featured
  }

  if (q) {
    const pattern = `%${escapeLikePattern(q)}%`

    where[Op.or] = [
      'name',
      'slug',
      'country',
      'state',
      'location',
      'description',
    ].map((field) => ({ [field]: { [Op.iLike]: pattern } }))
  }

  return where
}

const buildOrder = ({ sort, order }) => {
  const direction = (order || DEFAULT_ORDER[sort]).toUpperCase()
  const clauses = [[SORT_COLUMNS[sort], direction]]

  // Featured destinations should still read alphabetically within each group.
  if (sort === 'featured') {
    clauses.push(['name', 'ASC'])
  }

  // A stable final key prevents rows from moving between pages when several
  // destinations share the same sort value.
  clauses.push(['id', 'ASC'])

  return clauses
}

const createDestinationService = ({ Destination, DestinationImage } = {}) => {
  const destinationModel = Destination || require('../models').Destination
  const imageModel =
    DestinationImage || require('../models').DestinationImage

  const imageInclude = {
    model: imageModel,
    as: 'images',
    attributes: [
      'id',
      'imageUrl',
      'altText',
      'displayOrder',
      'isCover',
    ],
    required: false,
    separate: true,
    order: [
      ['displayOrder', 'ASC'],
      ['id', 'ASC'],
    ],
  }

  const listDestinations = async (filters) => {
    const { count, rows } = await destinationModel.findAndCountAll({
      where: buildWhere(filters),
      attributes: [...PUBLIC_DESTINATION_FIELDS],
      include: [imageInclude],
      order: buildOrder(filters),
      limit: filters.limit,
      offset: (filters.page - 1) * filters.limit,
      distinct: true,
    })

    const total = Number(count) || 0
    const totalPages =
      total === 0 ? 0 : Math.ceil(total / filters.limit)

    return {
      destinations: rows.map(toDestinationSummary),
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages,
        hasNextPage: filters.page < totalPages,
        hasPreviousPage: filters.page > 1 && total > 0,
      },
    }
  }

  const getDestination = async (identifier) => {
    const where = { status: 'published' }

    if (isUuid(identifier)) {
      where[Op.or] = [
        { id: identifier },
        { slug: identifier },
      ]
    } else {
      where.slug = identifier
    }

    const destination = await destinationModel.findOne({
      where,
      attributes: [...PUBLIC_DESTINATION_FIELDS],
      include: [imageInclude],
    })

    if (!destination) {
      throw new DestinationNotFoundError()
    }

    return toDestinationDetail(destination)
  }

  return {
    getDestination,
    listDestinations,
  }
}

const destinationService = createDestinationService()

module.exports = {
  createDestinationService,
  destinationService,
}
