'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')

const { createCommentService } = require('../src/services/commentService')
const {
  CommentAccessDeniedError,
  CommentNotFoundError,
  PostNotFoundError,
} = require('../src/utils/socialErrors')

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_ID = '22222222-2222-4222-8222-222222222222'
const POST_ID = '33333333-3333-4333-8333-333333333333'
const COMMENT_ID = '44444444-4444-4444-8444-444444444444'

const author = {
  id: OWNER_ID,
  fullName: 'Ada Lovelace',
  profileImage: null,
  bio: null,
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
}

const createCommentRecord = (overrides = {}) => ({
  id: COMMENT_ID,
  postId: POST_ID,
  userId: OWNER_ID,
  content: 'A comment',
  author,
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
  updates: [],
  async update(values) {
    this.updates.push(values)
    Object.assign(this, values)
  },
  async destroy() {
    this.destroyed = true
  },
  ...overrides,
})

const createService = ({
  post = { id: POST_ID, author: { id: OWNER_ID } },
  actorUser,
  comment,
  commentsResult,
  createError,
  notificationError,
} = {}) => {
  const calls = {
    postFindOne: [],
    userFindByPk: [],
    commentCreate: [],
    commentFindOne: [],
    commentFindAndCountAll: [],
    notifications: [],
    transactions: [],
  }

  const commentRecord =
    comment === undefined ? createCommentRecord() : comment

  const sequelize = {
    async transaction(callback) {
      const transaction = {
        id: `transaction-${calls.transactions.length + 1}`,
        committed: false,
        rolledBack: false,
      }
      calls.transactions.push(transaction)

      try {
        const result = await callback(transaction)
        transaction.committed = true
        return result
      } catch (error) {
        transaction.rolledBack = true
        throw error
      }
    },
  }

  const notificationCreationService = {
    async createNotification(input) {
      calls.notifications.push(input)

      if (notificationError) throw notificationError

      return { id: 'notification-id', ...input }
    },
  }

  const service = createCommentService({
    Post: {
      async findOne(options) {
        calls.postFindOne.push(options)
        return post
      },
    },
    Comment: {
      async create(values, options) {
        calls.commentCreate.push({ values, options })

        if (createError) throw createError

        return commentRecord
      },
      async findOne(options) {
        calls.commentFindOne.push(options)
        return commentRecord
      },
      async findAndCountAll(options) {
        calls.commentFindAndCountAll.push(options)
        return commentsResult || { count: 0, rows: [] }
      },
    },
    User: {
      async findByPk(id, options) {
        calls.userFindByPk.push({ id, options })
        return actorUser === undefined
          ? { id: OTHER_ID, fullName: 'Grace Hopper' }
          : actorUser
      },
    },
    sequelize,
    notificationCreationService,
  })

  return { service, calls, commentRecord }
}

test('listComments checks visible parent, orders oldest first and paginates', async () => {
  const comment = createCommentRecord()
  const { service, calls } = createService({
    comment,
    commentsResult: { count: 3, rows: [comment] },
  })

  const result = await service.listComments(POST_ID, {
    page: 2,
    limit: 1,
  })

  assert.deepEqual(calls.postFindOne[0].where, { id: POST_ID })
  const postAuthorInclude = calls.postFindOne[0].include[0]
  assert.equal(postAuthorInclude.as, 'author')
  assert.equal(postAuthorInclude.required, true)
  assert.deepEqual(postAuthorInclude.where, { status: 'active' })

  const query = calls.commentFindAndCountAll[0]
  assert.deepEqual(query.where, { postId: POST_ID })
  assert.deepEqual(query.order, [
    ['createdAt', 'ASC'],
    ['id', 'ASC'],
  ])
  assert.equal(query.limit, 1)
  assert.equal(query.offset, 1)
  assert.equal(query.distinct, true)

  const authorInclude = query.include.find(
    (include) => include.as === 'author',
  )
  assert.equal(authorInclude.required, true)
  assert.deepEqual(authorInclude.where, { status: 'active' })

  assert.equal(result.comments.length, 1)
  assert.equal(result.comments[0].id, COMMENT_ID)
  assert.equal(result.comments[0].postId, undefined)
  assert.equal(result.comments[0].userId, undefined)
  assert.equal(result.comments[0].author.email, undefined)
  assert.deepEqual(result.pagination, {
    page: 2,
    limit: 1,
    total: 3,
    totalPages: 3,
    hasNextPage: true,
    hasPreviousPage: true,
  })
})

