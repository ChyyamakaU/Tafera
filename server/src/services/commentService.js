'use strict'

const { createPagination } = require('../utils/pagination')
const {
  PUBLIC_COMMENT_FIELDS,
  toComment,
} = require('../utils/safeComment')
const { PUBLIC_PROFILE_FIELDS } = require('../utils/safeUser')
const {
  CommentAccessDeniedError,
  CommentNotFoundError,
  PostNotFoundError,
} = require('../utils/socialErrors')

const createCommentService = ({ Comment, Post, User } = {}) => {
  const commentModel = Comment || require('../models').Comment
  const postModel = Post || require('../models').Post
  const userModel = User || require('../models').User

  // Comment authors are filtered at the query level so pagination totals and
  // direct lookups never include content hidden by a suspension.
  const commentAuthorInclude = {
    model: userModel,
    as: 'author',
    attributes: [...PUBLIC_PROFILE_FIELDS, 'status'],
    where: { status: 'active' },
    required: true,
  }

  // A post is public only while its author is active. Reusing the same author
  // filter keeps comment visibility consistent with post visibility.
  const postAuthorInclude = {
    model: userModel,
    as: 'author',
    attributes: ['id'],
    where: { status: 'active' },
    required: true,
  }

  const assertPostVisible = async (postId) => {
    const post = await postModel.findOne({
      where: { id: postId },
      attributes: ['id'],
      include: [postAuthorInclude],
    })

    if (!post) {
      throw new PostNotFoundError()
    }

    return post
  }

  const findVisibleComment = async (postId, commentId) => {
    const comment = await commentModel.findOne({
      // Both identifiers are always part of the lookup, so a comment cannot be
      // reached through the ID of a different post.
      where: { id: commentId, postId },
      attributes: [...PUBLIC_COMMENT_FIELDS, 'userId'],
      include: [commentAuthorInclude],
    })

    if (!comment) {
      throw new CommentNotFoundError()
    }

    return comment
  }

  const getComment = async (postId, commentId) => {
    const comment = await findVisibleComment(postId, commentId)

    return toComment(comment)
  }

  const listComments = async (postId, filters) => {
    await assertPostVisible(postId)

    const { count, rows } = await commentModel.findAndCountAll({
      where: { postId },
      attributes: [...PUBLIC_COMMENT_FIELDS],
      include: [commentAuthorInclude],
      order: [
        ['createdAt', 'ASC'],
        ['id', 'ASC'],
      ],
      limit: filters.limit,
      offset: (filters.page - 1) * filters.limit,
      distinct: true,
    })

    return {
      comments: rows.map(toComment).filter(Boolean),
      pagination: createPagination({
        page: filters.page,
        limit: filters.limit,
        total: count,
      }),
    }
  }

  const createComment = async (userId, postId, input) => {
    await assertPostVisible(postId)

    // auth owns the userId value; validated input can only contain content.
    const comment = await commentModel.create({
      ...input,
      postId,
      userId,
    })

    return getComment(postId, comment.id)
  }

  const findMutableComment = async (userId, postId, commentId) => {
    await assertPostVisible(postId)

    const comment = await findVisibleComment(postId, commentId)

    // Comments are public, so a different author can be told that the resource
    // exists without revealing anything that is not already public.
    if (comment.userId !== userId) {
      throw new CommentAccessDeniedError()
    }

    return comment
  }

  const updateComment = async (userId, postId, commentId, input) => {
    const comment = await findMutableComment(userId, postId, commentId)

    await comment.update(input)

    return getComment(postId, commentId)
  }

  const deleteComment = async (userId, postId, commentId) => {
    const comment = await findMutableComment(userId, postId, commentId)

    await comment.destroy()
  }

  return {
    createComment,
    deleteComment,
    listComments,
    updateComment,
  }
}

const commentService = createCommentService()

module.exports = {
  createCommentService,
  commentService,
}
