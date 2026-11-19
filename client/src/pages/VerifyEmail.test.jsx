import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../contexts/AuthContext'
import VerifyEmail from './VerifyEmail'
import Header from '../components/layout/Header'
import {
  verifyEmail as verifyEmailService,
  resendVerification as resendVerificationService,
  checkAuth as checkAuthService,
} from '../services/auth'

vi.mock('../services/auth', () => ({
  checkAuth: vi.fn(),
  verifyEmail: vi.fn(),
  resendVerification: vi.fn(),
}))

const mockVerifyEmail = vi.mocked(verifyEmailService)
const mockResendVerification = vi.mocked(resendVerificationService)
const mockCheckAuth = vi.mocked(checkAuthService)

const renderVerifyEmail = (token = 'valid-token-123') => {
  window.history.pushState({}, '', `/verify-email?token=${token}`)
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/verify-email']}>
        <VerifyEmail />
        <Header />
      </MemoryRouter>
    </AuthProvider>
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  mockCheckAuth.mockResolvedValue({ isAuthenticated: false, user: null })
})

afterEach(() => {
  sessionStorage.clear()
})

describe('VerifyEmail page rendering', () => {
  it('renders verification loading state', () => {
    renderVerifyEmail()
    expect(screen.getByText(/Verifying email\.\.\./)).toBeInTheDocument()
  })

  it('shows success state after verification', async () => {
    mockVerifyEmail.mockResolvedValue({ user: { id: '1', email: 'test@example.com', emailVerified: true } })
    renderVerifyEmail()
    await waitFor(() => {
      expect(screen.getByText(/Email verified!/)).toBeInTheDocument()
    })
    expect(screen.getByText(/Your email address has been verified/)).toBeInTheDocument()
  })

  it('shows error when no token provided', () => {
    renderVerifyEmail('')
    expect(screen.getByText(/No verification token provided/)).toBeInTheDocument()
  })

  it('shows error when verification fails', async () => {
    mockVerifyEmail.mockRejectedValue(new Error('This verification link is invalid or has expired.'))
    renderVerifyEmail()
    await waitFor(() => {
      expect(screen.getByText(/This verification link is invalid or has expired/)).toBeInTheDocument()
    })
  })

  it('calls verify email service with token from URL', async () => {
    mockVerifyEmail.mockResolvedValue({ user: { id: '1', email: 'test@example.com', emailVerified: true } })
    renderVerifyEmail('my-token-abc')
    await waitFor(() => {
      expect(mockVerifyEmail).toHaveBeenCalledWith({ token: 'my-token-abc' })
    })
  })
})

describe('VerifyEmail resend', () => {
  it('does not show resend button when not authenticated', async () => {
    mockVerifyEmail.mockRejectedValue(new Error('This verification link is invalid or has expired.'))
    renderVerifyEmail()
    await waitFor(() => {
      expect(screen.getByText(/This verification link is invalid or has expired/)).toBeInTheDocument()
    })
    expect(screen.queryByText(/Resend verification email/)).not.toBeInTheDocument()
  })
})

describe('VerifyEmail navigation', () => {
  it('navigates to home after successful verification', async () => {
    mockVerifyEmail.mockResolvedValue({ user: { id: '1', email: 'test@example.com', emailVerified: true } })
    renderVerifyEmail()
    await waitFor(() => {
      expect(screen.getByText(/Email verified!/)).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Go to home' }))
    expect(screen.getByText(/Email verified!/)).toBeInTheDocument()
  })

  it('navigates to login when not authenticated and verification failed', async () => {
    mockVerifyEmail.mockRejectedValue(new Error('This verification link is invalid or has expired.'))
    renderVerifyEmail()
    await waitFor(() => {
      expect(screen.getByText(/This verification link is invalid or has expired/)).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByText(/This verification link is invalid or has expired/)).toBeInTheDocument()
  })
})