test('listComments filters rows whose author is not active defensively', async () => {
  const suspendedComment = createCommentRecord({
    author: { ...author, status: 'suspended' },
  })
  const { service } = createService({
    commentsResult: { count: 1, rows: [suspendedComment] },
  })

  const result = await service.listComments(POST_ID, {
    page: 1,
    limit: 20,
  })

  assert.deepEqual(result.comments, [])
  assert.equal(result.pagination.total, 1)
})

test('comment reads return POST_NOT_FOUND when the parent post is missing or hidden', async () => {
  const { service, calls } = createService({ post: null })

  await assert.rejects(
    service.listComments(POST_ID, { page: 1, limit: 20 }),
    (error) => {
      assert.ok(error instanceof PostNotFoundError)
      assert.equal(error.code, 'POST_NOT_FOUND')
      assert.equal(error.status, 404)
      return true
    },
  )
  assert.equal(calls.commentFindAndCountAll.length, 0)

  await assert.rejects(
    service.createComment(OWNER_ID, POST_ID, { content: 'Hello' }),
    PostNotFoundError,
  )
  assert.equal(calls.commentCreate.length, 0)
})

test('createComment assigns the authenticated author and returns a safe comment', async () => {
  const { service, calls, commentRecord } = createService()

  const comment = await service.createComment(OWNER_ID, POST_ID, {
    content: 'A comment',
    userId: OTHER_ID,
    postId: '55555555-5555-4555-8555-555555555555',
  })

  assert.deepEqual(calls.commentCreate[0].values, {
    content: 'A comment',
    postId: POST_ID,
    userId: OWNER_ID,
  })
  assert.equal(comment.id, commentRecord.id)
  assert.equal(comment.postId, undefined)
  assert.equal(comment.userId, undefined)
  assert.equal(comment.author.id, OWNER_ID)
  assert.equal(comment.author.status, undefined)
  assert.equal(comment.author.email, undefined)
  assert.deepEqual(calls.commentFindOne[0].where, {
    id: COMMENT_ID,
    postId: POST_ID,
  })

  // The commenter owns the post, so no notification is created.
  assert.deepEqual(calls.userFindByPk, [])
  assert.deepEqual(calls.notifications, [])
  assert.equal(calls.transactions.length, 1)
  assert.equal(calls.transactions[0].committed, true)
})

test('createComment notifies the post author with a safe comment reference', async () => {
  const { service, calls } = createService({
    post: { id: POST_ID, author: { id: OWNER_ID } },
  })

  await service.createComment(OTHER_ID, POST_ID, {
    content: 'A comment',
  })

  assert.deepEqual(calls.userFindByPk, [
    {
      id: OTHER_ID,
      options: { attributes: ['id', 'fullName'] },
    },
  ])
  assert.equal(calls.transactions.length, 1)
  assert.deepEqual(calls.notifications, [
    {
      recipientId: OWNER_ID,
      actorId: OTHER_ID,
      type: 'post_comment',
      message: 'Grace Hopper commented on your post.',
      referenceType: 'comment',
      referenceId: COMMENT_ID,
      transaction: calls.transactions[0],
    },
  ])
  assert.equal(
    calls.commentCreate[0].options.transaction,
    calls.transactions[0],
  )
  assert.equal(calls.transactions[0].committed, true)
  assert.equal(calls.transactions[0].rolledBack, false)
})

test('createComment rolls the comment back when notification creation fails', async () => {
  const notificationError = new Error('notification write failed')
  const { service, calls } = createService({ notificationError })

  await assert.rejects(
    service.createComment(OTHER_ID, POST_ID, {
      content: 'A comment',
    }),
    notificationError,
  )

  assert.equal(calls.commentCreate.length, 1)
  assert.equal(calls.notifications.length, 1)
  assert.equal(calls.transactions.length, 1)
  assert.equal(calls.transactions[0].committed, false)
  assert.equal(calls.transactions[0].rolledBack, true)
  assert.equal(
    calls.notifications[0].transaction,
    calls.transactions[0],
  )
})

