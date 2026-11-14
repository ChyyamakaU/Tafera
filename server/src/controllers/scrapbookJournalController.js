'use strict'

const {
  parseCreateScrapbookJournal,
  parseUpdateScrapbookJournal,
  parseSetJournalVisibility,
  parseLinkTrip,
  parseJournalId,
} = require('../validators/scrapbook')

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next)
}

const noStore = (res) => res.set('Cache-Control', 'no-store')

const createScrapbookJournalController = ({ scrapbookJournalService }) => {
  const create = asyncHandler(async (req, res) => {
    const input = parseCreateScrapbookJournal(req.body || {})
    const userId = req.auth.userId

    const journal = await scrapbookJournalService.createScrapbookJournal(
      userId,
      input,
    )

    noStore(res).status(201).json({
      data: { journal },
    })
  })

  const list = asyncHandler(async (req, res) => {
    const userId = req.auth.userId
    const { page, limit, isPublic } = req.query || {}

    const journals = await scrapbookJournalService.listScrapbookJournals(
      userId,
      { page, limit, isPublic },
    )

    noStore(res).status(200).json({
      data: journals,
    })
  })

  const get = asyncHandler(async (req, res) => {
    const { journalId } = parseJournalId(req.params)
    const userId = req.auth.userId

    const journal = await scrapbookJournalService.getScrapbookJournal(
      userId,
      journalId,
    )

    noStore(res).status(200).json({
      data: { journal },
    })
  })

  const update = asyncHandler(async (req, res) => {
    const { journalId } = parseJournalId(req.params)
    const input = parseUpdateScrapbookJournal(req.body || {})
    const userId = req.auth.userId

    const journal = await scrapbookJournalService.updateScrapbookJournal(
      userId,
      journalId,
      input,
    )

    noStore(res).status(200).json({
      data: { journal },
    })
  })

  const setVisibility = asyncHandler(async (req, res) => {
    const { journalId } = parseJournalId(req.params)
    const input = parseSetJournalVisibility(req.body || {})
    const userId = req.auth.userId

    const journal = await scrapbookJournalService.setJournalVisibility(
      userId,
      journalId,
      input.isPublic,
    )

    noStore(res).status(200).json({
      data: { journal },
    })
  })

  const linkTrip = asyncHandler(async (req, res) => {
    const { journalId } = parseJournalId(req.params)
    const input = parseLinkTrip(req.body || {})
    const userId = req.auth.userId

    const journal = await scrapbookJournalService.linkTrip(
      userId,
      journalId,
      input.tripId,
    )

    noStore(res).status(200).json({
      data: { journal },
    })
  })

  const unlinkTrip = asyncHandler(async (req, res) => {
    const { journalId } = parseJournalId(req.params)
    const userId = req.auth.userId

    const journal = await scrapbookJournalService.unlinkTrip(
      userId,
      journalId,
    )

    noStore(res).status(200).json({
      data: { journal },
    })
  })

  const remove = asyncHandler(async (req, res) => {
    const { journalId } = parseJournalId(req.params)
    const userId = req.auth.userId

    await scrapbookJournalService.deleteScrapbookJournal(userId, journalId)

    noStore(res).status(204).end()
  })

  return {
    create,
    list,
    get,
    update,
    setVisibility,
    linkTrip,
    unlinkTrip,
    delete: remove,
  }
}

module.exports = { createScrapbookJournalController }
