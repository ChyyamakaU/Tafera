import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext } from '../contexts/AuthContext'
import TripDetail from './TripDetail'
import { fetchDestinations } from '../services/destinations'
import {
  addTripActivity,
  deleteTripActivity,
  fetchTrip,
  reorderTripStops,
  updateTripActivity,
  updateTripStop,
} from '../services/trips'

vi.mock('../services/trips', () => ({
  addTripActivity: vi.fn(),
  addTripStop: vi.fn(),
  deleteTrip: vi.fn(),
  deleteTripActivity: vi.fn(),
  deleteTripStop: vi.fn(),
  fetchMyParticipation: vi.fn(),
  fetchTrip: vi.fn(),
  fetchTripParticipants: vi.fn(),
  leaveTrip: vi.fn(),
  moderateTripParticipant: vi.fn(),
  reorderTripStops: vi.fn(),
  requestToJoinTrip: vi.fn(),
  updateTrip: vi.fn(),
  updateTripActivity: vi.fn(),
  updateTripStop: vi.fn(),
}))

vi.mock('../services/destinations', () => ({ fetchDestinations: vi.fn() }))

const activityOne = {
  id: 'act-1',
  tripDestinationId: 'stop-1',
  title: 'Tsukiji Market Walk',
  description: 'Breakfast sushi tour',
  activityDate: '2027-03-02',
  startTime: '08:30',
  endTime: '10:30',
  location: 'Chuo City',
}

const activityTwo = {
  id: 'act-2',
  tripDestinationId: 'stop-2',
  title: 'Fushimi Inari Hike',
  description: null,
  activityDate: '2027-03-05',
  startTime: '07:00',
  endTime: '09:30',
  location: 'Fushimi Ward',
}

const trip = {
  id: 'trip-1',
  title: 'Japan',
  description: 'Spring travels',
  tripType: 'personal',
  startDate: '2027-03-01',
  endDate: '2027-03-10',
  status: 'draft',
  maxParticipants: null,
  isCreator: true,
  stops: [
    { id: 'stop-1', destinationId: 'destination-1', stopOrder: 1, destination: { name: 'Tokyo', country: 'Japan' } },
    { id: 'stop-2', destinationId: 'destination-2', stopOrder: 2, destination: { name: 'Kyoto', country: 'Japan' } },
  ],
  activities: [activityTwo, activityOne],
}

const renderTrip = (auth = {}) => render(
  <MemoryRouter initialEntries={['/trips/trip-1']}>
    <AuthContext.Provider value={{ isAuthenticated: true, isEmailVerified: true, isLoading: false, user: { id: 'owner' }, ...auth }}>
      <Routes><Route path="/trips/:tripId" element={<TripDetail />} /></Routes>
    </AuthContext.Provider>
  </MemoryRouter>,
)

afterEach(() => {
  cleanup()
})

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
    expect(screen.getAllByText('Tokyo').length).toBeGreaterThan(0)
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

  it('renders day-grouped activities ordered chronologically and validates endTime > startTime on create', async () => {
    const added = {
      id: 'act-3',
      tripDestinationId: 'stop-1',
      title: 'Shibuya Crossing',
      description: 'Evening stroll',
      activityDate: '2027-03-02',
      startTime: '18:00',
      endTime: '19:30',
      location: 'Shibuya',
    }
    addTripActivity.mockResolvedValue({ ...trip, activities: [...trip.activities, added] })

    renderTrip()
    expect(await screen.findByText('Tsukiji Market Walk')).toBeInTheDocument()
    expect(screen.getByText('Fushimi Inari Hike')).toBeInTheDocument()
    expect(screen.getByText(/Day 2 ·/)).toBeInTheDocument()
    expect(screen.getByText(/Day 5 ·/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add activity' }))
    fireEvent.change(screen.getByLabelText('Activity title'), { target: { value: 'Shibuya Crossing' } })
    fireEvent.change(screen.getByLabelText('Activity date'), { target: { value: '2027-03-02' } })
    fireEvent.change(screen.getByLabelText('Start time (optional)'), { target: { value: '18:00' } })
    fireEvent.change(screen.getByLabelText('End time (optional)'), { target: { value: '17:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save activity' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('End time must be later than the start time.')
    expect(addTripActivity).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('End time (optional)'), { target: { value: '19:30' } })
    fireEvent.change(screen.getByLabelText('Linked stop'), { target: { value: 'stop-1' } })
    fireEvent.change(screen.getByLabelText('Location (optional)'), { target: { value: 'Shibuya' } })
    fireEvent.change(screen.getByLabelText('Notes (optional)'), { target: { value: 'Evening stroll' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save activity' }))

    await waitFor(() =>
      expect(addTripActivity).toHaveBeenCalledWith('trip-1', {
        title: 'Shibuya Crossing',
        activityDate: '2027-03-02',
        startTime: '18:00',
        endTime: '19:30',
        location: 'Shibuya',
        tripDestinationId: 'stop-1',
        description: 'Evening stroll',
      }),
    )
    expect(await screen.findByText('Shibuya Crossing')).toBeInTheDocument()
  })

  it('edits an activity and rolls back optimistic deletion on error', async () => {
    const edited = { ...activityOne, title: 'Updated Market Tour' }
    updateTripActivity.mockResolvedValue({
      ...trip,
      activities: [activityTwo, edited],
    })
    deleteTripActivity.mockRejectedValueOnce(new Error('Delete failed'))

    renderTrip()
    expect(await screen.findByText('Tsukiji Market Walk')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Edit Tsukiji Market Walk' }))
    fireEvent.change(screen.getByLabelText('Activity title'), { target: { value: 'Updated Market Tour' } })
    fireEvent.click(screen.getByRole('button', { name: 'Update activity' }))

    await waitFor(() =>
      expect(updateTripActivity).toHaveBeenCalledWith(
        'trip-1',
        'act-1',
        expect.objectContaining({ title: 'Updated Market Tour' }),
      ),
    )
    expect(await screen.findByText('Updated Market Tour')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete Updated Market Tour' }))
    expect(screen.queryByText('Updated Market Tour')).not.toBeInTheDocument()

    expect(await screen.findByText('Updated Market Tour')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Delete failed')
  })

  it('hides activity management controls from non-owners', async () => {
    fetchTrip.mockResolvedValue({ ...trip, isCreator: false, status: 'published' })
    renderTrip()
    expect(await screen.findByText('Tsukiji Market Walk')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add activity' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit Tsukiji Market Walk' })).not.toBeInTheDocument()
  })
})