test('createComment does not notify when comment creation fails', async () => {
  const createError = new Error('comment write failed')
  const { service, calls } = createService({ createError })

  await assert.rejects(
    service.createComment(OTHER_ID, POST_ID, {
      content: 'A comment',
    }),
    createError,
  )

  assert.equal(calls.commentCreate.length, 1)
  assert.deepEqual(calls.notifications, [])
  assert.equal(calls.transactions.length, 1)
  assert.equal(calls.transactions[0].rolledBack, true)
})

test('updateComment scopes the comment to its post and rejects non-authors', async () => {
  const { service, calls, commentRecord } = createService()

  await assert.rejects(
    service.updateComment(OTHER_ID, POST_ID, COMMENT_ID, {
      content: 'Hacked',
    }),
    (error) => {
      assert.ok(error instanceof CommentAccessDeniedError)
      assert.equal(error.code, 'COMMENT_ACCESS_DENIED')
      assert.equal(error.status, 403)
      return true
    },
  )

  assert.deepEqual(calls.commentFindOne[0].where, {
    id: COMMENT_ID,
    postId: POST_ID,
  })
  assert.equal(commentRecord.updates.length, 0)
})

test('updateComment updates for the author and returns the refreshed comment', async () => {
  const { service, calls, commentRecord } = createService()

  const updated = await service.updateComment(
    OWNER_ID,
    POST_ID,
    COMMENT_ID,
    { content: 'Edited' },
  )

  assert.deepEqual(commentRecord.updates[0], { content: 'Edited' })
  assert.equal(calls.commentFindOne.length, 2)
  assert.deepEqual(calls.commentFindOne[1].where, {
    id: COMMENT_ID,
    postId: POST_ID,
  })
  assert.equal(updated.content, 'Edited')
  assert.equal(updated.postId, undefined)
  assert.equal(updated.userId, undefined)
})

test('updateComment returns COMMENT_NOT_FOUND for a missing or cross-post comment', async () => {
  const { service, calls } = createService({ comment: null })

  await assert.rejects(
    service.updateComment(OWNER_ID, POST_ID, COMMENT_ID, {
      content: 'Edited',
    }),
    (error) => {
      assert.ok(error instanceof CommentNotFoundError)
      assert.equal(error.code, 'COMMENT_NOT_FOUND')
      assert.equal(error.status, 404)
      return true
    },
  )
  assert.deepEqual(calls.commentFindOne[0].where, {
    id: COMMENT_ID,
    postId: POST_ID,
  })
})

test('updateComment checks the parent post before the comment', async () => {
  const { service, calls } = createService({ post: null })

  await assert.rejects(
    service.updateComment(OWNER_ID, POST_ID, COMMENT_ID, {
      content: 'Edited',
    }),
    PostNotFoundError,
  )
  assert.equal(calls.commentFindOne.length, 0)
})

test('deleteComment rejects non-authors and deletes for the author', async () => {
  const nonAuthor = createService()
  await assert.rejects(
    nonAuthor.service.deleteComment(
      OTHER_ID,
      POST_ID,
      COMMENT_ID,
    ),
    CommentAccessDeniedError,
  )
  assert.equal(nonAuthor.commentRecord.destroyed, undefined)

  const owner = createService()
  await owner.service.deleteComment(OWNER_ID, POST_ID, COMMENT_ID)
  assert.equal(owner.commentRecord.destroyed, true)
  assert.deepEqual(owner.calls.commentFindOne[0].where, {
    id: COMMENT_ID,
    postId: POST_ID,
  })
})

test('deleteComment returns COMMENT_NOT_FOUND for a missing or cross-post comment', async () => {
  const { service } = createService({ comment: null })

  await assert.rejects(
    service.deleteComment(OWNER_ID, POST_ID, COMMENT_ID),
    CommentNotFoundError,
  )
})
