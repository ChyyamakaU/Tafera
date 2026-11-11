'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createPagination } = require('../src/utils/pagination')
const {
  createPagination: tripCreatePagination,
} = require('../src/services/tripService')

test('pagination computes empty and non-empty page metadata', () => {
  assert.deepEqual(createPagination({ page: 1, limit: 20, total: 0 }), {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  })

  assert.deepEqual(createPagination({ page: 1, limit: 20, total: 40 }), {
    page: 1,
    limit: 20,
    total: 40,
    totalPages: 2,
    hasNextPage: true,
    hasPreviousPage: false,
  })

  assert.deepEqual(createPagination({ page: 2, limit: 20, total: 40 }), {
    page: 2,
    limit: 20,
    total: 40,
    totalPages: 2,
    hasNextPage: false,
    hasPreviousPage: true,
  })
})

test('pagination normalizes totals and handles partial pages', () => {
  assert.deepEqual(createPagination({ page: 1, limit: 10, total: '11' }), {
    page: 1,
    limit: 10,
    total: 11,
    totalPages: 2,
    hasNextPage: true,
    hasPreviousPage: false,
  })

  assert.deepEqual(createPagination({ page: 2, limit: 10, total: 11 }), {
    page: 2,
    limit: 10,
    total: 11,
    totalPages: 2,
    hasNextPage: false,
    hasPreviousPage: true,
  })

  assert.deepEqual(createPagination({ page: 1, limit: 10, total: null }), {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  })
})

test('pagination hasPreviousPage requires a non-empty result', () => {
  assert.deepEqual(createPagination({ page: 2, limit: 10, total: 0 }), {
    page: 2,
    limit: 10,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
  })
})

test('tripService keeps its existing createPagination export', () => {
  assert.equal(tripCreatePagination, createPagination)
})
