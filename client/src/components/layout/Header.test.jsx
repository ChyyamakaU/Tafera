import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../../contexts/AuthContext'
import Header from './Header'

const renderWithAuth = (
  authState = { isAuthenticated: false, isLoading: false, user: null }
) => {
  const authValue = {
    isAuthenticated: authState.isAuthenticated,
    isLoading: authState.isLoading,
    user: authState.user,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    checkAuth: vi.fn(),
  }

  return render(
    <MemoryRouter initialEntries={['/']}>
      <AuthContext.Provider value={authValue}>
        <Header />
      </AuthContext.Provider>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
})

afterEach(() => {
  sessionStorage.clear()
})

describe('Header', () => {
  it('displays logo and guest auth actions when unauthenticated', () => {
    renderWithAuth({ isAuthenticated: false, isLoading: false, user: null })
    expect(screen.getByAltText('Tafera')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Join for Free' })).toBeInTheDocument()
    expect(screen.queryByText('Profile')).not.toBeInTheDocument()
  })

  it('displays Profile menu button when authenticated', () => {
    renderWithAuth({ isAuthenticated: true, isLoading: false, user: { id: '1', email: 'test@example.com', role: 'user' } })
    expect(screen.getByText('Profile')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Join for Free' })).not.toBeInTheDocument()
  })

  it('displays Discover dropdown when clicked', () => {
    renderWithAuth({ isAuthenticated: true, isLoading: false, user: { id: '1', email: 'test@example.com', role: 'user' } })
    const discoverButtons = screen.getAllByText('Discover')
    fireEvent.click(discoverButtons[0])
    expect(screen.getByText('Destinations')).toBeInTheDocument()
  })
})
