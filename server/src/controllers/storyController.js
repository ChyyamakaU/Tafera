'use strict'

const {
  parseCreateStory,
  parseReorderStories,
  parseStoryCoverMeta,
  parseStoryId,
  parseStoryListQuery,
  parseUpdateStory,
} = require('../validators/story')

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next)
}

const noStore = (res) => res.set('Cache-Control', 'no-store')

const createStoryController = ({ storyService }) => ({
  listFeatured: asyncHandler(async (req, res) => {
    const filters = parseStoryListQuery(req.query)
    const stories = await storyService.listFeaturedStories(filters)

    noStore(res).status(200).json({
      data: { stories },
    })
  }),

  listAdmin: asyncHandler(async (_req, res) => {
    const stories = await storyService.listAllStories()

    noStore(res).status(200).json({
      data: { stories },
    })
  }),

  create: asyncHandler(async (req, res) => {
    const input = parseCreateStory(req.body)
    const story = await storyService.createStory(req.auth.userId, input)

    noStore(res).status(201).json({
      data: { story },
    })
  }),

  update: asyncHandler(async (req, res) => {
    const { storyId } = parseStoryId(req.params)
    const input = parseUpdateStory(req.body)
    const story = await storyService.updateStory(storyId, input)

    noStore(res).status(200).json({
      data: { story },
    })
  }),

  uploadCover: asyncHandler(async (req, res) => {
    const { storyId } = parseStoryId(req.params)
    const { coverImageAlt } = parseStoryCoverMeta(req.body)
    const story = await storyService.uploadStoryCover(
      storyId,
      req.file,
      coverImageAlt,
    )

    noStore(res).status(200).json({
      data: { story },
    })
  }),

  remove: asyncHandler(async (req, res) => {
    const { storyId } = parseStoryId(req.params)
    await storyService.deleteStory(storyId)

    noStore(res).status(204).end()
  }),

  reorder: asyncHandler(async (req, res) => {
    const { storyIds } = parseReorderStories(req.body)
    const stories = await storyService.reorderStories(storyIds)

    noStore(res).status(200).json({
      data: { stories },
    })
  }),
})

module.exports = { createStoryController }
