'use strict'

const { Op } = require('sequelize')
const { DestinationNotFoundError } = require('../utils/destinationErrors')
const { createPagination } = require('../utils/pagination')
const {
  PUBLIC_DESTINATION_FIELDS,
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
  PostLike,
  SavedPost,
  Follow,
} = {}) => {
  const postModel = Post || require('../models').Post
  const userModel = User || require('../models').User
  const destinationModel =
    Destination || require('../models').Destination
  const imageModel =
    DestinationImage || require('../models').DestinationImage
  const postImageModel = PostImage || (Post ? null : require('../models').PostImage)
  const postLikeModel = PostLike || (Post ? null : require('../models').PostLike)
  const savedPostModel = SavedPost || (Post ? null : require('../models').SavedPost)
  const followModel = Follow || require('../models').Follow

  const destinationImagesInclude = {
    model: imageModel,
    as: 'images',
    attributes: ['id', 'imageUrl', 'altText', 'displayOrder', 'isCover'],
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

  const enrichPosts = async (rows, viewerUserId = null) => {
    const serializedPosts = rows.map((row) => toPost(row)).filter(Boolean)

    if (serializedPosts.length === 0) {
      return []
    }

    const postIds = serializedPosts.map((post) => post.id)

    const likeCountsPromise = postLikeModel
      ? postLikeModel.sequelize
        ? postLikeModel.findAll({
            where: { postId: { [Op.in]: postIds } },
            attributes: [
              'postId',
              [
                postLikeModel.sequelize.fn(
                  'COUNT',
                  postLikeModel.sequelize.col('id'),
                ),
                'count',
              ],
            ],
            group: ['postId'],
            raw: true,
          })
        : postLikeModel.findAll({
            where: { postId: { [Op.in]: postIds } },
            attributes: ['postId'],
            raw: true,
          })
      : Promise.resolve([])

    const viewerLikesPromise =
      viewerUserId && postLikeModel
        ? postLikeModel.findAll({
            where: {
              userId: viewerUserId,
              postId: { [Op.in]: postIds },
            },
            attributes: ['postId'],
            raw: true,
          })
        : Promise.resolve([])

    const viewerSavesPromise =
      viewerUserId && savedPostModel
        ? savedPostModel.findAll({
            where: {
              userId: viewerUserId,
              postId: { [Op.in]: postIds },
            },
            attributes: ['postId'],
            raw: true,
          })
        : Promise.resolve([])

    const [likeCountRows, viewerLikeRows, viewerSaveRows] =
      await Promise.all([
        likeCountsPromise,
        viewerLikesPromise,
        viewerSavesPromise,
      ])

    const likeCountByPostId = new Map()
    for (const row of likeCountRows || []) {
      const id = row.postId
      if (!id) continue
      if (row.count !== undefined) {
        likeCountByPostId.set(id, Number(row.count) || 0)
      } else {
        likeCountByPostId.set(id, (likeCountByPostId.get(id) || 0) + 1)
      }
    }

    const likedPostIds = new Set(
      (viewerLikeRows || []).map((row) => row.postId).filter(Boolean),
    )
    const savedPostIds = new Set(
      (viewerSaveRows || []).map((row) => row.postId).filter(Boolean),
    )

    return serializedPosts.map((post) => ({
      ...post,
      likeCount: likeCountByPostId.get(post.id) ?? post.likeCount,
      isLiked: likedPostIds.has(post.id),
      isSaved: savedPostIds.has(post.id),
    }))
  }

  const assertVisiblePostExists = async (postId) => {
    const post = await postModel.findOne({
      where: { id: postId },
      attributes: ['id'],
      include: [authorInclude],
    })

    if (!post) {
      throw new PostNotFoundError()
    }

    return post
  }

  const findVisiblePost = async (postId) =>
    postModel.findOne({
      where: { id: postId },
      attributes: [...PUBLIC_POST_FIELDS],
      include: [authorInclude, destinationInclude, ...(postImagesInclude ? [postImagesInclude] : [])],
    })

  const getPost = async (postId, viewerUserId = null) => {
    const post = await findVisiblePost(postId)
    const [serialized] = await enrichPosts(post ? [post] : [], viewerUserId)

    if (!serialized) {
      throw new PostNotFoundError()
    }

    return serialized
  }

  const listVisiblePosts = async ({ where, filters, viewerUserId = null }) => {
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
      posts: await enrichPosts(rows, viewerUserId),
      pagination: createPagination({
        page: filters.page,
        limit: filters.limit,
        total: count,
      }),
    }
  }

  const listPosts = async (filters, viewerUserId = null) =>
    listVisiblePosts({ where: {}, filters, viewerUserId })

  const listUserPosts = async (userId, filters, viewerUserId = null) => {
    const user = await userModel.findOne({
      where: { id: userId, status: 'active' },
      attributes: ['id'],
    })

    if (!user) {
      throw new ProfileNotFoundError()
    }

    return listVisiblePosts({ where: { userId }, filters, viewerUserId })
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
      viewerUserId: followerId,
    })
  }

  const listSavedPosts = async (userId, filters) => {
    const { count, rows } = await savedPostModel.findAndCountAll({
      where: { userId },
      attributes: ['id', 'postId', 'createdAt'],
      include: [
        {
          model: postModel,
          as: 'post',
          attributes: [...PUBLIC_POST_FIELDS],
          required: true,
          include: [
            authorInclude,
            destinationInclude,
            ...(postImagesInclude ? [postImagesInclude] : []),
          ],
        },
      ],
      order: [
        ['createdAt', 'DESC'],
        ['id', 'DESC'],
      ],
      limit: filters.limit,
      offset: (filters.page - 1) * filters.limit,
      distinct: true,
    })

    const postRows = rows.map((row) => row.post).filter(Boolean)

    return {
      posts: await enrichPosts(postRows, userId),
      pagination: createPagination({
        page: filters.page,
        limit: filters.limit,
        total: count,
      }),
    }
  }

  const likePost = async (userId, postId) => {
    await assertVisiblePostExists(postId)

    try {
      await postLikeModel.findOrCreate({
        where: { userId, postId },
        defaults: { userId, postId },
      })
    } catch (error) {
      if (error?.name !== 'SequelizeUniqueConstraintError') {
        throw error
      }
    }

    const likeCount = await postLikeModel.count({ where: { postId } })

    return {
      postId,
      liked: true,
      likeCount: Number(likeCount) || 0,
    }
  }

  const unlikePost = async (userId, postId) => {
    await assertVisiblePostExists(postId)

    await postLikeModel.destroy({ where: { userId, postId } })
    const likeCount = await postLikeModel.count({ where: { postId } })

    return {
      postId,
      liked: false,
      likeCount: Number(likeCount) || 0,
    }
  }

  const savePost = async (userId, postId) => {
    await assertVisiblePostExists(postId)

    try {
      await savedPostModel.findOrCreate({
        where: { userId, postId },
        defaults: { userId, postId },
      })
    } catch (error) {
      if (error?.name !== 'SequelizeUniqueConstraintError') {
        throw error
      }
    }

    return {
      postId,
      saved: true,
    }
  }

  const unsavePost = async (userId, postId) => {
    await assertVisiblePostExists(postId)

    await savedPostModel.destroy({ where: { userId, postId } })

    return {
      postId,
      saved: false,
    }
  }

  const createPost = async (userId, input) => {
    await assertDestinationAvailable(input.destinationId)

    // auth owns the userId value; validated input can only contain content and
    // destinationId.
    const post = await postModel.create({
      ...input,
      userId,
    })

    return getPost(post.id, userId)
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

    return getPost(postId, userId)
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
    likePost,
    listFollowingPosts,
    listPosts,
    listSavedPosts,
    listUserPosts,
    addPostImage,
    listUserMedia,
    savePost,
    unlikePost,
    unsavePost,
    updatePost,
  }
}

const postService = createPostService()

module.exports = {
  createPostService,
  postService,
}
