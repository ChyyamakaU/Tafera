import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { cleanup, render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../../contexts/AuthContext'
import Header from './Header'
import { fetchUnreadCount } from '../../services/notifications'

vi.mock('../../services/notifications', () => ({
  fetchUnreadCount: vi.fn(),
}))

const mockFetchUnreadCount = vi.mocked(fetchUnreadCount)

const renderWithAuth = (
  authState = { isAuthenticated: false, isLoading: false, user: null },
  initialEntry = '/'
) => {
  const authValue = {
    isAuthenticated: authState.isAuthenticated,
    isEmailVerified: authState.isEmailVerified ?? authState.isAuthenticated,
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
  mockFetchUnreadCount.mockResolvedValue(0)
  sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  sessionStorage.clear()
})

describe('Header unauthenticated state', () => {
  it('uses the shared homepage-aligned content container', () => {
    const { container } = renderWithAuth()
    expect(container.querySelector('header > .app-container')).toBeInTheDocument()
  })

  it('displays logo and guest auth actions when unauthenticated', () => {
    renderWithAuth({ isAuthenticated: false, isLoading: false, user: null })
    expect(screen.getAllByAltText('Tafera').length).toBeGreaterThan(0)
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

  it('keeps Notifications out of the desktop header bar while showing avatar, Notifications, and Hamburger on mobile only', async () => {
    mockFetchUnreadCount.mockResolvedValue(4)
    renderWithAuth({
      isAuthenticated: true,
      isLoading: false,
      user: {
        id: '1',
        fullName: 'Ada Traveller',
        email: 'test@example.com',
        profileImage: 'https://example.com/ada.jpg',
        role: 'user',
      },
    })

    const desktopBar = screen.getByTestId('desktop-header-bar')
    expect(within(desktopBar).queryByRole('link', { name: /Notifications/i })).not.toBeInTheDocument()
    expect(within(desktopBar).getAllByRole('button', { name: /Switch to (dark|light) mode/i }).length).toBeGreaterThan(0)

    const mobileBar = screen.getByTestId('mobile-header-bar')
    expect(mobileBar.className).toContain('md:hidden')
    // Left: logo, Center: avatar only (no name / no My Travels), Far right: Notifications + Hamburger (no theme toggle)
    expect(within(mobileBar).getByAltText("Ada Traveller's avatar")).toBeInTheDocument()
    expect(within(mobileBar).queryByText('Ada Traveller')).not.toBeInTheDocument()
    expect(within(mobileBar).queryByText('My Travels')).not.toBeInTheDocument()
    expect(within(mobileBar).queryByRole('button', { name: /Switch to (dark|light) mode/i })).not.toBeInTheDocument()
    expect(await within(mobileBar).findByRole('link', { name: 'Notifications (4 unread)' })).toHaveAttribute('href', '/notifications')
    expect(within(mobileBar).getByRole('button', { name: 'Toggle navigation menu' })).toBeInTheDocument()

    // Mobile drawer groups My Profile (with name), My Travels, Notifications, and Appearance theme toggle
    const drawer = screen.getByRole('navigation', { name: 'Mobile navigation' })
    expect(within(drawer).getByText('Ada Traveller')).toBeInTheDocument()
    expect(within(drawer).getByRole('link', { name: /My Profile/i })).toHaveAttribute('href', '/profile')
    expect(within(drawer).getByRole('button', { name: 'My Travels' })).toBeInTheDocument()
    expect(within(drawer).getByRole('link', { name: /Notifications/i })).toHaveAttribute('href', '/notifications')
    expect(within(drawer).getByText('Appearance')).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: /Theme:/i })).toBeInTheDocument()
  })

  it('gives an unverified account public navigation plus verification and logout only', () => {
    renderWithAuth({
      isAuthenticated: true,
      isEmailVerified: false,
      isLoading: false,
      user: { id: '1', email: 'test@example.com', role: 'user' },
    })
    expect(screen.queryByRole('link', { name: 'Feed' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'My Trips' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Verify your email' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Log out' })).not.toHaveLength(0)
    expect(screen.getAllByRole('button', { name: 'Resend verification email' })).not.toHaveLength(0)
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
