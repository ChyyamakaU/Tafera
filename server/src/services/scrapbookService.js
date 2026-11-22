/* eslint-disable no-undef */
'use strict'

const https = require('node:https')
const { Op } = require('sequelize')
const cloudinary = require('../config/cloudinary')
const { logSecurityEvent } = require('../utils/securityLog')
const { ValidationError } = require('../utils/authErrors')
const {
  ScrapbookImageLimitExceededError,
  ScrapbookImageNotFoundError,
  ScrapbookImageUploadUnavailableError,
  ScrapbookNotFoundError,
} = require('../utils/scrapbookErrors')
const {
  CloudinaryDeleteError,
} = require('../utils/destinationErrors')
const {
  PUBLIC_SCRAPBOOK_FIELDS,
  PUBLIC_SCRAPBOOK_IMAGE_FIELDS,
  selectCoverImage,
  sortedScrapbookImages,
  toPlain,
  toPublicScrapbookImage,
  toPublicScrapbookJournalDetail,
  toPublicScrapbookJournalSummary,
} = require('../utils/safeScrapbook')
const { createPagination } = require('../utils/pagination')
const { uploadBuffer } = require('../utils/cloudinaryUpload')

const MAX_IMAGES_PER_JOURNAL = 50
// Match Cloudinary's known-good profile transport: this runtime cannot route
// IPv6, and Node's default address-family racing abandons IPv4 connections.
const scrapbookCloudinaryAgent = new https.Agent({ family: 4, keepAlive: true })

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const isUuid = (value) =>
  typeof value === 'string' && UUID_PATTERN.test(value)

const requireValidUuid = (value, field) => {
  if (!isUuid(value)) {
    throw new ValidationError([{ field, message: 'Invalid ID format.' }])
  }
}

