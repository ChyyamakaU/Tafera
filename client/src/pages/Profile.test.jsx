import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { cleanup, render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../contexts/AuthContext'
import Profile from './Profile'
import {
  getProfile,
  updateProfile,
  uploadProfileImage,
  checkAuth,
} from '../services/auth'
import { fetchUserComments, fetchUserMedia } from '../services/users'
import { fetchUserPosts } from '../services/posts'

vi.mock('../services/auth', () => ({
  checkAuth: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  verifyEmail: vi.fn(),
  resendVerification: vi.fn(),
  fetchCsrfToken: vi.fn(),
  getPendingAction: vi.fn(),
  clearPendingAction: vi.fn(),
  setPendingAction: vi.fn(),
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
  uploadProfileImage: vi.fn(),
}))

vi.mock('../services/users', () => ({
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

const mockGetProfile = vi.mocked(getProfile)
const mockUpdateProfile = vi.mocked(updateProfile)
const mockUploadProfileImage = vi.mocked(uploadProfileImage)
const mockCheckAuth = vi.mocked(checkAuth)
const mockFetchUserPosts = vi.mocked(fetchUserPosts)
const mockFetchUserMedia = vi.mocked(fetchUserMedia)
const mockFetchUserComments = vi.mocked(fetchUserComments)

const renderProfile = () => {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/profile']}>
        <Profile />
      </MemoryRouter>
    </AuthProvider>
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  mockCheckAuth.mockResolvedValue({
    isAuthenticated: true,
    user: { id: '1', email: 'test@example.com', fullName: 'Test User', emailVerified: true },
  })
  mockFetchUserPosts.mockResolvedValue({ posts: [], pagination: { page: 1, limit: 20, total: 0, hasNextPage: false } })
  mockFetchUserMedia.mockResolvedValue({ media: [], pagination: { page: 1, limit: 20, total: 0, hasNextPage: false } })
  mockFetchUserComments.mockResolvedValue({ comments: [], pagination: { page: 1, limit: 20, total: 0, hasNextPage: false } })
})

afterEach(() => {
  cleanup()
  sessionStorage.clear()
})

describe('Profile page rendering', () => {
  it('waits for session restoration before loading the current user profile', async () => {
    let restoreSession
    mockCheckAuth.mockReturnValue(new Promise((resolve) => { restoreSession = resolve }))
    mockGetProfile.mockResolvedValue({ id: '1', fullName: 'Restored traveller' })
    renderProfile()

    expect(mockGetProfile).not.toHaveBeenCalled()
    restoreSession({ isAuthenticated: true, user: { id: '1', fullName: 'Restored traveller' } })

    expect(await screen.findByRole('button', { name: 'Edit Profile' })).toBeInTheDocument()
    expect(mockGetProfile).toHaveBeenCalledTimes(1)
  })

  it('shows a read-only profile until editing is requested', async () => {
    mockGetProfile.mockResolvedValue({
          id: '1',
          email: 'test@example.com',
          fullName: 'Test User',
          bio: 'A test user.',
          profileImage: 'https://example.com/photo.jpg',
    })
    renderProfile()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit Profile' })).toBeInTheDocument()
    })
    expect(screen.queryByLabelText('Full name')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Profile' }))
    expect(screen.getByLabelText('Full name')).toBeInTheDocument()
    expect(screen.getByLabelText('Bio')).toBeInTheDocument()
    expect(screen.getByLabelText('Upload profile photo')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Posts' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Media' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Comments' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save profile' })).toBeInTheDocument()
  })

  it('shows error when profile fetch fails', async () => {
    mockCheckAuth.mockResolvedValue({
      isAuthenticated: true,
      user: { id: '1', email: 'test@example.com', fullName: 'Test User', emailVerified: true },
    })
    mockGetProfile.mockRejectedValue(new Error('Failed to load profile.'))
    renderProfile()
    await waitFor(() => {
      expect(screen.getByText(/Failed to load profile/)).toBeInTheDocument()
    })
  })

  it('pre-fills form with profile data', async () => {
    mockCheckAuth.mockResolvedValue({
      isAuthenticated: true,
      user: { id: '1', email: 'test@example.com', fullName: 'Test User', emailVerified: true },
    })
    mockGetProfile.mockResolvedValue({
          id: '1',
          email: 'test@example.com',
          fullName: 'Ada Lovelace',
          bio: 'Mathematician and writer.',
          profileImage: 'https://example.com/ada.jpg',
    })
    renderProfile()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Profile' }))
    await waitFor(() => {
      expect(screen.getByLabelText('Full name')).toHaveValue('Ada Lovelace')
      expect(screen.getByLabelText('Bio')).toHaveValue('Mathematician and writer.')
      expect(screen.getByLabelText('Upload profile photo')).toBeInTheDocument()
    })
  })
})

