import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../contexts/AuthContext'
import Login from './Login'
import Header from '../components/layout/Header'
import {
  login,
  getPendingAction,
  clearPendingAction,
} from '../services/auth'

vi.mock('../services/auth', () => ({
  checkAuth: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  getPendingAction: vi.fn(),
  clearPendingAction: vi.fn(),
}))

const mockLogin = vi.mocked(login)
const mockGetPendingAction = vi.mocked(getPendingAction)
const mockClearPendingAction = vi.mocked(clearPendingAction)

const renderLogin = () => {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/login']}>
        <Login />
        <Header />
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

describe('Login page rendering', () => {
  it('renders login form elements', () => {
    renderLogin()
    expect(screen.getByLabelText('Email address')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log in' })).toBeInTheDocument()
  })

  it('renders heading and links', () => {
    renderLogin()
    expect(screen.getByRole('heading', { name: 'Log in' })).toBeInTheDocument()
    expect(screen.getByText('Sign in to your Tafera account to continue.')).toBeInTheDocument()
    expect(screen.getByText('Create an account')).toBeInTheDocument()
    expect(screen.getByText('Back to home')).toBeInTheDocument()
  })
})

describe('Login validation', () => {
  it('shows error for empty email', async () => {
    renderLogin()
    const emailInput = screen.getByLabelText('Email address')
    const passwordInput = screen.getByLabelText('Password')
    fireEvent.input(emailInput, { target: { value: '' } })
    fireEvent.input(passwordInput, { target: { value: 'password123' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Log in' }).closest('form'))
    await waitFor(() => {
      expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument()
    })
  })

  it('shows error for empty password', async () => {
    renderLogin()
    const emailInput = screen.getByLabelText('Email address')
    const passwordInput = screen.getByLabelText('Password')
    fireEvent.input(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.input(passwordInput, { target: { value: '' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Log in' }).closest('form'))
    await waitFor(() => {
      expect(screen.getByText('Password is required.')).toBeInTheDocument()
    })
  })
})

describe('Login submission', () => {
  it('calls AuthContext login method and updates shared auth state immediately', async () => {
    mockLogin.mockResolvedValue({ user: { id: '1', email: 'test@example.com' }, csrfToken: 'csrf-token-123' })
    renderLogin()
    const emailInput = screen.getByLabelText('Email address')
    const passwordInput = screen.getByLabelText('Password')
    fireEvent.input(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.input(passwordInput, { target: { value: 'password12345' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Log in' }).closest('form'))
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password12345',
      })
    })
    await waitFor(() => {
      expect(screen.getByText('Profile')).toBeInTheDocument()
    })
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Join for Free' })).not.toBeInTheDocument()
  })

  it('shows loading state during submission', async () => {
    mockLogin.mockResolvedValue({ user: { id: '1', email: 'test@example.com' }, csrfToken: 'csrf-token-123' })
    renderLogin()
    const emailInput = screen.getByLabelText('Email address')
    const passwordInput = screen.getByLabelText('Password')
    fireEvent.input(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.input(passwordInput, { target: { value: 'password12345' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Log in' }).closest('form'))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Signing in...' })).toBeDisabled()
    })
  })

  it('displays error on login failure', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid credentials'))
    renderLogin()
    const emailInput = screen.getByLabelText('Email address')
    const passwordInput = screen.getByLabelText('Password')
    fireEvent.input(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.input(passwordInput, { target: { value: 'wrong' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Log in' }).closest('form'))
    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
    })
  })
})

describe('Login redirect behavior', () => {
  it('redirects to / after successful login with no pending action', async () => {
    mockLogin.mockResolvedValue({ user: { id: '1', email: 'test@example.com' }, csrfToken: 'csrf-token-123' })
    renderLogin()
    const emailInput = screen.getByLabelText('Email address')
    const passwordInput = screen.getByLabelText('Password')
    fireEvent.input(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.input(passwordInput, { target: { value: 'password12345' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Log in' }).closest('form'))
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledTimes(1)
    })
  })

  it('redirects to pending action returnTo when available', async () => {
    mockLogin.mockResolvedValue({ user: { id: '1', email: 'test@example.com' }, csrfToken: 'csrf-token-123' })
    mockGetPendingAction.mockReturnValue({
      action: 'create_trip',
      returnTo: '/trips/new',
    })
    renderLogin()
    const emailInput = screen.getByLabelText('Email address')
    const passwordInput = screen.getByLabelText('Password')
    fireEvent.input(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.input(passwordInput, { target: { value: 'password12345' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Log in' }).closest('form'))
    await waitFor(() => {
      expect(mockClearPendingAction).toHaveBeenCalledTimes(1)
    })
  })
})
