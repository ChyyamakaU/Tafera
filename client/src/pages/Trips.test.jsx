import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../contexts/AuthContext'
import Trips from './Trips'
import { createTrip, fetchMyTrips } from '../services/trips'

vi.mock('../services/trips', () => ({ createTrip: vi.fn(), fetchMyTrips: vi.fn() }))

const baseTrip = {
  id: 'personal-trip', title: 'Coast holiday', tripType: 'personal',
  startDate: '2027-05-01', endDate: '2027-05-10', description: 'A break', status: 'draft',
}

const renderTrips = () => render(
  <MemoryRouter>
    <AuthContext.Provider value={{ isAuthenticated: true, isEmailVerified: true, isLoading: false, user: { id: 'user-1' } }}>
      <Trips />
    </AuthContext.Provider>
  </MemoryRouter>,
)

beforeEach(() => {
  vi.resetAllMocks()
  fetchMyTrips.mockResolvedValue({ trips: [baseTrip], pagination: { hasNextPage: false } })
})

describe('Personal trips page', () => {
  it('loads personal trips and links to the trip itinerary', async () => {
    renderTrips()
    expect(await screen.findByText('Coast holiday')).toBeInTheDocument()
    expect(screen.getByText('2027-05-01 – 2027-05-10')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /View itinerary and manage trip/ })).toHaveAttribute('href', '/trips/personal-trip')
  })

  it('creates a personal trip and adds it to the dashboard', async () => {
    createTrip.mockResolvedValue({ ...baseTrip, id: 'new-trip', title: 'New journey' })
    renderTrips()
    fireEvent.click(await screen.findByRole('button', { name: 'Create personal trip' }))
    fireEvent.change(screen.getByLabelText('Trip title'), { target: { value: 'New journey' } })
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2027-06-01' } })
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2027-06-08' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create trip' }))
    expect(await screen.findByText('New journey')).toBeInTheDocument()
    await waitFor(() => expect(createTrip).toHaveBeenCalledWith(expect.objectContaining({ tripType: 'personal', title: 'New journey' })))
  })
})
