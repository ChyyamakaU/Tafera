import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import PasswordInput from './PasswordInput'

const renderPasswordInput = (props = {}) => {
  return render(<PasswordInput id="password" {...props} />)
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  sessionStorage.clear()
})

describe('PasswordInput rendering', () => {
  it('renders a password input by default', () => {
    renderPasswordInput()
    const input = screen.getByLabelText('Password')
    expect(input).toBeInTheDocument()
    expect(input.type).toBe('password')
  })

  it('renders with a custom label', () => {
    renderPasswordInput({ label: 'Confirm password' })
    expect(screen.getByLabelText('Confirm password')).toBeInTheDocument()
  })

  it('renders the show-password toggle button', () => {
    renderPasswordInput()
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument()
  })
})

describe('PasswordInput visibility toggle', () => {
  it('starts with the password hidden', () => {
    renderPasswordInput({ value: 'secret123' })
    expect(screen.getByLabelText('Password').type).toBe('password')
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hide password' })).not.toBeInTheDocument()
  })

  it('shows the password when the eye icon is clicked', () => {
    renderPasswordInput({ value: 'secret123' })
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(screen.getByLabelText('Password').type).toBe('text')
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show password' })).not.toBeInTheDocument()
  })

  it('hides the password again when the eye-off icon is clicked', () => {
    renderPasswordInput({ value: 'secret123' })
    const toggle = screen.getByRole('button', { name: 'Show password' })
    fireEvent.click(toggle)
    expect(screen.getByLabelText('Password').type).toBe('text')

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(screen.getByLabelText('Password').type).toBe('password')
    expect(screen.getByRole('button', { name: 'Show password' })).toBeInTheDocument()
  })

  it('toggles visibility multiple times without clearing the value', () => {
    renderPasswordInput({ value: 'secret123' })
    const input = screen.getByLabelText('Password')

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(input.type).toBe('text')
    expect(input.value).toBe('secret123')

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(input.type).toBe('password')
    expect(input.value).toBe('secret123')

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(input.type).toBe('text')
    expect(input.value).toBe('secret123')
  })

  it('updates the value through onChange while toggled visible', () => {
    const onChange = vi.fn()
    renderPasswordInput({ value: 'secret123', onChange })
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    const input = screen.getByLabelText('Password')

    fireEvent.input(input, { target: { value: 'secret123updated' } })
    expect(onChange).toHaveBeenCalledWith({ target: { value: 'secret123updated' } })
    expect(input.value).toBe('secret123updated')
  })

  it('applies accessible labels for show and hide states', () => {
    renderPasswordInput()
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders the eye icon when hidden and eye-off icon when visible', () => {
    renderPasswordInput()
    const showButton = screen.getByRole('button', { name: 'Show password' })
    expect(showButton.querySelector('svg')).toBeInTheDocument()

    fireEvent.click(showButton)
    const hideButton = screen.getByRole('button', { name: 'Hide password' })
    expect(hideButton.querySelector('svg')).toBeInTheDocument()
  })

  it('does not clear the entered password when toggling', () => {
    const onChange = vi.fn()
    renderPasswordInput({ value: 'mypassword', onChange })
    const input = screen.getByLabelText('Password')
    input.value = 'mypassword'

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(input.value).toBe('mypassword')

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(input.value).toBe('mypassword')
  })
})
