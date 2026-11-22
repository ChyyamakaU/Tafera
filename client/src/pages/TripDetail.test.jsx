import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext } from '../contexts/AuthContext'
import TripDetail from './TripDetail'
import { fetchDestinations } from '../services/destinations'
import { fetchTrip, reorderTripStops, updateTripStop } from '../services/trips'

vi.mock('../services/trips', () => ({
  addTripStop: vi.fn(), deleteTrip: vi.fn(), deleteTripStop: vi.fn(),
  fetchMyParticipation: vi.fn(), fetchTrip: vi.fn(), fetchTripParticipants: vi.fn(),
  leaveTrip: vi.fn(), moderateTripParticipant: vi.fn(), reorderTripStops: vi.fn(),
  requestToJoinTrip: vi.fn(), updateTrip: vi.fn(), updateTripStop: vi.fn(),
}))

vi.mock('../services/destinations', () => ({ fetchDestinations: vi.fn() }))

const trip = {
  id: 'trip-1', title: 'Japan', description: 'Spring travels', tripType: 'personal',
  startDate: '2027-03-01', endDate: '2027-03-10', status: 'draft', maxParticipants: null,
  isCreator: true,
  stops: [
    { id: 'stop-1', destinationId: 'destination-1', stopOrder: 1, destination: { name: 'Tokyo', country: 'Japan' } },
    { id: 'stop-2', destinationId: 'destination-2', stopOrder: 2, destination: { name: 'Kyoto', country: 'Japan' } },
  ],
}

const renderTrip = () => render(
  <MemoryRouter initialEntries={['/trips/trip-1']}>
    <AuthContext.Provider value={{ isAuthenticated: true, isEmailVerified: true, isLoading: false, user: { id: 'owner' } }}>
      <Routes><Route path="/trips/:tripId" element={<TripDetail />} /></Routes>
    </AuthContext.Provider>
  </MemoryRouter>,
)

beforeEach(() => {
  vi.resetAllMocks()
  fetchTrip.mockResolvedValue(trip)
  updateTripStop.mockResolvedValue({ ...trip, stops: trip.stops.map((stop) => stop.id === 'stop-1' ? { ...stop, arrivalDate: '2027-03-02' } : stop) })
  reorderTripStops.mockResolvedValue({ ...trip, stops: [...trip.stops].reverse().map((stop, index) => ({ ...stop, stopOrder: index + 1 })) })
  fetchDestinations.mockResolvedValue({ destinations: [] })
})

describe('Trip detail and itinerary', () => {
  it('loads the trip itinerary and reorders stops through the backend API', async () => {
    renderTrip()
    expect(await screen.findByRole('heading', { name: 'Japan' })).toBeInTheDocument()
    expect(screen.getByText('Tokyo')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Move Kyoto earlier' }))
    await waitFor(() => expect(reorderTripStops).toHaveBeenCalledWith('trip-1', ['stop-2', 'stop-1']))
  })

  it('edits stop dates and displays the saved itinerary state', async () => {
    renderTrip()
    fireEvent.click((await screen.findAllByRole('button', { name: 'Edit dates' }))[0])
    fireEvent.change(screen.getByLabelText('Arrival date in Tokyo'), { target: { value: '2027-03-02' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save dates' }))
    await waitFor(() => expect(updateTripStop).toHaveBeenCalledWith('trip-1', 'stop-1', { arrivalDate: '2027-03-02', departureDate: '' }))
  })

  it('limits itinerary location selection to Nigeria states and queries only published places in that state', async () => {
    renderTrip()
    fireEvent.click(await screen.findByRole('button', { name: 'Add a stop' }))
    const stateSelect = await screen.findByRole('combobox', { name: 'Nigerian state or territory' })
    expect(stateSelect.options).toHaveLength(38)
    expect([...stateSelect.options].map((option) => option.value)).toContain('Federal Capital Territory')
    fireEvent.change(stateSelect, { target: { value: 'Lagos' } })
    expect(await screen.findByText('No published destinations in this state yet')).toBeInTheDocument()
    expect(fetchDestinations).toHaveBeenCalledWith({ country: 'Nigeria', state: 'Lagos', page: 1, limit: 50 })
  })
})
