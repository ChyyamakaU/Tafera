import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../contexts/AuthContext'
import { THEME_STORAGE_KEY, ThemeProvider } from './ThemeContext'
import Header from '../components/layout/Header'

afterEach(() => {
  cleanup()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('ThemeProvider and Header theme toggle', () => {
  it('defaults to light mode, toggles to dark mode, and persists preference in localStorage', () => {
    render(
      <MemoryRouter>
        <ThemeProvider>
          <AuthContext.Provider value={{ user: null, isAuthenticated: false, isEmailVerified: false, isLoading: false }}>
            <Header />
          </AuthContext.Provider>
        </ThemeProvider>
      </MemoryRouter>,
    )

    expect(document.documentElement.getAttribute('data-theme')).toBe('light')

    const toggleButtons = screen.getAllByRole('button', { name: 'Switch to dark mode' })
    fireEvent.click(toggleButtons[0])

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(screen.getAllByRole('button', { name: 'Switch to light mode' })[0]).toHaveAttribute('aria-pressed', 'true')
  })

  it('restores stored dark theme preference on initial mount without flipping back to light', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')

    render(
      <MemoryRouter>
        <ThemeProvider>
          <AuthContext.Provider value={{ user: null, isAuthenticated: false, isEmailVerified: false, isLoading: false }}>
            <Header />
          </AuthContext.Provider>
        </ThemeProvider>
      </MemoryRouter>,
    )

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(screen.getAllByRole('button', { name: 'Switch to light mode' }).length).toBeGreaterThan(0)
  })
})
