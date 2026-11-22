import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../../contexts/AuthContext'
import { RequireAuth, RequireAdmin } from './RequireAuth'
import { AuthProvider } from '../../contexts/AuthContext'
import {
  checkAuth as checkAuthService,
  setPendingAction,
} from '../../services/auth'

vi.mock('../../services/auth', () => ({
  checkAuth: vi.fn(),
  setPendingAction: vi.fn(),
}))

const mockCheckAuth = vi.mocked(checkAuthService)
const mockSetPendingAction = vi.mocked(setPendingAction)

const renderWithAuth = (
  children,
  authState = { isAuthenticated: false, isLoading: false, user: null },
  initialEntry = '/admin'
) => {
  mockCheckAuth.mockResolvedValue({
    isAuthenticated: authState.isAuthenticated,
    user: authState.user,
  })

  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthContext.Provider value={{
        isAuthenticated: authState.isAuthenticated,
        isLoading: authState.isLoading,
        user: authState.user,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
        checkAuth: vi.fn(),
      }}>
        {children}
      </AuthContext.Provider>
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  sessionStorage.clear()
  Object.defineProperty(window, 'location', {
    value: { pathname: '/admin', search: '', hash: '' },
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  sessionStorage.clear()
})

describe('RequireAuth', () => {
  it('waits for server session restoration before allowing protected content or redirecting', async () => {
    let restoreSession
    mockCheckAuth.mockReturnValue(new Promise((resolve) => { restoreSession = resolve }))

    render(
      <MemoryRouter initialEntries={['/profile']}>
        <AuthProvider>
          <RequireAuth><div data-testid="protected-content">Profile</div></RequireAuth>
        </AuthProvider>
      </MemoryRouter>,
    )

    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
    expect(mockSetPendingAction).not.toHaveBeenCalled()
    restoreSession({ isAuthenticated: true, user: { id: '1', role: 'user' } })

    expect(await screen.findByTestId('protected-content')).toBeInTheDocument()
    expect(mockSetPendingAction).not.toHaveBeenCalled()
  })

  it('displays a loading state while authentication is being checked', () => {
    renderWithAuth(
      <RequireAuth>
        <div data-testid="protected-content">Protected content</div>
      </RequireAuth>,
      { isAuthenticated: false, isLoading: true, user: null }
    )
    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument()
  })

  it('redirects unauthenticated users to /login', async () => {
    mockSetPendingAction.mockReset()
    mockCheckAuth.mockResolvedValue({ isAuthenticated: false, user: null })

    renderWithAuth(
      <RequireAuth>
        <div data-testid="protected-content">Protected content</div>
      </RequireAuth>,
      { isAuthenticated: false, isLoading: false, user: null }
    )

    await waitFor(() => {
      expect(mockSetPendingAction).toHaveBeenCalledWith(
        { action: 'sign_in' },
        '/admin'
      )
    })

    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument()
  })

  it('preserves the intended pathname, search and hash', async () => {
    mockSetPendingAction.mockReset()
    mockCheckAuth.mockResolvedValue({ isAuthenticated: false, user: null })

    render(
      <MemoryRouter initialEntries={['/admin?search=1#section']}>
        <AuthContext.Provider value={{
          isAuthenticated: false,
          isLoading: false,
          user: null,
          login: vi.fn(),
          register: vi.fn(),
          logout: vi.fn(),
          checkAuth: vi.fn(),
        }}>
          <RequireAuth>
            <div data-testid="protected-content">Protected content</div>
          </RequireAuth>
        </AuthContext.Provider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(mockSetPendingAction).toHaveBeenCalledWith(
        { action: 'sign_in' },
        '/admin?search=1#section'
      )
    })
  })

  it('renders protected content for authenticated users', async () => {
    mockCheckAuth.mockResolvedValue({
      isAuthenticated: true,
      user: { id: '1', email: 'test@example.com', role: 'user' },
    })

    renderWithAuth(
      <RequireAuth>
        <div data-testid="protected-content">Protected content</div>
      </RequireAuth>,
      { isAuthenticated: true, isLoading: false, user: { id: '1', email: 'test@example.com', role: 'user' } }
    )

    expect(screen.getByTestId('protected-content')).toBeInTheDocument()
    expect(document.querySelector('.animate-pulse')).not.toBeInTheDocument()
  })
})

describe('RequireAdmin', () => {
  it('displays a loading state while authentication is being checked', () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AuthContext.Provider value={{
          isAuthenticated: false,
          isLoading: true,
          user: null,
          login: vi.fn(),
          register: vi.fn(),
          logout: vi.fn(),
          checkAuth: vi.fn(),
        }}>
          <RequireAdmin>
            <div data-testid="admin-content">Admin content</div>
          </RequireAdmin>
        </AuthContext.Provider>
      </MemoryRouter>
    )

    expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument()
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument()
  })

  it('redirects unauthenticated users to /login', async () => {
    mockSetPendingAction.mockReset()
    mockCheckAuth.mockResolvedValue({ isAuthenticated: false, user: null })

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AuthContext.Provider value={{
          isAuthenticated: false,
          isLoading: false,
          user: null,
          login: vi.fn(),
          register: vi.fn(),
          logout: vi.fn(),
          checkAuth: vi.fn(),
        }}>
          <RequireAdmin>
            <div data-testid="admin-content">Admin content</div>
          </RequireAdmin>
        </AuthContext.Provider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(mockSetPendingAction).toHaveBeenCalledWith(
        { action: 'sign_in' },
        '/admin'
      )
    })

    expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument()
  })

  it('allows authenticated users with role: admin', async () => {
    mockCheckAuth.mockResolvedValue({
      isAuthenticated: true,
      user: { id: '1', email: 'admin@example.com', role: 'admin' },
    })

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AuthContext.Provider value={{
          isAuthenticated: true,
          isLoading: false,
          user: { id: '1', email: 'admin@example.com', role: 'admin' },
          login: vi.fn(),
          register: vi.fn(),
          logout: vi.fn(),
          checkAuth: vi.fn(),
        }}>
          <RequireAdmin>
            <div data-testid="admin-content">Admin content</div>
          </RequireAdmin>
        </AuthContext.Provider>
      </MemoryRouter>
    )

    expect(screen.getByTestId('admin-content')).toBeInTheDocument()
  })

  it('denies access to authenticated users with role: user', async () => {
    mockCheckAuth.mockResolvedValue({
      isAuthenticated: true,
      user: { id: '1', email: 'user@example.com', role: 'user' },
    })

    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AuthContext.Provider value={{
          isAuthenticated: true,
          isLoading: false,
          user: { id: '1', email: 'user@example.com', role: 'user' },
          login: vi.fn(),
          register: vi.fn(),
          logout: vi.fn(),
          checkAuth: vi.fn(),
        }}>
          <RequireAdmin>
            <div data-testid="admin-content">Admin content</div>
          </RequireAdmin>
        </AuthContext.Provider>
      </MemoryRouter>
    )

    expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument()
    expect(screen.getByText('Not authorised')).toBeInTheDocument()
    expect(
      screen.getByText('You do not have administrator access to this page.')
    ).toBeInTheDocument()
  })
})
