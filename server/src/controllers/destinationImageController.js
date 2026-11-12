'use strict'

const {
  parseCreateImage,
  parseDestinationId,
  parseImageId,
  parseReorderImages,
  parseUpdateImage,
} = require('../validators/destination')

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next)
}

const noStore = (res) => res.set('Cache-Control', 'no-store')

const createDestinationImageController = ({ destinationImageService }) => {
  const upload = asyncHandler(async (req, res) => {
    const { destinationId } = parseDestinationId(req.params)
    const input = parseCreateImage(req.body || {})

    const image = await destinationImageService.uploadDestinationImage(
      destinationId,
      req.file,
      input,
    )

    noStore(res).status(201).json({
      data: { image },
    })
  })

  const list = asyncHandler(async (req, res) => {
    const { destinationId } = parseDestinationId(req.params)

    const images =
      await destinationImageService.listDestinationImages(destinationId)

    noStore(res).status(200).json({
      data: { images },
    })
  })

  const update = asyncHandler(async (req, res) => {
    const { imageId } = parseImageId(req.params)
    const input = parseUpdateImage(req.body || {})

    const image = await destinationImageService.updateDestinationImage(
      imageId,
      input,
    )

    noStore(res).status(200).json({
      data: { image },
    })
  })

  const remove = asyncHandler(async (req, res) => {
    const { imageId } = parseImageId(req.params)

    await destinationImageService.deleteDestinationImage(imageId)

    noStore(res).status(204).end()
  })

  const reorder = asyncHandler(async (req, res) => {
    const { destinationId } = parseDestinationId(req.params)
    const imageIds = parseReorderImages(req.body)

    const images = await destinationImageService.reorderDestinationImages(
      destinationId,
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

module.exports = { createDestinationImageController }