describe('Profile update', () => {
  it('updates profile on successful submission', async () => {
    mockCheckAuth.mockResolvedValue({
      isAuthenticated: true,
      user: { id: '1', email: 'test@example.com', fullName: 'Test User', emailVerified: true },
    })
    mockGetProfile.mockResolvedValue({
          id: '1',
          email: 'test@example.com',
          fullName: 'Test User',
          bio: '',
          profileImage: '',
    })
    mockUpdateProfile.mockResolvedValue({
          id: '1',
          email: 'test@example.com',
          fullName: 'Updated Name',
          bio: 'Updated bio.',
          profileImage: 'https://example.com/new.jpg',
    })
    renderProfile()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Profile' }))
    await waitFor(() => {
      expect(screen.getByLabelText('Full name')).toHaveValue('Test User')
    })
    fireEvent.input(screen.getByLabelText('Full name'), {
      target: { value: 'Updated Name' },
    })
    fireEvent.input(screen.getByLabelText('Bio'), {
      target: { value: 'Updated bio.' },
    })
    fireEvent.submit(screen.getByRole('button', { name: 'Save profile' }).closest('form'))
    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({
        fullName: 'Updated Name',
        username: null,
        bio: 'Updated bio.',
        city: null,
        state: null,
        websiteUrl: null,
        instagramUrl: null,
        tiktokUrl: null,
        youtubeUrl: null,
      })
    })
    await waitFor(() => {
      expect(screen.getByText(/Profile updated successfully/)).toBeInTheDocument()
    })
  })

  it('shows error on profile update failure', async () => {
    mockCheckAuth.mockResolvedValue({
      isAuthenticated: true,
      user: { id: '1', email: 'test@example.com', fullName: 'Test User', emailVerified: true },
    })
    mockGetProfile.mockResolvedValue({
          id: '1',
          email: 'test@example.com',
          fullName: 'Test User',
          bio: '',
          profileImage: '',
    })
    mockUpdateProfile.mockRejectedValue(new Error('Profile update failed.'))
    renderProfile()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Profile' }))
    await waitFor(() => {
      expect(screen.getByLabelText('Full name')).toHaveValue('Test User')
    })
    fireEvent.input(screen.getByLabelText('Full name'), {
      target: { value: 'Updated Name' },
    })
    fireEvent.submit(screen.getByRole('button', { name: 'Save profile' }).closest('form'))
    await waitFor(() => {
      expect(screen.getByText(/Profile update failed/)).toBeInTheDocument()
    })
  })

  it('does not submit empty form', async () => {
    mockCheckAuth.mockResolvedValue({
      isAuthenticated: true,
      user: { id: '1', email: 'test@example.com', fullName: 'Test User', emailVerified: true },
    })
    mockGetProfile.mockResolvedValue({
          id: '1',
          email: 'test@example.com',
          fullName: 'Test User',
          bio: '',
          profileImage: '',
    })
    renderProfile()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Profile' }))
    await waitFor(() => {
      expect(screen.getByLabelText('Full name')).toHaveValue('Test User')
    })
    // Clear fullName to simulate an empty form
    fireEvent.input(screen.getByLabelText('Full name'), {
      target: { value: '' },
    })
    fireEvent.submit(screen.getByRole('button', { name: 'Save profile' }).closest('form'))
    await waitFor(() => {
      expect(mockUpdateProfile).not.toHaveBeenCalled()
    })
  })
})

