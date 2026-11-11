'use strict'

const { DestinationNotFoundError } = require('../utils/destinationErrors')
const { createPagination } = require('../utils/pagination')
const {
  PUBLIC_DESTINATION_FIELDS,
  PUBLIC_DESTINATION_IMAGE_FIELDS,
} = require('../utils/safeDestination')
const { PUBLIC_POST_FIELDS, toPost } = require('../utils/safePost')
const { PUBLIC_PROFILE_FIELDS } = require('../utils/safeUser')
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
} = {}) => {
  const postModel = Post || require('../models').Post
  const userModel = User || require('../models').User
  const destinationModel =
    Destination || require('../models').Destination
  const imageModel =
    DestinationImage || require('../models').DestinationImage

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
      include: [authorInclude, destinationInclude],
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
      include: [authorInclude, destinationInclude],
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
    await post.destroy()
  }

  return {
    createPost,
    deletePost,
    getPost,
    listPosts,
    listUserPosts,
    updatePost,
  }
}

const postService = createPostService()

module.exports = {
  createPostService,
  postService,
}
