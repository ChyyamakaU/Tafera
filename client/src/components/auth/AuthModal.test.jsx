import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AuthModal from '../home/AuthModal'

const renderWithAuthModal = (
  props,
  initialEntry = '/trips/trip-123'
) => {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      {props}
    </MemoryRouter>
  )
}

beforeEach(() => {
  sessionStorage.clear()
  Object.defineProperty(window, 'location', {
    value: { pathname: '/trips/trip-123', search: '', hash: '' },
    writable: true,
    configurable: true,
  })
})

afterEach(() => {
  sessionStorage.clear()
})

describe('AuthModal rendering', () => {
  it('renders nothing when isOpen is false', () => {
    renderWithAuthModal(
      <AuthModal isOpen={false} onClose={() => {}} action="sign_in" />
    )
    expect(document.getElementById('signin-modal-title')).not.toBeInTheDocument()
  })

  it('renders modal with tagline when isOpen is true', () => {
    renderWithAuthModal(
      <AuthModal
        isOpen={true}
        onClose={() => {}}
        action="create_story"
        actionLabel="share your story"
      />
    )
    expect(document.getElementById('signin-modal-title')).toBeInTheDocument()
    expect(screen.getByText('Sign in to share your story')).toBeInTheDocument()
  })

  it('displays action-specific description text', () => {
    renderWithAuthModal(
      <AuthModal
        isOpen={true}
        onClose={() => {}}
        action="join"
        actionLabel="join this trip"
        entityType="trip"
        entityName="Kyoto Trip"
      />
    )
    expect(
      screen.getByText("Sign in to request to join this trip. The organiser reviews every request.")
    ).toBeInTheDocument()
  })

  it('renders Sign in and Create an account buttons', () => {
    renderWithAuthModal(
      <AuthModal isOpen={true} onClose={() => {}} action="sign_in" />
    )
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Create an account' })
    ).toBeInTheDocument()
  })

  it('renders Sign in here link', () => {
    renderWithAuthModal(
      <AuthModal isOpen={true} onClose={() => {}} action="sign_in" />
    )
    expect(
      screen.getByRole('button', { name: 'Sign in here' })
    ).toBeInTheDocument()
  })
})

describe('Sign in navigation', () => {
  it('navigates to /login when Sign in button is clicked', async () => {
    sessionStorage.clear()
    renderWithAuthModal(
      <AuthModal isOpen={true} onClose={() => {}} action="sign_in" />
    )
    await screen.findByRole('button', { name: 'Sign in' })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => {
      const stored = sessionStorage.getItem('tafera:pending-action')
      const parsed = JSON.parse(stored)
      expect(parsed.action).toBe('sign_in')
      expect(parsed.returnTo).toBe('/trips/trip-123')
    })
  })

  it('stores pending action when signing in', async () => {
    sessionStorage.clear()
    renderWithAuthModal(
      <AuthModal
        isOpen={true}
        onClose={() => {}}
        action="create_story"
        actionLabel="share your story"
        entityType="story"
        entityName="My Kyoto Trip"
      />
    )
    await screen.findByRole('button', { name: 'Sign in' })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await waitFor(() => {
      const stored = sessionStorage.getItem('tafera:pending-action')
      const parsed = JSON.parse(stored)
      expect(parsed.action).toBe('create_story')
      expect(parsed.entityType).toBe('story')
      expect(parsed.entityName).toBe('My Kyoto Trip')
      expect(parsed.returnTo).toBe('/trips/trip-123')
    })
  })
})

describe('Create account navigation', () => {
  it('navigates to /register when Create an account is clicked', async () => {
    sessionStorage.clear()
    renderWithAuthModal(
      <AuthModal isOpen={true} onClose={() => {}} action="sign_in" />
    )
    await screen.findByRole('button', { name: 'Create an account' })
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }))
    await waitFor(() => {
      expect(sessionStorage.getItem('tafera:pending-action')).toBeTruthy()
    })
  })

  it('stores pending action when registering', async () => {
    sessionStorage.clear()
    renderWithAuthModal(
      <AuthModal
        isOpen={true}
        onClose={() => {}}
        action="create_trip"
        actionLabel="create a trip"
        entityType="trip"
        entityName="Spring Trip"
      />
    )
    await screen.findByRole('button', { name: 'Create an account' })
    fireEvent.click(screen.getByRole('button', { name: 'Create an account' }))
    await waitFor(() => {
      const stored = sessionStorage.getItem('tafera:pending-action')
      const parsed = JSON.parse(stored)
      expect(parsed.action).toBe('create_trip')
      expect(parsed.actionLabel).toBeUndefined()
      expect(parsed.entityType).toBe('trip')
      expect(parsed.entityName).toBe('Spring Trip')
      expect(parsed.returnTo).toBe('/trips/trip-123')
    })
  })
})

describe('Sign in here link', () => {
  it('navigates to /login when Sign in here is clicked', async () => {
    sessionStorage.clear()
    renderWithAuthModal(
      <AuthModal isOpen={true} onClose={() => {}} action="sign_in" />
    )
    await screen.findByRole('button', { name: 'Sign in here' })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in here' }))
    await waitFor(() => {
      const stored = sessionStorage.getItem('tafera:pending-action')
      const parsed = JSON.parse(stored)
      expect(parsed.action).toBe('sign_in')
      expect(parsed.returnTo).toBe('/trips/trip-123')
    })
  })
})

describe('Close modal', () => {
  it('calls onClose when close button is clicked', async () => {
    const onClose = vi.fn()
    renderWithAuthModal(
      <AuthModal isOpen={true} onClose={onClose} action="sign_in" />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
