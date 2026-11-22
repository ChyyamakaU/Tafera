import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  getPublicProfile,
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
} from './users'
import { request } from './api'
import { fetchCsrfToken } from './auth'

vi.mock('./api', () => ({
  request: vi.fn(),
}))
vi.mock('./auth', () => ({
  fetchCsrfToken: vi.fn(),
}))

const mockRequest = vi.mocked(request)
const mockFetchCsrfToken = vi.mocked(fetchCsrfToken)

beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
})

afterEach(() => {
  sessionStorage.clear()
})

describe('getPublicProfile', () => {
  it('fetches the public profile for a user id', async () => {
    mockRequest.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
          fullName: 'Ada Lovelace',
          bio: 'Mathematician.',
          profileImage: 'https://example.com/ada.jpg',
        },
      },
    })

    const result = await getPublicProfile('user-1')

    expect(mockRequest).toHaveBeenCalledWith('/api/users/user-1', {
      method: 'GET',
    })
    expect(result).toEqual({
      id: 'user-1',
      fullName: 'Ada Lovelace',
      bio: 'Mathematician.',
      profileImage: 'https://example.com/ada.jpg',
    })
  })

  it('propagates errors from the API', async () => {
    mockRequest.mockRejectedValue(new Error('Not found'))

    await expect(getPublicProfile('missing')).rejects.toThrow('Not found')
  })
})

describe('followUser', () => {
  it('fetches a csrf token and follows a user', async () => {
    mockFetchCsrfToken.mockResolvedValue('csrf-token-123')
    mockRequest.mockResolvedValue({
      data: {
        follow: {
          user: { id: 'user-2', fullName: 'Ada Lovelace' },
          followedAt: '2026-01-01T00:00:00.000Z',
        },
      },
    })

    const result = await followUser('user-2')

    expect(mockFetchCsrfToken).toHaveBeenCalledTimes(1)
    expect(mockRequest).toHaveBeenCalledWith('/api/users/user-2/follow', {
      method: 'POST',
      headers: { 'X-CSRF-Token': 'csrf-token-123' },
    })
    expect(result).toEqual({
      user: { id: 'user-2', fullName: 'Ada Lovelace' },
      followedAt: '2026-01-01T00:00:00.000Z',
    })
  })
})

describe('unfollowUser', () => {
  it('fetches a csrf token and unfollows a user', async () => {
    mockFetchCsrfToken.mockResolvedValue('csrf-token-123')
    mockRequest.mockResolvedValue(undefined)

    await unfollowUser('user-2')

    expect(mockFetchCsrfToken).toHaveBeenCalledTimes(1)
    expect(mockRequest).toHaveBeenCalledWith('/api/users/user-2/follow', {
      method: 'DELETE',
      headers: { 'X-CSRF-Token': 'csrf-token-123' },
    })
  })
})

describe('getFollowers', () => {
  it('fetches followers with pagination', async () => {
    mockRequest.mockResolvedValue({
      data: {
        followers: [
          { user: { id: 'u1', fullName: 'Ada' }, followedAt: '2026-01-01T00:00:00.000Z' },
        ],
        pagination: { page: 1, limit: 20, total: 1, pages: 1 },
      },
    })

    const result = await getFollowers('user-1', { page: 1, limit: 20 })

    expect(mockRequest).toHaveBeenCalledWith(
      '/api/users/user-1/followers?page=1&limit=20',
      { method: 'GET' },
    )
    expect(result.followers).toHaveLength(1)
    expect(result.pagination.total).toBe(1)
  })

  it('uses default page and limit', async () => {
    mockRequest.mockResolvedValue({ data: { followers: [], pagination: {} } })

    await getFollowers('user-1')

    expect(mockRequest).toHaveBeenCalledWith(
      '/api/users/user-1/followers?page=1&limit=20',
      { method: 'GET' },
    )
  })
})

describe('getFollowing', () => {
  it('fetches following with pagination', async () => {
    mockRequest.mockResolvedValue({
      data: {
        following: [
          { user: { id: 'u2', fullName: 'Bob' }, followedAt: '2026-01-02T00:00:00.000Z' },
        ],
        pagination: { page: 1, limit: 20, total: 1, pages: 1 },
      },
    })

    const result = await getFollowing('user-1', { page: 2, limit: 10 })

    expect(mockRequest).toHaveBeenCalledWith(
      '/api/users/user-1/following?page=2&limit=10',
      { method: 'GET' },
    )
    expect(result.following).toHaveLength(1)
  })
})
