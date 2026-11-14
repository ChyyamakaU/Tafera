'use strict'

const {
  parseCreateScrapbookImage,
  parseImageId,
  parseJournalId,
  parseReorderScrapbookImages,
  parseUpdateScrapbookImage,
} = require('../validators/scrapbook')

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next)
}

const noStore = (res) => res.set('Cache-Control', 'no-store')

const createScrapbookImageController = ({ scrapbookImageService }) => {
  const upload = asyncHandler(async (req, res) => {
    const { journalId } = parseJournalId(req.params)
    const input = parseCreateScrapbookImage(req.body || {})
    const userId = req.auth.userId

    const image = await scrapbookImageService.addScrapbookImage(
      userId,
      journalId,
      req.file,
      input,
    )

    noStore(res).status(201).json({
      data: { image },
    })
  })

  const list = asyncHandler(async (req, res) => {
    const { journalId } = parseJournalId(req.params)
    const userId = req.auth.userId

    const images = await scrapbookImageService.listScrapbookImages(
      userId,
      journalId,
    )

    noStore(res).status(200).json({
      data: { images },
    })
  })

  const update = asyncHandler(async (req, res) => {
    const { imageId } = parseImageId(req.params)
    const input = parseUpdateScrapbookImage(req.body || {})
    const userId = req.auth.userId

    const image = await scrapbookImageService.updateScrapbookImage(
      userId,
      imageId,
      input,
    )

    noStore(res).status(200).json({
      data: { image },
    })
  })

  const remove = asyncHandler(async (req, res) => {
    const { imageId } = parseImageId(req.params)
    const userId = req.auth.userId

    await scrapbookImageService.deleteScrapbookImage(userId, imageId)

    noStore(res).status(204).end()
  })

  const reorder = asyncHandler(async (req, res) => {
    const { journalId } = parseJournalId(req.params)
    const imageIds = parseReorderScrapbookImages(req.body)
    const userId = req.auth.userId

    const images = await scrapbookImageService.reorderScrapbookImages(
      userId,
      journalId,
      imageIds,
    )

    noStore(res).status(200).json({
      data: { images },
    })
  })

  return {
    upload,
    list,
    update,
    delete: remove,
    reorder,
  }
}

module.exports = { createScrapbookImageController }
