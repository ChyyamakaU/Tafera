import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchPersonalizedPosts } from './posts'
import { request } from './api'

vi.mock('./api', () => ({ request: vi.fn() }))

const post = (id, createdAt, authorId) => ({
  id,
  createdAt,
  author: { id: authorId },
})

beforeEach(() => vi.resetAllMocks())

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
