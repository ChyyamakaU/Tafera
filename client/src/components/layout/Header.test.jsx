import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../../contexts/AuthContext'
import Header from './Header'

const renderWithAuth = (
  authState = { isAuthenticated: false, isLoading: false, user: null },
  initialEntry = '/'
) => {
  const authValue = {
    isAuthenticated: authState.isAuthenticated,
    isLoading: authState.isLoading,
    user: authState.user,
    login: vi.fn(),
    register: vi.fn(),
    logout: authState.logout || vi.fn(),
    checkAuth: vi.fn(),
  }

  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
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

describe('Header unauthenticated state', () => {
  it('displays logo and guest auth actions when unauthenticated', () => {
    renderWithAuth({ isAuthenticated: false, isLoading: false, user: null })
    expect(screen.getByAltText('Tafera')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Join for Free' })).toBeInTheDocument()
    expect(screen.queryByText('Profile')).not.toBeInTheDocument()
  })

  it('displays Discover dropdown when clicked', () => {
    renderWithAuth({ isAuthenticated: false, isLoading: false, user: null })
    const discoverButtons = screen.getAllByText('Discover')
    fireEvent.click(discoverButtons[0])
    expect(screen.getByText('Destinations')).toBeInTheDocument()
  })
})

describe('Header authenticated state', () => {
  it('displays Profile menu button when authenticated', () => {
    renderWithAuth({
      isAuthenticated: true,
      isLoading: false,
      user: { id: '1', email: 'test@example.com', role: 'user' },
    })
    expect(screen.getByText('Profile')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Join for Free' })).not.toBeInTheDocument()
  })
})

describe('Header logout', () => {
  it('calls logout when Profile Log out button is clicked', async () => {
    const mockLogout = vi.fn().mockResolvedValue(undefined)
    renderWithAuth(
      {
        isAuthenticated: true,
        isLoading: false,
        user: { id: '1', email: 'test@example.com', role: 'user' },
        logout: mockLogout,
      },
      '/'
    )

    fireEvent.click(screen.getByText('Profile'))
    const logoutButtons = screen.getAllByRole('button', { name: 'Log out' })
    fireEvent.click(logoutButtons[0])
    expect(mockLogout).toHaveBeenCalledTimes(1)
  })

  it('displays Signing out... state during logout', async () => {
    const mockLogout = vi.fn().mockImplementation(() => new Promise(() => {}))
    renderWithAuth(
      {
        isAuthenticated: true,
        isLoading: false,
        user: { id: '1', email: 'test@example.com', role: 'user' },
        logout: mockLogout,
      },
      '/'
    )

    fireEvent.click(screen.getByText('Profile'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Log out' })[0])
    expect(screen.getAllByRole('button', { name: 'Signing out...' })[0]).toBeDisabled()
    expect(mockLogout).toHaveBeenCalledTimes(1)
  })

  it('does not allow repeated logout clicks while logging out', async () => {
    const mockLogout = vi.fn().mockImplementation(() => new Promise(() => {}))
    renderWithAuth(
      {
        isAuthenticated: true,
        isLoading: false,
        user: { id: '1', email: 'test@example.com', role: 'user' },
        logout: mockLogout,
      },
      '/'
    )

    fireEvent.click(screen.getByText('Profile'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Log out' })[0])
    expect(screen.getAllByRole('button', { name: 'Signing out...' })[0]).toBeDisabled()
    expect(mockLogout).toHaveBeenCalledTimes(1)
  })

  it('handles logout failure by navigating home anyway', async () => {
    const mockLogout = vi.fn().mockRejectedValue(new Error('Logout failed'))
    renderWithAuth(
      {
        isAuthenticated: true,
        isLoading: false,
        user: { id: '1', email: 'test@example.com', role: 'user' },
        logout: mockLogout,
      },
      '/'
    )

    fireEvent.click(screen.getByText('Profile'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Log out' })[0])
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Log out' })[0]).not.toBeDisabled()
    })
    expect(mockLogout).toHaveBeenCalledTimes(1)
  })
})
