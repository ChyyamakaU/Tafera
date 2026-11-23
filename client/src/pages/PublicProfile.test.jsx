import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from '../contexts/AuthContext'
import PublicProfile from './PublicProfile'
import {
  getPublicProfile,
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  fetchUserComments,
  fetchUserMedia,
} from '../services/users'
import { fetchUserPosts } from '../services/posts'
import { checkAuth } from '../services/auth'

vi.mock('../services/users', () => ({
  getPublicProfile: vi.fn(),
  followUser: vi.fn(),
  unfollowUser: vi.fn(),
  getFollowers: vi.fn(),
  getFollowing: vi.fn(),
  fetchUserComments: vi.fn(),
  fetchUserMedia: vi.fn(),
}))
vi.mock('../services/posts', () => ({
  fetchUserPosts: vi.fn(),
  likePost: vi.fn(),
  unlikePost: vi.fn(),
  savePost: vi.fn(),
  unsavePost: vi.fn(),
  updatePost: vi.fn(),
  deletePost: vi.fn(),
  updatePostComment: vi.fn(),
  deletePostComment: vi.fn(),
}))
vi.mock('../services/auth', () => ({
  checkAuth: vi.fn(),
}))

const mockGetPublicProfile = vi.mocked(getPublicProfile)
const mockFollowUser = vi.mocked(followUser)
const mockUnfollowUser = vi.mocked(unfollowUser)
const mockGetFollowers = vi.mocked(getFollowers)
const mockGetFollowing = vi.mocked(getFollowing)
const mockFetchUserPosts = vi.mocked(fetchUserPosts)
const mockFetchUserMedia = vi.mocked(fetchUserMedia)
const mockFetchUserComments = vi.mocked(fetchUserComments)
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
  mockFetchUserPosts.mockResolvedValue({ posts: [], pagination: { page: 1, limit: 20, total: 0, hasNextPage: false } })
  mockFetchUserMedia.mockResolvedValue({ media: [], pagination: { page: 1, limit: 20, total: 0, hasNextPage: false } })
  mockFetchUserComments.mockResolvedValue({ comments: [], pagination: { page: 1, limit: 20, total: 0, hasNextPage: false } })
})

afterEach(() => {
  cleanup()
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

  it('shows error inline on the same page when follow fails', async () => {
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
      expect(screen.getByRole('alert')).toHaveTextContent(/Follow failed/)
    })
    // User remains on Ada Lovelace's profile page
    expect(screen.getByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument()
  })

  it('stays on the same page, shows inline status, and syncs button to Following on FOLLOW_EXISTS', async () => {
    mockGetPublicProfile.mockResolvedValue({
      id: 'user-2',
      fullName: 'Ada Lovelace',
      bio: 'Explorer',
      profileImage: '',
    })
    mockGetFollowers.mockResolvedValue({
      followers: [],
      pagination: { page: 1, limit: 10, total: 1, pages: 1 },
    })
    mockGetFollowing.mockResolvedValue({
      following: [],
      pagination: { page: 1, limit: 10, total: 0, pages: 0 },
    })
    const conflictErr = new Error('You already follow this user.')
    conflictErr.code = 'FOLLOW_EXISTS'
    conflictErr.status = 409
    mockFollowUser.mockRejectedValueOnce(conflictErr)
    mockUnfollowUser.mockResolvedValueOnce(undefined)

    renderPublicProfile('user-2')
    fireEvent.click(await screen.findByRole('button', { name: 'Follow' }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      "You're already following this traveller.",
    )
    expect(screen.getByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument()
    const syncedButton = screen.getByRole('button', { name: 'Following' })
    expect(syncedButton).toHaveAttribute('aria-pressed', 'true')

    // Clicking the synced Following button now triggers unfollow cleanly
    fireEvent.click(syncedButton)
    await waitFor(() => expect(mockUnfollowUser).toHaveBeenCalledWith('user-2'))
    expect(await screen.findByRole('button', { name: 'Follow' })).toBeInTheDocument()
  })
})

describe('PublicProfile automatic Posts, Media, and Comments loading', () => {
  it('immediately displays Posts, Media, and Comments on open and refreshes all three when switching profiles', async () => {
    mockGetPublicProfile.mockImplementation(async (id) =>
      id === 'user-1'
        ? { id: 'user-1', fullName: 'Ada Lovelace', bio: 'Explorer' }
        : { id: 'user-2', fullName: 'Tunde Bakare', bio: 'Hiker' },
    )
    mockGetFollowers.mockImplementation(async (id) => ({
      followers:
        id === 'user-1'
          ? [{ user: { id: 'user-2', fullName: 'Tunde Bakare' }, followedAt: '2026-01-01T00:00:00.000Z' }]
          : [],
      pagination: { page: 1, limit: 10, total: id === 'user-1' ? 1 : 0, pages: 1 },
    }))
    mockGetFollowing.mockResolvedValue({
      following: [],
      pagination: { page: 1, limit: 10, total: 0, pages: 0 },
    })
    mockFetchUserPosts.mockImplementation(async (id) => ({
      posts:
        id === 'user-1'
          ? [{ id: 'p-1', content: 'Ada explores Obudu', createdAt: '2026-01-10', likeCount: 3 }]
          : [{ id: 'p-2', content: 'Tunde hikes Idanre Hills', createdAt: '2026-01-12', likeCount: 5 }],
      pagination: { page: 1, limit: 20, total: 1, hasNextPage: false },
    }))
    mockFetchUserMedia.mockImplementation(async (id) => ({
      media:
        id === 'user-1'
          ? [{ id: 'm-1', imageUrl: 'https://images.example/obudu.jpg', altText: 'Obudu mist' }]
          : [{ id: 'm-2', imageUrl: 'https://images.example/idanre.jpg', altText: 'Idanre ridge' }],
      pagination: { page: 1, limit: 20, total: 1, hasNextPage: false },
    }))
    mockFetchUserComments.mockImplementation(async (id) => ({
      comments:
        id === 'user-1'
          ? [{ id: 'c-1', content: 'Ada loved the cable car!', createdAt: '2026-01-11', post: { id: 'p-9', content: 'Mountain guide' } }]
          : [{ id: 'c-2', content: 'Tunde recommends sunrise trails.', createdAt: '2026-01-13', post: { id: 'p-10', content: 'Ondo trip' } }],
      pagination: { page: 1, limit: 20, total: 1, hasNextPage: false },
    }))

    renderPublicProfile('user-1')

    // User 1 content renders immediately without any tab click
    expect(await screen.findByText('Ada explores Obudu')).toBeInTheDocument()
    expect(await screen.findByAltText('Obudu mist')).toBeInTheDocument()
    expect(await screen.findByText('Ada loved the cable car!')).toBeInTheDocument()

    // Navigate to User 2 via the follower profile link
    fireEvent.click(screen.getByRole('link', { name: 'Tunde Bakare' }))

    // All three sections refresh accurately for User 2
    expect(await screen.findByText('Tunde hikes Idanre Hills')).toBeInTheDocument()
    expect(await screen.findByAltText('Idanre ridge')).toBeInTheDocument()
    expect(await screen.findByText('Tunde recommends sunrise trails.')).toBeInTheDocument()
    expect(screen.queryByText('Ada explores Obudu')).not.toBeInTheDocument()
    expect(screen.queryByAltText('Obudu mist')).not.toBeInTheDocument()
    expect(screen.queryByText('Ada loved the cable car!')).not.toBeInTheDocument()
  })
})
