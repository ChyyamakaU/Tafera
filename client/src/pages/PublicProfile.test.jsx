import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '../contexts/AuthContext'
import PublicProfile from './PublicProfile'
import {
  getPublicProfile,
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
} from '../services/users'
import { checkAuth } from '../services/auth'

vi.mock('../services/users', () => ({
  getPublicProfile: vi.fn(),
  followUser: vi.fn(),
  unfollowUser: vi.fn(),
  getFollowers: vi.fn(),
  getFollowing: vi.fn(),
}))
vi.mock('../services/auth', () => ({
  checkAuth: vi.fn(),
}))

const mockGetPublicProfile = vi.mocked(getPublicProfile)
const mockFollowUser = vi.mocked(followUser)
const mockUnfollowUser = vi.mocked(unfollowUser)
const mockGetFollowers = vi.mocked(getFollowers)
const mockGetFollowing = vi.mocked(getFollowing)
const mockCheckAuth = vi.mocked(checkAuth)

const renderPublicProfile = (userId = 'user-1') => {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[`/users/${userId}`]}>
        <Routes>
          <Route path="users/:userId" element={<PublicProfile />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  mockCheckAuth.mockResolvedValue({
    isAuthenticated: false,
    user: null,
  })
})

afterEach(() => {
  sessionStorage.clear()
})

describe('PublicProfile page rendering', () => {
  it('shows loading state while fetching the profile', () => {
    mockGetPublicProfile.mockImplementation(() => new Promise(() => {}))
    renderPublicProfile('user-1')
    expect(screen.getByText(/Loading profile\.\.\./)).toBeInTheDocument()
  })

  it('renders the public profile data', async () => {
    mockGetPublicProfile.mockResolvedValue({
      id: 'user-1',
      fullName: 'Ada Lovelace',
      bio: 'Mathematician and writer.',
      profileImage: 'https://example.com/ada.jpg',
    })
    mockGetFollowers.mockResolvedValue({
      followers: [],
      pagination: { page: 1, limit: 10, total: 0, pages: 0 },
    })
    mockGetFollowing.mockResolvedValue({
      following: [],
      pagination: { page: 1, limit: 10, total: 0, pages: 0 },
    })
    renderPublicProfile('user-1')
    await waitFor(() => {
      expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    })
    expect(screen.getByText('Mathematician and writer.')).toBeInTheDocument()
  })

  it('shows error when profile fetch fails', async () => {
    mockGetPublicProfile.mockRejectedValue(new Error('This profile could not be found.'))
    renderPublicProfile('missing')
    await waitFor(() => {
      expect(screen.getByText(/This profile could not be found/)).toBeInTheDocument()
    })
  })
})

describe('PublicProfile follow actions (authenticated viewer)', () => {
  beforeEach(() => {
    mockCheckAuth.mockResolvedValue({
      isAuthenticated: true,
      user: { id: 'viewer-1', email: 'viewer@example.com', emailVerified: true },
    })
  })

  it('shows Follow button for an authenticated viewer who is not the owner', async () => {
    mockGetPublicProfile.mockResolvedValue({
      id: 'user-2',
      fullName: 'Ada Lovelace',
      bio: '',
      profileImage: '',
    })
    mockGetFollowers.mockResolvedValue({
      followers: [],
      pagination: { page: 1, limit: 10, total: 0, pages: 0 },
    })
    mockGetFollowing.mockResolvedValue({
      following: [],
      pagination: { page: 1, limit: 10, total: 0, pages: 0 },
    })
    renderPublicProfile('user-2')
    await waitFor(() => {
      expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Follow' })).toBeInTheDocument()
  })

  it('does not show Follow button for the profile owner', async () => {
    mockGetPublicProfile.mockResolvedValue({
      id: 'viewer-1',
      fullName: 'Ada Lovelace',
      bio: '',
      profileImage: '',
    })
    mockGetFollowers.mockResolvedValue({
      followers: [],
      pagination: { page: 1, limit: 10, total: 0, pages: 0 },
    })
    mockGetFollowing.mockResolvedValue({
      following: [],
      pagination: { page: 1, limit: 10, total: 0, pages: 0 },
    })
    renderPublicProfile('viewer-1')
    await waitFor(() => {
      expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: 'Follow' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Unfollow' })).not.toBeInTheDocument()
  })

  it('follows a user on button click', async () => {
    mockGetPublicProfile.mockResolvedValue({
      id: 'user-2',
      fullName: 'Ada Lovelace',
      bio: '',
      profileImage: '',
    })
    mockGetFollowers.mockResolvedValue({
      followers: [],
      pagination: { page: 1, limit: 10, total: 0, pages: 0 },
    })
    mockGetFollowing.mockResolvedValue({
      following: [],
      pagination: { page: 1, limit: 10, total: 0, pages: 0 },
    })
    mockFollowUser.mockResolvedValue({
      user: { id: 'user-2', fullName: 'Ada Lovelace' },
      followedAt: '2026-01-01T00:00:00.000Z',
    })
    renderPublicProfile('user-2')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Follow' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Follow' }))
    await waitFor(() => {
      expect(mockFollowUser).toHaveBeenCalledWith('user-2')
    })
  })

  it('shows error when follow fails', async () => {
    mockGetPublicProfile.mockResolvedValue({
      id: 'user-2',
      fullName: 'Ada Lovelace',
      bio: '',
      profileImage: '',
    })
    mockGetFollowers.mockResolvedValue({
      followers: [],
      pagination: { page: 1, limit: 10, total: 0, pages: 0 },
    })
    mockGetFollowing.mockResolvedValue({
      following: [],
      pagination: { page: 1, limit: 10, total: 0, pages: 0 },
    })
    mockFollowUser.mockRejectedValue(new Error('Follow failed.'))
    renderPublicProfile('user-2')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Follow' })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Follow' }))
    await waitFor(() => {
      expect(screen.getByText(/Follow failed/)).toBeInTheDocument()
    })
  })
})