describe('Traveller profile content and photo', () => {
  it('automatically loads and displays Posts, Media, and Comments on profile open without tab clicks', async () => {
    mockFetchUserPosts.mockResolvedValue({
      posts: [{ id: 'post-1', content: 'A trip to Abuja', createdAt: '2026-01-01', likeCount: 2, isLiked: false, isSaved: false }],
      pagination: { page: 1, limit: 20, total: 1, hasNextPage: false },
    })
    mockFetchUserMedia.mockResolvedValue({
      media: [{ id: 'media-1', imageUrl: 'https://images.example/abuja.jpg', altText: 'Zuma Rock sunrise', post: { id: 'post-1', content: 'A trip to Abuja' } }],
      pagination: { page: 1, limit: 20, total: 1, hasNextPage: false },
    })
    mockFetchUserComments.mockResolvedValue({
      comments: [{ id: 'comment-1', content: 'Such an unforgettable morning!', createdAt: '2026-01-02', post: { id: 'post-2', content: 'Calabar street food' } }],
      pagination: { page: 1, limit: 20, total: 1, hasNextPage: false },
    })
    mockGetProfile.mockResolvedValue({ id: '1', fullName: 'Test User' })

    renderProfile()

    const postsSection = await screen.findByRole('region', { name: 'Posts' })
    const mediaSection = await screen.findByRole('region', { name: 'Media' })
    const commentsSection = await screen.findByRole('region', { name: 'Comments' })

    expect(await within(postsSection).findByText('A trip to Abuja')).toBeInTheDocument()
    expect(await within(mediaSection).findByAltText('Zuma Rock sunrise')).toBeInTheDocument()
    expect(await within(commentsSection).findByText('Such an unforgettable morning!')).toBeInTheDocument()
    expect(mockFetchUserPosts).toHaveBeenCalledWith('1', { page: 1, limit: 20 })
    expect(mockFetchUserMedia).toHaveBeenCalledWith('1', { page: 1, limit: 20 })
    expect(mockFetchUserComments).toHaveBeenCalledWith('1', { page: 1, limit: 20 })

    // Opening a media tile opens the preview lightbox
    fireEvent.click(within(mediaSection).getByRole('button', { name: /View media: Zuma Rock sunrise/i }))
    expect(screen.getByRole('dialog', { name: 'Media preview' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'Media preview' })).not.toBeInTheDocument()

    // Filtering via tabs narrows the visible sections cleanly
    fireEvent.click(screen.getByRole('tab', { name: 'Comments' }))
    expect(screen.getByText('Such an unforgettable morning!')).toBeInTheDocument()
    expect(screen.queryByAltText('Zuma Rock sunrise')).not.toBeInTheDocument()
  })

  it('keeps Posts and Media visible when Comments fails to load and allows retrying Comments', async () => {
    mockFetchUserPosts.mockResolvedValue({
      posts: [{ id: 'post-1', content: 'Weekend in Enugu', createdAt: '2026-02-01' }],
      pagination: { page: 1, limit: 20, total: 1, hasNextPage: false },
    })
    mockFetchUserMedia.mockResolvedValue({
      media: [{ id: 'media-1', imageUrl: 'https://images.example/enugu.jpg', altText: 'Ngwo Pine Forest' }],
      pagination: { page: 1, limit: 20, total: 1, hasNextPage: false },
    })
    mockFetchUserComments
      .mockRejectedValueOnce(new Error('Could not fetch comments.'))
      .mockResolvedValueOnce({
        comments: [{ id: 'comment-2', content: 'Recovered comment', createdAt: '2026-02-02', post: { id: 'post-1', content: 'Weekend in Enugu' } }],
        pagination: { page: 1, limit: 20, total: 1, hasNextPage: false },
      })
    mockGetProfile.mockResolvedValue({ id: '1', fullName: 'Test User' })

    renderProfile()

    expect(await screen.findByText('Weekend in Enugu')).toBeInTheDocument()
    expect(await screen.findByAltText('Ngwo Pine Forest')).toBeInTheDocument()
    expect(await screen.findByText('Could not fetch comments.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('Recovered comment')).toBeInTheDocument()
  })

  it('uploads an accepted device photo through the profile upload service', async () => {
    mockCheckAuth.mockResolvedValue({ isAuthenticated: true, user: { id: '1', email: 'test@example.com', fullName: 'Test User', emailVerified: true } })
    mockGetProfile.mockResolvedValue({ id: '1', fullName: 'Test User' })
    mockUploadProfileImage.mockResolvedValue({ id: '1', fullName: 'Test User', profileImage: 'https://images.example/avatar.jpg' })
    renderProfile()
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Profile' }))
    const file = new File(['image-bytes'], 'avatar.png', { type: 'image/png' })
    fireEvent.change(await screen.findByLabelText('Upload profile photo'), { target: { files: [file] } })
    await waitFor(() => expect(mockUploadProfileImage).toHaveBeenCalledWith(file))
  })
})
