'use strict'

const createPagination = ({ page, limit, total }) => {
  const normalizedTotal = Number(total) || 0
  const totalPages =
    normalizedTotal === 0 ? 0 : Math.ceil(normalizedTotal / limit)

  return {
    page,
    limit,
    total: normalizedTotal,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1 && normalizedTotal > 0,
  }
}

module.exports = { createPagination }
