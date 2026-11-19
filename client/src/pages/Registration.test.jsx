import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../contexts/AuthContext'
import Registration from './Registration'
import Header from '../components/layout/Header'
import {
  register as registerService,
  fetchCsrfToken,
  getPendingAction,
  clearPendingAction,
} from '../services/auth'

vi.mock('../services/auth', () => ({
  checkAuth: vi.fn().mockResolvedValue({ isAuthenticated: false, user: null }),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  fetchCsrfToken: vi.fn().mockResolvedValue(undefined),
  getPendingAction: vi.fn(),
  clearPendingAction: vi.fn(),
}))

const mockRegister = vi.mocked(registerService)
const mockFetchCsrfToken = vi.mocked(fetchCsrfToken)
const mockGetPendingAction = vi.mocked(getPendingAction)
const mockClearPendingAction = vi.mocked(clearPendingAction)

const renderRegistration = () => {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/register']}>
        <Registration />
        <Header />
      </MemoryRouter>
    </AuthProvider>
  )
}

const fillAndSubmit = (
  fullName = 'Test User',
  email = 'test@example.com',
  password = 'password12345',
) => {
  fireEvent.input(screen.getByLabelText('Full name'), { target: { value: fullName } })
  fireEvent.input(screen.getByLabelText('Email address'), { target: { value: email } })
  fireEvent.input(screen.getByLabelText('Password'), { target: { value: password } })
  fireEvent.submit(screen.getByRole('button', { name: 'Create account' }).closest('form'))
}

beforeEach(() => {
  vi.resetAllMocks()
  mockFetchCsrfToken.mockResolvedValue(undefined)
  sessionStorage.clear()
})

afterEach(() => {
  sessionStorage.clear()
})

describe('Registration rendering', () => {
  it('renders registration form elements', () => {
    renderRegistration()
    expect(screen.getByLabelText('Full name')).toBeInTheDocument()
    expect(screen.getByLabelText('Email address')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument()
  })

  it('shows error for empty full name', async () => {
    renderRegistration()
    const fullNameInput = screen.getByLabelText('Full name')
    const emailInput = screen.getByLabelText('Email address')
    const passwordInput = screen.getByLabelText('Password')
    fireEvent.input(fullNameInput, { target: { value: '' } })
    fireEvent.input(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.input(passwordInput, { target: { value: 'password12345' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create account' }).closest('form'))
    await waitFor(() => {
      expect(screen.getByText('Full name must be at least 2 characters long.')).toBeInTheDocument()
    })
  })

  it('shows error for invalid email', async () => {
    renderRegistration()
    const fullNameInput = screen.getByLabelText('Full name')
    const emailInput = screen.getByLabelText('Email address')
    const passwordInput = screen.getByLabelText('Password')
    fireEvent.input(fullNameInput, { target: { value: 'Test User' } })
    fireEvent.input(emailInput, { target: { value: 'not-an-email' } })
    fireEvent.input(passwordInput, { target: { value: 'password12345' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create account' }).closest('form'))
    await waitFor(() => {
      expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
    })
  })

  it('shows error for short password', async () => {
    renderRegistration()
    const fullNameInput = screen.getByLabelText('Full name')
    const emailInput = screen.getByLabelText('Email address')
    const passwordInput = screen.getByLabelText('Password')
    fireEvent.input(fullNameInput, { target: { value: 'Test User' } })
    fireEvent.input(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.input(passwordInput, { target: { value: 'short' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create account' }).closest('form'))
    await waitFor(() => {
      expect(screen.getByText('Password must be at least 12 characters long.')).toBeInTheDocument()
    })
  })
})

describe('Registration authentication-state sync', () => {
  it('calls AuthContext register method on successful submission', async () => {
    mockRegister.mockResolvedValue({ user: { id: '1', email: 'test@example.com' }, csrfToken: 'csrf-token-123' })
    renderRegistration()
    fillAndSubmit()
    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith({
        fullName: 'Test User',
        email: 'test@example.com',
        password: 'password12345',
      })
    })
  })

  it('reflects the authenticated user in shared state immediately', async () => {
    mockRegister.mockResolvedValue({ user: { id: '1', email: 'test@example.com' }, csrfToken: 'csrf-token-123' })
    renderRegistration()
    fillAndSubmit()
    await waitFor(() => {
      expect(screen.getByText('Profile')).toBeInTheDocument()
    })
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Join for Free' })).not.toBeInTheDocument()
  })

  it('displays authenticated navigation in Header without page refresh', async () => {
    mockRegister.mockResolvedValue({ user: { id: '1', email: 'test@example.com' }, csrfToken: 'csrf-token-123' })
    renderRegistration()
    fillAndSubmit()
    await waitFor(() => {
      expect(screen.getByText('Profile')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByText('Profile'))
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Log out' })[0]).toBeInTheDocument()
    })
  })
})

describe('Registration pending-action redirects', () => {
  it('clears pending action when a returnTo is available', async () => {
    mockRegister.mockResolvedValue({ user: { id: '1', email: 'test@example.com' }, csrfToken: 'csrf-token-123' })
    mockGetPendingAction.mockReturnValue({ action: 'create_trip', returnTo: '/trips/new' })
    renderRegistration()
    fillAndSubmit()
    await waitFor(() => {
      expect(mockClearPendingAction).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(screen.getByText('Profile')).toBeInTheDocument()
    })
  })

  it('does not clear pending action when none exists (homepage fallback)', async () => {
    mockRegister.mockResolvedValue({ user: { id: '1', email: 'test@example.com' }, csrfToken: 'csrf-token-123' })
    mockGetPendingAction.mockReturnValue(null)
    renderRegistration()
    fillAndSubmit()
    await waitFor(() => {
      expect(mockClearPendingAction).not.toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(screen.getByText('Profile')).toBeInTheDocument()
    })
  })
})