const createScrapbookService = ({
  ScrapbookJournal,
  ScrapbookImage,
  Trip,
  cloudinaryService,
  sequelize,
} = {}) => {
  const journalModel =
    ScrapbookJournal || require('../models').ScrapbookJournal
  const imageModel =
    ScrapbookImage || require('../models').ScrapbookImage
  const tripModel = Trip || require('../models').Trip
  const cloudinaryServiceInstance =
    cloudinaryService || require('../config/cloudinary')
  const database =
    sequelize || journalModel.sequelize || require('../models').sequelize

  const imageInclude = {
    model: imageModel,
    as: 'images',
    attributes: [...PUBLIC_SCRAPBOOK_IMAGE_FIELDS],
    required: false,
    separate: true,
    order: [
      ['displayOrder', 'ASC'],
      ['id', 'ASC'],
    ],
  }

  const createScrapbookJournal = async (
    userId,
    { title, description, tripId, isPublic } = {},
  ) => {
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      throw new ValidationError([{
        field: 'title',
        message: 'Title is required.',
      }])
    }

    if (tripId !== undefined && tripId !== null) {
      requireValidUuid(tripId, 'tripId')
      const trip = await tripModel.findByPk(tripId)
      if (!trip) {
        throw new ScrapbookNotFoundError()
      }
      if (trip.userId !== userId) {
        throw new ScrapbookNotFoundError()
      }
    }

    const journal = await journalModel.create({
      userId,
      tripId: tripId || null,
      title: title.trim(),
      description: description || null,
      isPublic: isPublic === true,
    })

    return toPublicScrapbookJournalDetail(journal)
  }

  const listScrapbookJournals = async (userId, filters = {}) => {
    const page = Number(filters.page) || 1
    const limit = Number(filters.limit) || 20
    const offset = (page - 1) * limit

    const where = { userId }

    if (filters.isPublic !== undefined) {
      where.isPublic = filters.isPublic
    }

    const { count, rows } = await journalModel.findAndCountAll({
      where,
      attributes: [...PUBLIC_SCRAPBOOK_FIELDS],
      include: [
        {
          ...imageInclude,
          attributes: [...PUBLIC_SCRAPBOOK_IMAGE_FIELDS],
        },
      ],
      order: [
        ['createdAt', 'DESC'],
        ['id', 'ASC'],
      ],
      limit,
      offset,
      distinct: true,
    })

    const total = Number(count) || 0

    return {
      journals: rows.map((journal) => {
        const source = toPlain(journal)
        const imageCount = source.images ? source.images.length : 0
        return {
          ...toPublicScrapbookJournalSummary(journal),
          imageCount,
        }
      }),
      pagination: createPagination({ page, limit, total }),
    }
  }

  const getScrapbookJournal = async (userId, journalId) => {
    requireValidUuid(journalId, 'journalId')

    // Find the journal. For private journals, only the owner can see them.
    // For public journals, anyone can see them.
    const journal = await journalModel.findOne({
      where: {
        id: journalId,
        [Op.or]: [
          { userId },
          { isPublic: true },
        ],
      },
      include: [imageInclude],
    })

    if (!journal) {
      throw new ScrapbookNotFoundError()
    }

    // If the journal is private and the user is not the owner, reject.
    if (journal.isPublic !== true && journal.userId !== userId) {
      throw new ScrapbookNotFoundError()
    }

    return toPublicScrapbookJournalDetail(journal)
  }

  const updateScrapbookJournal = async (
    userId,
    journalId,
    { title, description } = {},
  ) => {
    requireValidUuid(journalId, 'journalId')

    const journal = await journalModel.findOne({
      where: {
        id: journalId,
        userId,
      },
    })

    if (!journal) {
      throw new ScrapbookNotFoundError()
    }

    const updates = {}
    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length === 0) {
        throw new ValidationError([{
          field: 'title',
          message: 'Title is required.',
        }])
      }
      updates.title = title.trim()
    }
    if (description !== undefined) updates.description = description || null

    if (Object.keys(updates).length === 0) {
      return toPublicScrapbookJournalDetail(journal)
    }

    await journal.update(updates)

    return toPublicScrapbookJournalDetail(
      await journalModel.findOne({
        where: { id: journalId },
        include: [imageInclude],
      }),
    )
  }

  const linkTrip = async (userId, journalId, tripId) => {
    requireValidUuid(journalId, 'journalId')
    requireValidUuid(tripId, 'tripId')

    const journal = await journalModel.findOne({
      where: {
        id: journalId,
        userId,
      },
    })

    if (!journal) {
      throw new ScrapbookNotFoundError()
    }

    const trip = await tripModel.findByPk(tripId)
    if (!trip) {
      throw new ScrapbookNotFoundError()
    }

    if (trip.userId !== userId) {
      throw new ScrapbookNotFoundError()
    }

    await journal.update({ tripId })

    return toPublicScrapbookJournalDetail(
      await journalModel.findOne({
        where: { id: journalId },
        include: [imageInclude],
      }),
    )
  }

  const unlinkTrip = async (userId, journalId) => {
    requireValidUuid(journalId, 'journalId')

    const journal = await journalModel.findOne({
      where: {
        id: journalId,
        userId,
      },
    })

    if (!journal) {
      throw new ScrapbookNotFoundError()
    }

    await journal.update({ tripId: null })

    return toPublicScrapbookJournalDetail(
      await journalModel.findOne({
        where: { id: journalId },
        include: [imageInclude],
      }),
    )
  }

  const setJournalVisibility = async (userId, journalId, isPublic) => {
    requireValidUuid(journalId, 'journalId')

    const journal = await journalModel.findOne({
      where: {
        id: journalId,
        userId,
      },
    })

    if (!journal) {
      throw new ScrapbookNotFoundError()
    }

    await journal.update({ isPublic: isPublic === true })

    return toPublicScrapbookJournalDetail(
      await journalModel.findOne({
        where: { id: journalId },
        include: [imageInclude],
      }),
    )
  }

  const deleteScrapbookJournal = async (userId, journalId) => {
    requireValidUuid(journalId, 'journalId')

    const journal = await journalModel.findOne({
      where: {
        id: journalId,
        userId,
      },
      include: [imageInclude],
    })

    if (!journal) {
      throw new ScrapbookNotFoundError()
    }

    const images = journal.images || []

    await database.transaction(async (transaction) => {
      // Delete all images from Cloudinary first, then destroy DB records.
      for (const image of images) {
        try {
          const destroyResult = await cloudinaryServiceInstance.uploader.destroy(
            image.publicId,
          )

          if (
            destroyResult &&
            destroyResult.result === 'not found'
          ) {
            // Asset already gone; consider deletion successful.
          }
        } catch (deleteError) {
          logSecurityEvent('cloudinary_delete_failed', {
            error: deleteError.message,
            publicId: image.publicId,
          })
          throw new CloudinaryDeleteError()
        }
      }

      // Delete all image records.
      await imageModel.destroy({
        where: { journalId },
        transaction,
      })

      // Delete the journal.
      await journal.destroy({ transaction })
    })
  }

  const addScrapbookImage = async (
    userId,
    journalId,
    file,
    { altText, caption, takenAt, isCover } = {},
  ) => {
    // Verify journal exists and belongs to user.
    const journal = await journalModel.findOne({
      where: {
        id: journalId,
        userId,
      },
    })

    if (!journal) {
      throw new ScrapbookNotFoundError()
    }

    // Upload to Cloudinary before creating the database record.
    let uploadResult
    try {
      uploadResult = await uploadBuffer(
        cloudinaryServiceInstance,
        file.buffer,
        {
          resource_type: 'image',
          folder: 'tafera/scrapbooks',
          agent: scrapbookCloudinaryAgent,
        },
      )
    } catch (error) {
      logSecurityEvent('cloudinary_upload_failed', {
        providerCode: error.code || error.name || 'UNKNOWN',
        ...(Number.isInteger(error.http_code) ? { providerStatus: error.http_code } : {}),
        cloudinaryConfigured: Boolean(
          cloudinaryServiceInstance.config?.().cloud_name &&
          cloudinaryServiceInstance.config?.().api_key &&
          cloudinaryServiceInstance.config?.().api_secret,
        ),
        journalId,
      })
      throw new ScrapbookImageUploadUnavailableError()
    }

    let createdImage
    try {
      createdImage = await database.transaction(async (transaction) => {
        // Lock the journal row to serialize per-journal writes.
        await journalModel.findByPk(journalId, {
          lock: transaction.LOCK.UPDATE,
          transaction,
        })

        const existingCount = await imageModel.count({
          where: { journalId },
          transaction,
        })

        if (existingCount >= MAX_IMAGES_PER_JOURNAL) {
          // Compensation: delete the uploaded Cloudinary asset.
          try {
            await cloudinaryServiceInstance.uploader.destroy(
              uploadResult.public_id,
            )
          } catch (deleteError) {
            logSecurityEvent('cloudinary_cleanup_failed', {
              error: deleteError.message,
              publicId: uploadResult.public_id,
            })
          }
          throw new ScrapbookImageLimitExceededError()
        }

        // Determine cover status.
        const hasExistingCover = await imageModel.count({
          where: {
            journalId,
            isCover: true,
          },
          transaction,
        })

        const shouldBeCover =
          isCover === true ||
          (existingCount === 0 && hasExistingCover === 0)

        return imageModel.create({
          journalId,
          imageUrl: uploadResult.secure_url,
          publicId: uploadResult.public_id,
          altText: altText || null,
          caption: caption || null,
          takenAt: takenAt || null,
          isCover: shouldBeCover,
          displayOrder: existingCount + 1,
        }, { transaction })
      })
    } catch (error) {
      if (error instanceof ScrapbookImageLimitExceededError) {
        throw error
      }

      // Compensation: database create failed after Cloudinary upload
      // succeeded. Attempt to delete the uploaded Cloudinary asset.
      try {
        await cloudinaryServiceInstance.uploader.destroy(
          uploadResult.public_id,
        )
      } catch (deleteError) {
        logSecurityEvent('cloudinary_cleanup_failed', {
          error: deleteError.message,
          publicId: uploadResult.public_id,
        })
      }
      throw error
    }

    return toPublicScrapbookImage(createdImage)
  }

  const listScrapbookImages = async (userId, journalId) => {
    // Find the journal. For private journals, only the owner can list images.
    // For public journals, any authenticated user can list images.
    const journal = await journalModel.findOne({
      where: {
        id: journalId,
        [Op.or]: [
          { userId },
          { isPublic: true },
        ],
      },
    })

    if (!journal) {
      throw new ScrapbookNotFoundError()
    }

    // If the journal is private and the user is not the owner, reject.
    if (journal.isPublic !== true && journal.userId !== userId) {
      throw new ScrapbookNotFoundError()
    }

    const images = await imageModel.findAll({
      where: { journalId },
      order: [['displayOrder', 'ASC'], ['id', 'ASC']],
    })

    return images.map(toPublicScrapbookImage)
  }

  const updateScrapbookImage = async (
    userId,
    imageId,
    { altText, caption, takenAt, displayOrder, isCover } = {},
  ) => {
    const image = await imageModel.findOne({
      include: [
        {
          model: journalModel,
          as: 'journal',
          where: { userId },
        },
      ],
    })

    if (!image) {
      throw new ScrapbookImageNotFoundError()
    }

    const updates = {}
    if (altText !== undefined) updates.altText = altText
    if (caption !== undefined) updates.caption = caption
    if (takenAt !== undefined) updates.takenAt = takenAt
    if (displayOrder !== undefined) updates.displayOrder = displayOrder
    if (isCover !== undefined) updates.isCover = isCover

    if (Object.keys(updates).length === 0) {
      return toPublicScrapbookImage(image)
    }

    await journalModel.sequelize.transaction(async (transaction) => {
      // Lock the journal row to serialize cover changes.
      await journalModel.findByPk(image.journalId, {
        lock: transaction.LOCK.UPDATE,
        transaction,
      })

      const lockedImage = await imageModel.findByPk(imageId, {
        lock: transaction.LOCK.UPDATE,
        transaction,
      })

      if (!lockedImage) {
        throw new ScrapbookImageNotFoundError()
      }

      const wasAlreadyCover = lockedImage.isCover === true

      await lockedImage.update(updates, { transaction })

      // If setting as cover, unset cover on other images for the same journal.
      if (isCover === true && !wasAlreadyCover) {
        await imageModel.update(
          { isCover: false },
          {
            where: {
              journalId: lockedImage.journalId,
              id: { [Op.ne]: imageId },
              isCover: true,
            },
            transaction,
          },
        )
      }
    })

    return toPublicScrapbookImage(await imageModel.findByPk(imageId))
  }

  const deleteScrapbookImage = async (userId, imageId) => {
    const image = await imageModel.findOne({
      include: [
        {
          model: journalModel,
          as: 'journal',
          where: { userId },
        },
      ],
    })

    if (!image) {
      throw new ScrapbookImageNotFoundError()
    }

    const wasCover = image.isCover === true

    await journalModel.sequelize.transaction(async (transaction) => {
      // Lock the journal row to serialize cover promotion with deletion.
      await journalModel.findByPk(image.journalId, {
        lock: transaction.LOCK.UPDATE,
        transaction,
      })

      const lockedImage = await imageModel.findByPk(imageId, {
        lock: transaction.LOCK.UPDATE,
        transaction,
      })

      if (!lockedImage) {
        throw new ScrapbookImageNotFoundError()
      }

      const wasCoverNow = lockedImage.isCover === true

      // Attempt Cloudinary deletion BEFORE destroying the database record.
      try {
        const destroyResult = await cloudinaryServiceInstance.uploader.destroy(
          lockedImage.publicId,
        )

        if (
          destroyResult &&
          destroyResult.result === 'not found'
        ) {
          // Asset already gone; consider deletion successful.
        }
      } catch (deleteError) {
        logSecurityEvent('cloudinary_delete_failed', {
          error: deleteError.message,
          publicId: lockedImage.publicId,
        })
        throw new CloudinaryDeleteError()
      }

      // Cloudinary deletion succeeded (or asset not found). Now destroy the DB record.
      await lockedImage.destroy({ transaction })

      // If the deleted image was the cover, promote the next image.
      if (wasCoverNow) {
        const nextImage = await imageModel.findOne({
          where: {
            journalId: lockedImage.journalId,
          },
          order: [['displayOrder', 'ASC'], ['id', 'ASC']],
          transaction,
        })

        if (nextImage) {
          await nextImage.update({ isCover: true }, { transaction })
        }
      }
    })
  }

  const reorderScrapbookImages = async (userId, journalId, imageIds) => {
    // Verify journal exists and belongs to user.
    const journal = await journalModel.findOne({
      where: {
        id: journalId,
        userId,
      },
    })

    if (!journal) {
      throw new ScrapbookNotFoundError()
    }

    // Verify all supplied images belong to this journal.
    const images = await imageModel.findAll({
      where: {
        id: imageIds,
        journalId,
      },
    })

    if (images.length !== imageIds.length) {
      throw new ScrapbookImageNotFoundError()
    }

    // Sort images according to the requested order.
    const orderedImages = imageIds.map((id) =>
      images.find((image) => image.id === id),
    )

    await journalModel.sequelize.transaction(async (transaction) => {
      // Lock the journal row to serialize reordering.
      await journalModel.findByPk(journalId, {
        lock: transaction.LOCK.UPDATE,
        transaction,
      })

      await Promise.all(
        orderedImages.map((image, index) =>
          image.update(
            { displayOrder: index + 1 },
            { transaction },
          ),
        ),
      )
    })

    const updatedImages = await imageModel.findAll({
      where: {
        id: imageIds,
        journalId,
      },
      order: [['displayOrder', 'ASC'], ['id', 'ASC']],
    })

    return updatedImages.map(toPublicScrapbookImage)
  }

  return {
    createScrapbookJournal,
    listScrapbookJournals,
    getScrapbookJournal,
    updateScrapbookJournal,
    linkTrip,
    unlinkTrip,
    setJournalVisibility,
    deleteScrapbookJournal,
    addScrapbookImage,
    listScrapbookImages,
    updateScrapbookImage,
    deleteScrapbookImage,
    reorderScrapbookImages,
  }
}

const scrapbookService = createScrapbookService()

module.exports = {
  createScrapbookService,
  scrapbookService,
}
