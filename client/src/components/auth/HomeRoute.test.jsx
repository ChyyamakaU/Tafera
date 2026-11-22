import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AuthContext } from '../../contexts/AuthContext'
import HomeRoute from './HomeRoute'

vi.mock('../../pages/Home', () => ({ default: () => <h1>Public marketing home</h1> }))

function LocationPage() {
  const location = useLocation()
  return <p>Current route: {location.pathname}</p>
}

const renderLanding = (auth, initialEntry = '/') => render(
  <MemoryRouter initialEntries={[initialEntry]}>
    <AuthContext.Provider value={auth}>
      <Routes>
        <Route path="/" element={<HomeRoute />} />
        <Route path="/social" element={<LocationPage />} />
      </Routes>
    </AuthContext.Provider>
  </MemoryRouter>,
)

describe('HomeRoute', () => {
  it('waits for session restoration before choosing a landing page', () => {
    renderLanding({ isAuthenticated: false, isLoading: true })
    expect(screen.getByText('Checking your session...')).toBeInTheDocument()
    expect(screen.queryByText('Public marketing home')).not.toBeInTheDocument()
  })

  it('sends returning authenticated users to the social feed', () => {
    renderLanding({ isAuthenticated: true, isLoading: false })
    expect(screen.getByText('Current route: /social')).toBeInTheDocument()
  })

  it('preserves the marketing homepage for logged-out visitors', () => {
    renderLanding({ isAuthenticated: false, isLoading: false })
    expect(screen.getByRole('heading', { name: 'Public marketing home' })).toBeInTheDocument()
  })
})
