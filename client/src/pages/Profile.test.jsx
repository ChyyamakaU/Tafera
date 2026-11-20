import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../contexts/AuthContext'
import Profile from './Profile'
import {
  getProfile,
  updateProfile,
  checkAuth,
} from '../services/auth'

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
}))

const mockGetProfile = vi.mocked(getProfile)
const mockUpdateProfile = vi.mocked(updateProfile)
const mockCheckAuth = vi.mocked(checkAuth)

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
})

afterEach(() => {
  sessionStorage.clear()
})

describe('Profile page rendering', () => {
  it('renders profile form elements', async () => {
    mockGetProfile.mockResolvedValue({
      data: {
        user: {
          id: '1',
          email: 'test@example.com',
          fullName: 'Test User',
          bio: 'A test user.',
          profileImage: 'https://example.com/photo.jpg',
        },
      },
    })
    renderProfile()
    await waitFor(() => {
      expect(screen.getByLabelText('Full name')).toBeInTheDocument()
    })
    expect(screen.getByLabelText('Bio')).toBeInTheDocument()
    expect(screen.getByLabelText('Profile image URL')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
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
      data: {
        user: {
          id: '1',
          email: 'test@example.com',
          fullName: 'Ada Lovelace',
          bio: 'Mathematician and writer.',
          profileImage: 'https://example.com/ada.jpg',
        },
      },
    })
    renderProfile()
    await waitFor(() => {
      expect(screen.getByLabelText('Full name')).toHaveValue('Ada Lovelace')
      expect(screen.getByLabelText('Bio')).toHaveValue('Mathematician and writer.')
      expect(screen.getByLabelText('Profile image URL')).toHaveValue(
        'https://example.com/ada.jpg'
      )
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
      data: {
        user: {
          id: '1',
          email: 'test@example.com',
          fullName: 'Test User',
          bio: '',
          profileImage: '',
        },
      },
    })
    mockUpdateProfile.mockResolvedValue({
      data: {
        user: {
          id: '1',
          email: 'test@example.com',
          fullName: 'Updated Name',
          bio: 'Updated bio.',
          profileImage: 'https://example.com/new.jpg',
        },
      },
    })
    renderProfile()
    await waitFor(() => {
      expect(screen.getByLabelText('Full name')).toHaveValue('Test User')
    })
    fireEvent.input(screen.getByLabelText('Full name'), {
      target: { value: 'Updated Name' },
    })
    fireEvent.input(screen.getByLabelText('Bio'), {
      target: { value: 'Updated bio.' },
    })
    fireEvent.input(screen.getByLabelText('Profile image URL'), {
      target: { value: 'https://example.com/new.jpg' },
    })
    fireEvent.submit(screen.getByRole('button', { name: 'Save changes' }).closest('form'))
    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({
        fullName: 'Updated Name',
        bio: 'Updated bio.',
        profileImage: 'https://example.com/new.jpg',
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
      data: {
        user: {
          id: '1',
          email: 'test@example.com',
          fullName: 'Test User',
          bio: '',
          profileImage: '',
        },
      },
    })
    mockUpdateProfile.mockRejectedValue(new Error('Profile update failed.'))
    renderProfile()
    await waitFor(() => {
      expect(screen.getByLabelText('Full name')).toHaveValue('Test User')
    })
    fireEvent.input(screen.getByLabelText('Full name'), {
      target: { value: 'Updated Name' },
    })
    fireEvent.submit(screen.getByRole('button', { name: 'Save changes' }).closest('form'))
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
      data: {
        user: {
          id: '1',
          email: 'test@example.com',
          fullName: 'Test User',
          bio: '',
          profileImage: '',
        },
      },
    })
    renderProfile()
    await waitFor(() => {
      expect(screen.getByLabelText('Full name')).toHaveValue('Test User')
    })
    // Clear fullName to simulate an empty form
    fireEvent.input(screen.getByLabelText('Full name'), {
      target: { value: '' },
    })
    fireEvent.submit(screen.getByRole('button', { name: 'Save changes' }).closest('form'))
    await waitFor(() => {
      expect(mockUpdateProfile).not.toHaveBeenCalled()
    })
  })
})
