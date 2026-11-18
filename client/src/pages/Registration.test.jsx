import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Registration from './Registration'

const renderRegistration = () => {
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <Registration />
    </MemoryRouter>
  )
}

beforeEach(() => {
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
