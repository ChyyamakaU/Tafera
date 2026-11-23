'use strict'

const cloudinary = require('../config/cloudinary')
const {
  CloudinaryUploadError,
  DestinationNotFoundError,
} = require('../utils/destinationErrors')
const { PUBLIC_DESTINATION_FIELDS } = require('../utils/safeDestination')
const { toStory } = require('../utils/safeStory')
const { PUBLIC_PROFILE_FIELDS } = require('../utils/safeUser')
const { logSecurityEvent } = require('../utils/securityLog')
const {
  PostNotFoundError,
  ProfileNotFoundError,
} = require('../utils/socialErrors')
const {
  StoryNotFoundError,
  StoryOrderConflictError,
} = require('../utils/storyErrors')
const { uploadBuffer } = require('../utils/cloudinaryUpload')

const createStoryService = ({
  TravellerStory,
  User,
  Destination,
  DestinationImage,
  Post,
  sequelize,
} = {}) => {
  const storyModel = TravellerStory || require('../models').TravellerStory
  const userModel = User || require('../models').User
  const destinationModel = Destination || require('../models').Destination
  const destinationImageModel =
    DestinationImage || require('../models').DestinationImage
  const postModel = Post || require('../models').Post
  const database = sequelize || require('../models').sequelize

  const destinationImagesInclude = {
    model: destinationImageModel,
    as: 'images',
    attributes: ['id', 'imageUrl', 'altText', 'displayOrder', 'isCover'],
    required: false,
    separate: true,
    order: [
      ['displayOrder', 'ASC'],
      ['id', 'ASC'],
    ],
  }

  const destinationInclude = {
    model: destinationModel,
    as: 'destination',
    attributes: [...PUBLIC_DESTINATION_FIELDS, 'status'],
    required: false,
    include: [destinationImagesInclude],
  }

  const authorInclude = {
    model: userModel,
    as: 'author',
    attributes: [...PUBLIC_PROFILE_FIELDS, 'status'],
    required: false,
  }

  const storyIncludes = [authorInclude, destinationInclude]

  const storyOrder = [
    ['displayOrder', 'ASC'],
    ['createdAt', 'DESC'],
    ['id', 'DESC'],
  ]

  const assertReferencesValid = async ({ authorId, destinationId, postId }) => {
    if (destinationId !== undefined && destinationId !== null) {
      const destination = await destinationModel.findOne({
        where: { id: destinationId, status: 'published' },
        attributes: ['id'],
      })
      if (!destination) {
        throw new DestinationNotFoundError()
      }
    }

    if (authorId !== undefined && authorId !== null) {
      const author = await userModel.findOne({
        where: { id: authorId, status: 'active' },
        attributes: ['id'],
      })
      if (!author) {
        throw new ProfileNotFoundError()
      }
    }

    if (postId !== undefined && postId !== null) {
      const post = await postModel.findOne({
        where: { id: postId },
        attributes: ['id'],
      })
      if (!post) {
        throw new PostNotFoundError()
      }
    }
  }

  const destroyCloudinaryAsset = async (publicId, storyId) => {
    if (!publicId) return
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image' })
    } catch (error) {
      logSecurityEvent('story_cover_cleanup_failed', {
        error: error.message,
        storyId,
      })
    }
  }

  const getStoryDetail = async (storyId) => {
    const story = await storyModel.findOne({
      where: { id: storyId },
      include: storyIncludes,
    })

    if (!story) {
      throw new StoryNotFoundError()
    }

    return toStory(story)
  }

  const listFeaturedStories = async ({ limit = 6 } = {}) => {
    const rows = await storyModel.findAll({
      where: { isFeatured: true },
      include: storyIncludes,
      order: storyOrder,
      limit,
    })

    return rows.map(toStory).filter(Boolean)
  }

  const listAllStories = async () => {
    const rows = await storyModel.findAll({
      include: storyIncludes,
      order: storyOrder,
    })

    return rows.map(toStory).filter(Boolean)
  }

  const createStory = async (adminUserId, input) => {
    await assertReferencesValid(input)

    let displayOrder = input.displayOrder
    if (displayOrder === undefined) {
      const maxOrder = await storyModel.max('displayOrder')
      displayOrder = Number.isFinite(Number(maxOrder))
        ? Number(maxOrder) + 1
        : 0
    }

    const created = await storyModel.create({
      title: input.title,
      excerpt: input.excerpt,
      badgeLabel: input.badgeLabel || 'Traveller spotlight',
      authorName: input.authorName,
      authorId: input.authorId ?? null,
      destinationId: input.destinationId ?? null,
      postId: input.postId ?? null,
      coverImageUrl: input.coverImageUrl ?? null,
      coverImageAlt: input.coverImageAlt ?? null,
      isFeatured: input.isFeatured ?? true,
      displayOrder,
      createdBy: adminUserId,
    })

    return getStoryDetail(created.id)
  }

  const updateStory = async (storyId, input) => {
    const story = await storyModel.findOne({ where: { id: storyId } })
    if (!story) {
      throw new StoryNotFoundError()
    }

    await assertReferencesValid(input)

    const previousPublicId = story.coverImagePublicId
    const updates = { ...input }
    const replacingCoverUrl =
      input.coverImageUrl !== undefined &&
      input.coverImageUrl !== story.coverImageUrl

    if (replacingCoverUrl && previousPublicId) {
      updates.coverImagePublicId = null
    }

    await story.update(updates)

    if (replacingCoverUrl && previousPublicId) {
      await destroyCloudinaryAsset(previousPublicId, storyId)
    }

    return getStoryDetail(storyId)
  }

  const uploadStoryCover = async (storyId, file, coverImageAlt) => {
    const story = await storyModel.findOne({ where: { id: storyId } })
    if (!story) {
      throw new StoryNotFoundError()
    }

    let uploaded
    try {
      uploaded = await uploadBuffer(cloudinary, file.buffer, {
        resource_type: 'image',
        folder: 'tafera/stories',
      })
    } catch (error) {
      logSecurityEvent('story_cover_upload_failed', {
        error: error.message,
        storyId,
      })
      throw new CloudinaryUploadError()
    }

    const previousPublicId = story.coverImagePublicId

    try {
      const updates = {
        coverImageUrl: uploaded.secure_url,
        coverImagePublicId: uploaded.public_id,
      }
      if (coverImageAlt !== undefined) {
        updates.coverImageAlt = coverImageAlt
      }
      await story.update(updates)
    } catch (error) {
      await destroyCloudinaryAsset(uploaded.public_id, storyId)
      throw error
    }

    if (previousPublicId && previousPublicId !== uploaded.public_id) {
      await destroyCloudinaryAsset(previousPublicId, storyId)
    }

    return getStoryDetail(storyId)
  }

  const deleteStory = async (storyId) => {
    const story = await storyModel.findOne({ where: { id: storyId } })
    if (!story) {
      throw new StoryNotFoundError()
    }

    const publicId = story.coverImagePublicId
    await story.destroy()
    await destroyCloudinaryAsset(publicId, storyId)
  }

  const reorderStories = async (storyIds) => {
    await database.transaction(async (transaction) => {
      const existing = await storyModel.findAll({
        attributes: ['id'],
        transaction,
      })

      const existingIds = existing.map((item) => item.id)
      const existingSet = new Set(existingIds)

      if (
        storyIds.length !== existingIds.length ||
        new Set(storyIds).size !== storyIds.length
      ) {
        throw new StoryOrderConflictError()
      }

      for (const id of storyIds) {
        if (!existingSet.has(id)) {
          throw new StoryOrderConflictError()
        }
      }

      for (let index = 0; index < storyIds.length; index += 1) {
        await storyModel.update(
          { displayOrder: index },
          {
            where: { id: storyIds[index] },
            transaction,
          },
        )
      }
    })

    return listAllStories()
  }

  return {
    createStory,
    deleteStory,
    listAllStories,
    listFeaturedStories,
    reorderStories,
    updateStory,
    uploadStoryCover,
  }
}

const storyService = createStoryService()

module.exports = {
  createStoryService,
  storyService,
}
