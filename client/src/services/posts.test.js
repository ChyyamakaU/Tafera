import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deletePostImage,
  fetchPersonalizedPosts,
  fetchSavedPosts,
  likePost,
  savePost,
  unlikePost,
  unsavePost,
  updatePostImage,
} from './posts'
import { request } from './api'
import { fetchCsrfToken } from './auth'

vi.mock('./api', () => ({ request: vi.fn() }))
vi.mock('./auth', () => ({ fetchCsrfToken: vi.fn() }))

const post = (id, createdAt, authorId) => ({
  id,
  createdAt,
  author: { id: authorId },
})

beforeEach(() => {
  vi.resetAllMocks()
  fetchCsrfToken.mockResolvedValue('csrf-token-123')
})

describe('fetchPersonalizedPosts', () => {
  it('combines own posts with followed posts, deduplicates, and sorts newest first', async () => {
    const shared = post('shared', '2026-11-20T10:00:00Z', 'self')
    request.mockImplementation((url) => {
      if (url.startsWith('/api/posts/following')) {
        return Promise.resolve({ data: { posts: [post('followed', '2026-11-20T12:00:00Z', 'friend'), shared], pagination: { hasNextPage: false } } })
      }
      return Promise.resolve({ data: { posts: [shared, post('own-older', '2026-11-19T12:00:00Z', 'self')], pagination: { hasNextPage: true } } })
    })

    const result = await fetchPersonalizedPosts('self-id', { page: 1, limit: 20 })

    expect(request).toHaveBeenCalledTimes(2)
    expect(request).toHaveBeenCalledWith('/api/posts/following?page=1&limit=20')
    expect(request).toHaveBeenCalledWith('/api/users/self-id/posts?page=1&limit=20')
    expect(result.posts.map((item) => item.id)).toEqual(['followed', 'shared', 'own-older'])
    expect(result.pagination.hasNextPage).toBe(true)
  })
})

describe('post likes and saved posts services', () => {
  it('fetches paginated saved posts', async () => {
    const saved = post('saved-1', '2026-11-21T10:00:00Z', 'friend')
    request.mockResolvedValueOnce({
      data: { posts: [saved], pagination: { page: 2, limit: 10, hasNextPage: false } },
    })

    const result = await fetchSavedPosts({ page: 2, limit: 10 })

    expect(request).toHaveBeenCalledWith('/api/posts/saved?page=2&limit=10')
    expect(result.posts).toEqual([saved])
    expect(result.pagination.page).toBe(2)
  })

  it('sends CSRF tokens on like, unlike, save, and unsave mutations', async () => {
    request
      .mockResolvedValueOnce({ data: { postId: 'post-1', liked: true, likeCount: 4 } })
      .mockResolvedValueOnce({ data: { postId: 'post-1', liked: false, likeCount: 3 } })
      .mockResolvedValueOnce({ data: { postId: 'post-1', saved: true } })
      .mockResolvedValueOnce({ data: { postId: 'post-1', saved: false } })

    expect(await likePost('post-1')).toEqual({ postId: 'post-1', liked: true, likeCount: 4 })
    expect(await unlikePost('post-1')).toEqual({ postId: 'post-1', liked: false, likeCount: 3 })
    expect(await savePost('post-1')).toEqual({ postId: 'post-1', saved: true })
    expect(await unsavePost('post-1')).toEqual({ postId: 'post-1', saved: false })

    expect(request).toHaveBeenNthCalledWith(1, '/api/posts/post-1/like', {
      method: 'POST',
      headers: { 'X-CSRF-Token': 'csrf-token-123' },
    })
    expect(request).toHaveBeenNthCalledWith(2, '/api/posts/post-1/like', {
      method: 'DELETE',
      headers: { 'X-CSRF-Token': 'csrf-token-123' },
    })
    expect(request).toHaveBeenNthCalledWith(3, '/api/posts/post-1/save', {
      method: 'POST',
      headers: { 'X-CSRF-Token': 'csrf-token-123' },
    })
    expect(request).toHaveBeenNthCalledWith(4, '/api/posts/post-1/save', {
      method: 'DELETE',
      headers: { 'X-CSRF-Token': 'csrf-token-123' },
    })
  })

  it('sends CSRF tokens on post image update and delete mutations', async () => {
    request
      .mockResolvedValueOnce({ data: { image: { id: 'img-1', altText: 'Harbour view', displayOrder: 1 } } })
      .mockResolvedValueOnce(null)

    const updated = await updatePostImage('post-1', 'img-1', { altText: 'Harbour view', displayOrder: 1 })
    expect(updated).toEqual({ id: 'img-1', altText: 'Harbour view', displayOrder: 1 })
    await deletePostImage('post-1', 'img-1')

    expect(request).toHaveBeenNthCalledWith(1, '/api/posts/post-1/images/img-1', {
      method: 'PATCH',
      headers: { 'X-CSRF-Token': 'csrf-token-123' },
      body: JSON.stringify({ altText: 'Harbour view', displayOrder: 1 }),
    })
    expect(request).toHaveBeenNthCalledWith(2, '/api/posts/post-1/images/img-1', {
      method: 'DELETE',
      headers: { 'X-CSRF-Token': 'csrf-token-123' },
    })
  })
})
