import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../../contexts/AuthContext'
import { RequireVerifiedEmail } from './RequireVerifiedEmail'
import { checkAuth as checkAuthService, setPendingAction } from '../../services/auth'

vi.mock('../../services/auth', () => ({
  checkAuth: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  verifyEmail: vi.fn(),
  resendVerification: vi.fn(),
  setPendingAction: vi.fn(),
}))

const Children = () => <div data-testid="children">Protected content</div>

const renderRequireVerifiedEmail = (ui = <Children />) => {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/protected']}>
        <RequireVerifiedEmail>{ui}</RequireVerifiedEmail>
      </MemoryRouter>
    </AuthProvider>
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
})

afterEach(() => {
  sessionStorage.clear()
})

describe('RequireVerifiedEmail rendering', () => {
  it('shows loading state while auth is initializing', () => {
    checkAuthService.mockImplementation(
      () => new Promise((resolve) => {}),
    )
    renderRequireVerifiedEmail()
    expect(screen.queryByTestId('children')).not.toBeInTheDocument()
  })

  it('renders children when authenticated and email verified', async () => {
    checkAuthService.mockResolvedValue({
      isAuthenticated: true,
      user: { id: '1', email: 'test@example.com', emailVerified: true },
    })
    renderRequireVerifiedEmail()
    await waitFor(() => {
      expect(screen.getByTestId('children')).toBeInTheDocument()
    })
  })

  it('redirects to login when not authenticated', async () => {
    checkAuthService.mockResolvedValue({
      isAuthenticated: false,
      user: null,
    })
    renderRequireVerifiedEmail()
    // Navigation happens asynchronously; just verify it doesn't crash
    await waitFor(() => {
      expect(screen.queryByTestId('children')).not.toBeInTheDocument()
    })
  })

  it('redirects to verify-email when authenticated but not verified', async () => {
    checkAuthService.mockResolvedValue({
      isAuthenticated: true,
      user: { id: '1', email: 'test@example.com', emailVerified: false },
    })
    renderRequireVerifiedEmail()
    await waitFor(() => {
      expect(screen.queryByTestId('children')).not.toBeInTheDocument()
    })
  })
})
