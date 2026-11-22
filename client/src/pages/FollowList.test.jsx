import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import FollowList from './FollowList'
import { getFollowers, getFollowing } from '../services/users'

vi.mock('../services/users', () => ({
  getFollowers: vi.fn(),
  getFollowing: vi.fn(),
}))

const mockGetFollowers = vi.mocked(getFollowers)
const mockGetFollowing = vi.mocked(getFollowing)

const renderFollowList = (userId = 'user-1', type = 'followers') => {
  return render(
    <MemoryRouter initialEntries={[`/users/${userId}/${type}`]}>
      <Routes>
        <Route path="users/:userId/:type" element={<FollowList />} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
})

afterEach(() => {
  sessionStorage.clear()
})

describe('FollowList rendering', () => {
  it('shows loading state while fetching followers', () => {
    mockGetFollowers.mockImplementation(() => new Promise(() => {}))
    renderFollowList('user-1', 'followers')
    expect(screen.getByText(/Loading followers\.\.\./)).toBeInTheDocument()
  })

  it('renders the followers list', async () => {
    mockGetFollowers.mockResolvedValue({
      followers: [
        {
          user: { id: 'u1', fullName: 'Ada Lovelace', profileImage: '' },
          followedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          user: { id: 'u2', fullName: 'Bob', profileImage: '' },
          followedAt: '2026-02-01T00:00:00.000Z',
        },
      ],
      pagination: { page: 1, limit: 20, total: 2, pages: 1 },
    })
    renderFollowList('user-1', 'followers')
    await waitFor(() => {
      expect(screen.getByText('Followers')).toBeInTheDocument()
    })
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('renders the following list', async () => {
    mockGetFollowing.mockResolvedValue({
      following: [
        {
          user: { id: 'u3', fullName: 'Charlie', profileImage: '' },
          followedAt: '2026-03-01T00:00:00.000Z',
        },
      ],
      pagination: { page: 1, limit: 20, total: 1, pages: 1 },
    })
    renderFollowList('user-1', 'following')
    await waitFor(() => {
      expect(screen.getByText('Following')).toBeInTheDocument()
    })
    expect(screen.getByText('Charlie')).toBeInTheDocument()
  })

  it('shows empty state when there are no followers', async () => {
    mockGetFollowers.mockResolvedValue({
      followers: [],
      pagination: { page: 1, limit: 20, total: 0, pages: 0 },
    })
    renderFollowList('user-1', 'followers')
    await waitFor(() => {
      expect(screen.getByText('No followers yet.')).toBeInTheDocument()
    })
  })

  it('shows error when the list fails to load', async () => {
    mockGetFollowers.mockRejectedValue(new Error('Failed to load followers.'))
    renderFollowList('user-1', 'followers')
    await waitFor(() => {
      expect(screen.getByText(/Failed to load followers/)).toBeInTheDocument()
    })
  })

  it('renders a back link to the profile', async () => {
    mockGetFollowers.mockResolvedValue({
      followers: [],
      pagination: { page: 1, limit: 20, total: 0, pages: 0 },
    })
    renderFollowList('user-1', 'followers')
    await waitFor(() => {
      expect(screen.getByText('No followers yet.')).toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: '← Back to profile' })).toBeInTheDocument()
  })
})
