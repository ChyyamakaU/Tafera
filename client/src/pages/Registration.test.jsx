import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Registration from './Registration'
import {
  register,
  fetchCsrfToken,
  getPendingAction,
  clearPendingAction,
} from '../services/auth'

vi.mock('../services/auth', () => ({
  register: vi.fn(),
  fetchCsrfToken: vi.fn().mockResolvedValue(undefined),
  getPendingAction: vi.fn(),
  clearPendingAction: vi.fn(),
}))

const mockRegister = vi.mocked(register)
const mockFetchCsrfToken = vi.mocked(fetchCsrfToken)
const mockGetPendingAction = vi.mocked(getPendingAction)
const mockClearPendingAction = vi.mocked(clearPendingAction)

const renderRegistration = () => {
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <Registration />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  mockFetchCsrfToken.mockResolvedValue(undefined)
  sessionStorage.clear()
})

afterEach(() => {
  sessionStorage.clear()
})

describe('Registration page rendering', () => {
  it('renders registration form elements', () => {
    renderRegistration()
    expect(screen.getByLabelText('Full name')).toBeInTheDocument()
    expect(screen.getByLabelText('Email address')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument()
  })

  it('renders heading and links', () => {
    renderRegistration()
    expect(screen.getByRole('heading', { name: 'Create an account' })).toBeInTheDocument()
    expect(screen.getByText('Join Tafera and start planning your journeys.')).toBeInTheDocument()
    expect(screen.getByText('Log in')).toBeInTheDocument()
    expect(screen.getByText('Back to home')).toBeInTheDocument()
  })
})

describe('Registration validation', () => {
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

describe('Registration submission', () => {
  it('submits valid registration through the registration service', async () => {
    mockRegister.mockResolvedValue({ data: { user: { id: '1', email: 'test@example.com' } } })
    renderRegistration()
    const fullNameInput = screen.getByLabelText('Full name')
    const emailInput = screen.getByLabelText('Email address')
    const passwordInput = screen.getByLabelText('Password')
    fireEvent.input(fullNameInput, { target: { value: 'Test User' } })
    fireEvent.input(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.input(passwordInput, { target: { value: 'password12345' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create account' }).closest('form'))
    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith({
        fullName: 'Test User',
        email: 'test@example.com',
        password: 'password12345',
      })
    })
  })

  it('shows loading state during registration', async () => {
    mockRegister.mockResolvedValue({ data: { user: { id: '1', email: 'test@example.com' } } })
    renderRegistration()
    const fullNameInput = screen.getByLabelText('Full name')
    const emailInput = screen.getByLabelText('Email address')
    const passwordInput = screen.getByLabelText('Password')
    fireEvent.input(fullNameInput, { target: { value: 'Test User' } })
    fireEvent.input(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.input(passwordInput, { target: { value: 'password12345' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create account' }).closest('form'))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Creating account...' })).toBeDisabled()
    })
  })

  it('displays error on registration failure', async () => {
    mockRegister.mockRejectedValue(new Error('An account with this email already exists.'))
    renderRegistration()
    const fullNameInput = screen.getByLabelText('Full name')
    const emailInput = screen.getByLabelText('Email address')
    const passwordInput = screen.getByLabelText('Password')
    fireEvent.input(fullNameInput, { target: { value: 'Test User' } })
    fireEvent.input(emailInput, { target: { value: 'existing@example.com' } })
    fireEvent.input(passwordInput, { target: { value: 'password12345' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create account' }).closest('form'))
    await waitFor(() => {
      expect(screen.getByText('An account with this email already exists.')).toBeInTheDocument()
    })
  })

  it('clears pending action on successful registration', async () => {
    mockRegister.mockResolvedValue({ data: { user: { id: '1', email: 'test@example.com' } } })
    mockGetPendingAction.mockReturnValue({ action: 'create_story', returnTo: '/stories/new' })
    renderRegistration()
    const fullNameInput = screen.getByLabelText('Full name')
    const emailInput = screen.getByLabelText('Email address')
    const passwordInput = screen.getByLabelText('Password')
    fireEvent.input(fullNameInput, { target: { value: 'Test User' } })
    fireEvent.input(emailInput, { target: { value: 'test@example.com' } })
    fireEvent.input(passwordInput, { target: { value: 'password12345' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create account' }).closest('form'))
    await waitFor(() => {
      expect(mockClearPendingAction).toHaveBeenCalledTimes(1)
    })
  })
})
