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
  it('uses the shared homepage-aligned content container', () => {
    const { container } = renderWithAuth()
    expect(container.querySelector('header > .app-container')).toBeInTheDocument()
  })

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

  it('closes the Features dropdown on outside pointer and Escape, but not inside pointer', () => {
    renderWithAuth({ isAuthenticated: false, isLoading: false, user: null })
    const featuresButton = screen.getAllByRole('button', { name: 'Features' })[0]
    fireEvent.click(featuresButton)
    expect(screen.getByRole('link', { name: 'Trip Planning' })).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('link', { name: 'Trip Planning' }))
    expect(screen.getByRole('link', { name: 'Trip Planning' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('link', { name: 'Trip Planning' })).not.toBeInTheDocument()

    fireEvent.click(featuresButton)
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('link', { name: 'Trip Planning' })).not.toBeInTheDocument()
  })

  it('closes Features when a menu item is selected', () => {
    renderWithAuth({ isAuthenticated: false, isLoading: false, user: null })
    fireEvent.click(screen.getAllByRole('button', { name: 'Features' })[0])
    fireEvent.click(screen.getByRole('link', { name: 'Group Travel' }))
    expect(screen.queryByRole('link', { name: 'Trip Planning' })).not.toBeInTheDocument()
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

  it('shows authenticated feature links without opening the guest Features menu', () => {
    renderWithAuth({
      isAuthenticated: true,
      isLoading: false,
      user: { id: '1', email: 'test@example.com', role: 'user' },
    })
    for (const name of ['Feed', 'Explore', 'Group Trips', 'My Trips', 'Scrapbooks']) {
      expect(screen.getAllByRole('link', { name })).not.toHaveLength(0)
    }
    expect(screen.queryByRole('button', { name: 'Features' })).not.toBeInTheDocument()
    expect(screen.getByText('Profile')).toBeInTheDocument()
  })

  it('closes the Profile menu on outside pointer and Escape without closing for inside pointer', () => {
    renderWithAuth({ isAuthenticated: true, isLoading: false, user: { id: '1', email: 'test@example.com', role: 'user' } })
    const profileControl = screen.getByRole('button', { name: /Profile/ })
    fireEvent.click(profileControl)
    expect(profileControl).toHaveAttribute('aria-expanded', 'true')
    fireEvent.pointerDown(screen.getAllByRole('button', { name: 'Log out' })[0])
    expect(profileControl).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(profileControl).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(profileControl)
    fireEvent.pointerDown(document.body)
    expect(profileControl).toHaveAttribute('aria-expanded', 'false')
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
