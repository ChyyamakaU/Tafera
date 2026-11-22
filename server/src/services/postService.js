'use strict'

const { Op } = require('sequelize')
const { DestinationNotFoundError } = require('../utils/destinationErrors')
const { createPagination } = require('../utils/pagination')
const {
  PUBLIC_DESTINATION_FIELDS,
  PUBLIC_DESTINATION_IMAGE_FIELDS,
} = require('../utils/safeDestination')
const { PUBLIC_POST_FIELDS, toPost } = require('../utils/safePost')
const { PUBLIC_PROFILE_FIELDS } = require('../utils/safeUser')
const cloudinary = require('../config/cloudinary')
const { CloudinaryUploadError } = require('../utils/destinationErrors')
const { logSecurityEvent } = require('../utils/securityLog')
const { ValidationError } = require('../utils/authErrors')
const { uploadBuffer } = require('../utils/cloudinaryUpload')
const {
  PostAccessDeniedError,
  PostNotFoundError,
  ProfileNotFoundError,
} = require('../utils/socialErrors')

const createPostService = ({
  Post,
  User,
  Destination,
  DestinationImage,
  PostImage,
  Follow,
} = {}) => {
  const postModel = Post || require('../models').Post
  const userModel = User || require('../models').User
  const destinationModel =
    Destination || require('../models').Destination
  const imageModel =
    DestinationImage || require('../models').DestinationImage
  const postImageModel = PostImage || (Post ? null : require('../models').PostImage)
  const followModel = Follow || require('../models').Follow

  const destinationImagesInclude = {
    model: imageModel,
    as: 'images',
    attributes: [...PUBLIC_DESTINATION_IMAGE_FIELDS],
    required: false,
    separate: true,
    order: [
      ['displayOrder', 'ASC'],
      ['id', 'ASC'],
    ],
  }

  // Status is selected for the serializer's defence-in-depth check but is
  // never part of the public destination payload.
  const destinationInclude = {
    model: destinationModel,
    as: 'destination',
    attributes: [...PUBLIC_DESTINATION_FIELDS, 'status'],
    required: false,
    include: [destinationImagesInclude],
  }

  const postImagesInclude = postImageModel && postModel.associations?.images ? {
    model: postImageModel,
    as: 'images',
    attributes: ['id', 'imageUrl', 'altText', 'displayOrder'],
    required: false,
    separate: true,
    order: [['displayOrder', 'ASC'], ['id', 'ASC']],
  } : null

  // Suspended authors are filtered at the query level so pagination totals and
  // public detail lookups never include hidden content.
  const authorInclude = {
    model: userModel,
    as: 'author',
    attributes: [...PUBLIC_PROFILE_FIELDS, 'status'],
    where: { status: 'active' },
    required: true,
  }

  const assertDestinationAvailable = async (destinationId) => {
    if (destinationId === undefined || destinationId === null) return

    const destination = await destinationModel.findOne({
      where: { id: destinationId, status: 'published' },
      attributes: ['id'],
    })

    if (!destination) {
      throw new DestinationNotFoundError()
    }
  }

  const findVisiblePost = async (postId) =>
    postModel.findOne({
      where: { id: postId },
      attributes: [...PUBLIC_POST_FIELDS],
      include: [authorInclude, destinationInclude, ...(postImagesInclude ? [postImagesInclude] : [])],
    })

  const getPost = async (postId) => {
    const post = await findVisiblePost(postId)
    const serialized = toPost(post)

    if (!serialized) {
      throw new PostNotFoundError()
    }

    return serialized
  }

  const listVisiblePosts = async ({ where, filters }) => {
    const { count, rows } = await postModel.findAndCountAll({
      where,
      attributes: [...PUBLIC_POST_FIELDS],
      include: [authorInclude, destinationInclude, ...(postImagesInclude ? [postImagesInclude] : [])],
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit: filters.limit,
      offset: (filters.page - 1) * filters.limit,
      distinct: true,
    })

    return {
      posts: rows.map(toPost).filter(Boolean),
      pagination: createPagination({
        page: filters.page,
        limit: filters.limit,
        total: count,
      }),
    }
  }

  const listPosts = async (filters) =>
    listVisiblePosts({ where: {}, filters })

  const listUserPosts = async (userId, filters) => {
    const user = await userModel.findOne({
      where: { id: userId, status: 'active' },
      attributes: ['id'],
    })

    if (!user) {
      throw new ProfileNotFoundError()
    }

    return listVisiblePosts({ where: { userId }, filters })
  }

  const listFollowingPosts = async (followerId, filters) => {
    // Resolve only active followed accounts. Suspended accounts are excluded
    // here as well as by the active-author filter used for the posts.
    const follows = await followModel.findAll({
      where: { followerId },
      attributes: ['followingId'],
      include: [
        {
          model: userModel,
          as: 'followingUser',
          attributes: ['id'],
          where: { status: 'active' },
          required: true,
        },
      ],
    })

    const followedIds = follows.map((follow) => follow.followingId)

    if (followedIds.length === 0) {
      return {
        posts: [],
        pagination: createPagination({
          page: filters.page,
          limit: filters.limit,
          total: 0,
        }),
      }
    }

    return listVisiblePosts({
      where: { userId: { [Op.in]: followedIds } },
      filters,
    })
  }

  const createPost = async (userId, input) => {
    await assertDestinationAvailable(input.destinationId)

    // auth owns the userId value; validated input can only contain content and
    // destinationId.
    const post = await postModel.create({
      ...input,
      userId,
    })

    return getPost(post.id)
  }

  const findMutablePost = async (userId, postId) => {
    const post = await postModel.findOne({
      where: { id: postId },
      attributes: [...PUBLIC_POST_FIELDS, 'userId'],
      include: [authorInclude],
    })

    if (!post) {
      throw new PostNotFoundError()
    }

    // Posts are public, so a different author can be told that the resource
    // exists without revealing anything that is not already public.
    if (post.userId !== userId) {
      throw new PostAccessDeniedError()
    }

    return post
  }

  const updatePost = async (userId, postId, input) => {
    const post = await findMutablePost(userId, postId)

    await assertDestinationAvailable(input.destinationId)
    await post.update(input)

    return getPost(postId)
  }

  const deletePost = async (userId, postId) => {
    const post = await findMutablePost(userId, postId)
    const images = postImageModel
      ? await postImageModel.findAll({ where: { postId }, attributes: ['publicId'] })
      : []
    for (const image of images) {
      try {
        await cloudinary.uploader.destroy(image.publicId, { resource_type: 'image' })
      } catch (error) {
        logSecurityEvent('post_image_cleanup_failed', { error: error.message, postId })
      }
    }
    await post.destroy()
  }

  const addPostImage = async (userId, postId, file, altText) => {
    const post = await postModel.findOne({ where: { id: postId, userId }, attributes: ['id', 'content'] })
    if (!post) throw new PostNotFoundError()
    const count = await postImageModel.count({ where: { postId } })
    if (count >= 10) throw new ValidationError([{ field: 'image', message: 'A post can contain at most 10 photos.' }])
    let uploaded
    try {
      uploaded = await uploadBuffer(cloudinary, file.buffer, { resource_type: 'image', folder: 'tafera/posts' })
    } catch (error) {
      logSecurityEvent('post_image_upload_failed', { error: error.message, postId })
      throw new CloudinaryUploadError()
    }
    try {
      const image = await postImageModel.create({
        postId,
        imageUrl: uploaded.secure_url,
        publicId: uploaded.public_id,
        altText: altText || null,
        displayOrder: count,
      })
      return { id: image.id, imageUrl: image.imageUrl, altText: image.altText, displayOrder: image.displayOrder, createdAt: image.createdAt, post: { id: post.id, content: post.content } }
    } catch (error) {
      try { await cloudinary.uploader.destroy(uploaded.public_id, { resource_type: 'image' }) } catch {}
      throw error
    }
  }

  const listUserMedia = async (userId, filters) => {
    const { count, rows } = await postImageModel.findAndCountAll({
      attributes: ['id', 'imageUrl', 'altText', 'displayOrder', 'createdAt'],
      include: [{
        model: postModel,
        as: 'post',
        attributes: ['id', 'content', 'createdAt'],
        where: { userId },
        required: true,
        include: [authorInclude],
      }],
      order: [['createdAt', 'DESC'], ['id', 'DESC']],
      limit: filters.limit,
      offset: (filters.page - 1) * filters.limit,
      distinct: true,
    })
    return {
      media: rows.map((row) => {
        const item = row.get({ plain: true })
        return { id: item.id, imageUrl: item.imageUrl, altText: item.altText, displayOrder: item.displayOrder, createdAt: item.createdAt, post: { id: item.post.id, content: item.post.content, createdAt: item.post.createdAt } }
      }),
      pagination: createPagination({ page: filters.page, limit: filters.limit, total: count }),
    }
  }

  return {
    createPost,
    deletePost,
    getPost,
    listFollowingPosts,
    listPosts,
    listUserPosts,
    addPostImage,
    listUserMedia,
    updatePost,
  }
}

const postService = createPostService()

module.exports = {
  createPostService,
  postService,
}
