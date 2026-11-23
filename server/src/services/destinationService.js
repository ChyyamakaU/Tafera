'use strict'

const { Op } = require('sequelize')
const https = require('node:https')
const cloudinary = require('../config/cloudinary')
const { uploadBuffer } = require('../utils/cloudinaryUpload')
const { logSecurityEvent } = require('../utils/securityLog')
const {
  CloudinaryDeleteError,
  CloudinaryUploadError,
  DestinationImageLimitExceededError,
  DestinationImageNotFoundError,
  DestinationNotFoundError,
  InvalidImageFileError,
} = require('../utils/destinationErrors')
const {
  PUBLIC_DESTINATION_FIELDS,
  toCommunityDestinationImage,
  toContributionDestination,
  toDestinationDetail,
  toDestinationSummary,
  toPublicDestinationImage,
} = require('../utils/safeDestination')
const {
  MAX_IMAGE_FILE_SIZE,
  MAX_IMAGES_PER_DESTINATION,
  SUPPORTED_IMAGE_TYPES,
} = require('../validators/destination')

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const destinationCloudinaryAgent = new https.Agent({ family: 4, keepAlive: true })

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

const createDestinationService = ({
  Destination,
  DestinationImage,
  User,
  cloudinaryService,
} = {}) => {
  const destinationModel = Destination || require('../models').Destination
  const imageModel =
    DestinationImage || require('../models').DestinationImage
  const userModel = User || imageModel.sequelize?.models?.User || require('../models').User
  const cloudinaryServiceInstance =
    cloudinaryService || require('../config/cloudinary')

  const imageInclude = {
    model: imageModel,
    as: 'images',
    attributes: [
      'id',
      'imageUrl',
      'altText',
      'caption',
      'displayOrder',
      'isCover',
      'createdAt',
    ],
    include: [{
      model: userModel,
      as: 'contributor',
      attributes: ['id', 'fullName', 'username', 'profileImage'],
      required: false,
    }],
    required: false,
    separate: true,
    order: [
      ['displayOrder', 'ASC'],
      ['id', 'ASC'],
    ],
  }

  // The Explore list needs only the pre-existing public cover fields. Keeping
  // the list projection independent from contribution metadata lets public
  // destination discovery continue to work while a deployment is rolling out
  // the additive gallery-contributor migration.
  const destinationSummaryImageInclude = {
    model: imageModel,
    as: 'images',
    attributes: ['id', 'imageUrl', 'altText', 'displayOrder', 'isCover'],
    required: false,
    separate: true,
    order: [['displayOrder', 'ASC'], ['id', 'ASC']],
  }

  const listDestinations = async (filters) => {
    const { count, rows } = await destinationModel.findAndCountAll({
      where: buildWhere(filters),
      attributes: [...PUBLIC_DESTINATION_FIELDS],
      include: [destinationSummaryImageInclude],
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

  const uploadDestinationImage = async (
    destinationId,
    file,
    { altText, caption, isCover, userId, role } = {},
  ) => {
    // Travellers may contribute to published destinations. Admins retain the
    // ability to manage images on drafts as before.
    const destination = await destinationModel.findByPk(destinationId)
    if (!destination || (destination.status !== 'published' && role !== 'admin')) {
      throw new DestinationNotFoundError()
    }

    // Upload to Cloudinary before creating the database record.
    let uploadResult
    try {
      uploadResult = await uploadBuffer(
        cloudinaryServiceInstance,
        file.buffer,
        {
          resource_type: 'image',
          folder: 'tafera/destinations',
          agent: destinationCloudinaryAgent,
        },
      )
    } catch (error) {
      logSecurityEvent('cloudinary_upload_failed', {
        providerCode: error.code || error.name || 'UNKNOWN',
        ...(Number.isInteger(error.http_code) ? { providerStatus: error.http_code } : {}),
      })
      throw new CloudinaryUploadError()
    }

    // Lock the parent destination row and perform count + create inside a
    // transaction so concurrent uploads cannot both pass the 10-image limit.
    let createdImage
    try {
      createdImage = await destinationModel.sequelize.transaction(
        async (transaction) => {
          // Lock the destination row to serialize per-destination writes.
          await destinationModel.findByPk(destinationId, {
            lock: transaction.LOCK.UPDATE,
            transaction,
          })

          const existingCount = await imageModel.count({
            where: { destinationId },
            transaction,
          })

          if (existingCount >= MAX_IMAGES_PER_DESTINATION) {
            // Compensation: delete the uploaded Cloudinary asset since we
            // will not create the database record.
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
            throw new DestinationImageLimitExceededError()
          }

          // Determine cover status: if this is the first image and no cover
          // preference was explicitly set, it becomes the cover. Otherwise
          // only one image per destination may be the cover.
          const hasExistingCover = await imageModel.count({
            where: {
              destinationId,
              isCover: true,
            },
            transaction,
          })

          const shouldBeCover =
            isCover === true ||
            (existingCount === 0 && hasExistingCover === 0)

          return imageModel.create({
            destinationId,
            userId: userId || null,
            imageUrl: uploadResult.secure_url,
            publicId: uploadResult.public_id,
            altText: altText || null,
            caption: caption || null,
            isCover: shouldBeCover,
            displayOrder: existingCount + 1,
          }, { transaction })
        },
      )
    } catch (error) {
      if (error instanceof DestinationImageLimitExceededError) {
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

    return toPublicDestinationImage(createdImage)
  }

  const listDestinationImages = async (destinationId) => {
    // Verify destination exists and is published. Draft destinations are
    // hidden from public image listings, consistent with the public detail
    // policy.
    const destination = await destinationModel.findOne({
      where: {
        id: destinationId,
        status: 'published',
      },
    })
    if (!destination) {
      throw new DestinationNotFoundError()
    }

    const images = await imageModel.findAll({
      where: { destinationId },
      include: [{
        model: userModel,
        as: 'contributor',
        attributes: ['id', 'fullName', 'username', 'profileImage'],
        required: false,
      }],
      order: [['displayOrder', 'ASC'], ['id', 'ASC']],
    })

    return images.map(toPublicDestinationImage)
  }

  // Public community gallery: every traveller-contributed photo across all
  // published destinations. Deliberately not filtered by follows or by the
  // caller's identity so public visitors can browse the whole community.
  const listCommunityImages = async ({ q, country, state, page, limit }) => {
    const destinationWhere = { status: 'published' }

    if (country) {
      destinationWhere.country = { [Op.iLike]: escapeLikePattern(country) }
    }

    if (state) {
      destinationWhere.state = { [Op.iLike]: escapeLikePattern(state) }
    }

    if (q) {
      const pattern = `%${escapeLikePattern(q)}%`
      destinationWhere[Op.or] = [
        'name',
        'slug',
        'country',
        'state',
        'location',
      ].map((field) => ({ [field]: { [Op.iLike]: pattern } }))
    }

    const { count, rows } = await imageModel.findAndCountAll({
      // Seeded/admin gallery images have no contributor. The community gallery
      // shows only real traveller contributions.
      where: { userId: { [Op.ne]: null } },
      include: [
        {
          model: destinationModel,
          as: 'destination',
          where: destinationWhere,
          required: true,
          attributes: ['id', 'name', 'slug', 'country', 'state', 'location'],
        },
        {
          model: userModel,
          as: 'contributor',
          attributes: ['id', 'fullName', 'username', 'profileImage'],
          required: false,
        },
      ],
      order: [['createdAt', 'DESC'], ['id', 'ASC']],
      limit,
      offset: (page - 1) * limit,
      distinct: true,
    })

    const total = Number(count) || 0
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit)

    return {
      photos: rows.map(toCommunityDestinationImage).filter(Boolean),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1 && total > 0,
      },
    }
  }

  // Personal contributions: only destinations where this user has at least one
  // image, grouped by the existing destination records.
  const listMyDestinationContributions = async (userId) => {
    // Resolve the distinct destination IDs first. A separate child query then
    // loads only this user's images, so destinations without a contribution
    // from the caller can never leak into the personal results.
    const contributed = await imageModel.findAll({
      where: { userId },
      attributes: ['destinationId'],
      group: ['destinationId'],
      raw: true,
    })

    const destinationIds = contributed
      .map((row) => row.destinationId)
      .filter(Boolean)

    if (destinationIds.length === 0) return []

    const destinations = await destinationModel.findAll({
      where: {
        id: { [Op.in]: destinationIds },
        status: 'published',
      },
      attributes: [...PUBLIC_DESTINATION_FIELDS],
      include: [{
        model: imageModel,
        as: 'images',
        where: { userId },
        required: true,
        attributes: [
          'id',
          'imageUrl',
          'altText',
          'caption',
          'displayOrder',
          'isCover',
          'createdAt',
        ],
        separate: true,
        order: [['displayOrder', 'ASC'], ['id', 'ASC']],
      }],
      order: [['name', 'ASC'], ['id', 'ASC']],
    })

    return destinations.map(toContributionDestination).filter(Boolean)
  }

  const getMyDestinationContributions = async (identifier, userId) => {
    const destination = await getDestination(identifier)

    const images = await imageModel.findAll({
      where: { destinationId: destination.id, userId },
      include: [{
        model: userModel,
        as: 'contributor',
        attributes: ['id', 'fullName', 'username', 'profileImage'],
        required: false,
      }],
      order: [['displayOrder', 'ASC'], ['id', 'ASC']],
    })

    return {
      ...destination,
      images: images.map(toPublicDestinationImage),
      contributedPhotoCount: images.length,
    }
  }

  const updateDestinationImage = async (
    imageId,
    { altText, displayOrder, isCover } = {},
  ) => {
    const image = await imageModel.findByPk(imageId)
    if (!image) {
      throw new DestinationImageNotFoundError()
    }

    const destination = await destinationModel.findByPk(image.destinationId)
    if (!destination) {
      throw new DestinationNotFoundError()
    }

    const updates = {}
    if (altText !== undefined) updates.altText = altText
    if (displayOrder !== undefined) updates.displayOrder = displayOrder
    if (isCover !== undefined) updates.isCover = isCover

    if (Object.keys(updates).length === 0) {
      return toPublicDestinationImage(image)
    }

    // Lock the parent destination row so concurrent cover changes and
    // deletions cannot bypass the single-cover rule.
    await destinationModel.sequelize.transaction(async (transaction) => {
      // Lock the destination row to serialize per-destination writes.
      await destinationModel.findByPk(image.destinationId, {
        lock: transaction.LOCK.UPDATE,
        transaction,
      })

      // Re-fetch the image inside the transaction to get the locked row
      // state and ensure we operate on the latest version.
      const lockedImage = await imageModel.findByPk(imageId, {
        lock: transaction.LOCK.UPDATE,
        transaction,
      })

      if (!lockedImage) {
        throw new DestinationImageNotFoundError()
      }

      const wasAlreadyCover = lockedImage.isCover === true

      await lockedImage.update(updates, { transaction })

      // If setting this image as cover, unset cover on all other images
      // for the same destination within the same transaction. Check the
      // pre-update cover state so we don't skip this after the instance has
      // been mutated in place.
      if (isCover === true && !wasAlreadyCover) {
        await imageModel.update(
          { isCover: false },
          {
            where: {
              destinationId: lockedImage.destinationId,
              id: { [Op.ne]: imageId },
              isCover: true,
            },
            transaction,
          },
        )
      }
    })

    return toPublicDestinationImage(await imageModel.findByPk(imageId))
  }

  const deleteDestinationImage = async (
    imageId,
    { destinationId, userId, role } = {},
  ) => {
    const image = await imageModel.findByPk(imageId)
    if (!image) {
      throw new DestinationImageNotFoundError()
    }

    if (destinationId && image.destinationId !== destinationId) {
      throw new DestinationImageNotFoundError()
    }

    if (role !== 'admin' && (!userId || image.userId !== userId)) {
      throw new DestinationImageNotFoundError()
    }

    const destination = await destinationModel.findByPk(image.destinationId)
    if (!destination) {
      throw new DestinationNotFoundError()
    }

    const wasCover = image.isCover === true

    await destinationModel.sequelize.transaction(async (transaction) => {
      // Lock the destination row to serialize cover promotion with deletion.
      await destinationModel.findByPk(image.destinationId, {
        lock: transaction.LOCK.UPDATE,
        transaction,
      })

      // Re-fetch the image inside the transaction.
      const lockedImage = await imageModel.findByPk(imageId, {
        lock: transaction.LOCK.UPDATE,
        transaction,
      })

      if (!lockedImage) {
        throw new DestinationImageNotFoundError()
      }

      const wasCoverNow = lockedImage.isCover === true

      // Attempt Cloudinary deletion BEFORE destroying the database record.
      // If Cloudinary throws, we roll back and preserve the DB record.
      try {
        const destroyResult = await cloudinaryServiceInstance.uploader.destroy(
          lockedImage.publicId,
        )

        // Cloudinary returns { result: 'not found' } (resolved, not thrown)
        // when the asset does not exist. Treat that as successful deletion.
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

      // Cloudinary deletion succeeded (or asset not found). Now destroy the
      // database record within the same transaction.
      await lockedImage.destroy({ transaction })

      // If the deleted image was the cover, promote the next image by
      // displayOrder and then ID within the same transaction.
      if (wasCoverNow) {
        const nextImage = await imageModel.findOne({
          where: {
            destinationId: lockedImage.destinationId,
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

  const reorderDestinationImages = async (destinationId, imageIds) => {
    // Verify destination exists.
    const destination = await destinationModel.findByPk(destinationId)
    if (!destination) {
      throw new DestinationNotFoundError()
    }

    // Verify all supplied images belong to this destination.
    const images = await imageModel.findAll({
      where: {
        id: imageIds,
        destinationId,
      },
    })

    if (images.length !== imageIds.length) {
      throw new DestinationImageNotFoundError()
    }

    // Sort images according to the requested order.
    const orderedImages = imageIds.map((id) =>
      images.find((image) => image.id === id),
    )

    // Lock the parent destination row so concurrent reordering cannot
    // interleave with cover changes or uploads.
    await imageModel.sequelize.transaction(async (transaction) => {
      await destinationModel.findByPk(destinationId, {
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
        destinationId,
      },
      order: [['displayOrder', 'ASC'], ['id', 'ASC']],
    })

    return updatedImages.map(toPublicDestinationImage)
  }

  return {
    getDestination,
    listDestinations,
    uploadDestinationImage,
    listDestinationImages,
    listCommunityImages,
    listMyDestinationContributions,
    getMyDestinationContributions,
    updateDestinationImage,
    deleteDestinationImage,
    reorderDestinationImages,
  }
}

const destinationService = createDestinationService()

module.exports = {
  createDestinationService,
  destinationService,
}
