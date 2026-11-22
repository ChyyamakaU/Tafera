import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../contexts/AuthContext'
import GroupTravel from './GroupTravel'
import { fetchMyParticipation, fetchMyTrips, fetchPublicTrips, leaveTrip, requestToJoinTrip } from '../services/trips'

vi.mock('../services/trips', () => ({
  createTrip: vi.fn(), fetchMyParticipation: vi.fn(), fetchMyTrips: vi.fn(),
  fetchPublicTrips: vi.fn(), leaveTrip: vi.fn(), requestToJoinTrip: vi.fn(),
}))

const group = {
  id: 'group-1', title: 'Hiking the Alps', tripType: 'group', status: 'published',
  startDate: '2027-08-01', endDate: '2027-08-10', maxParticipants: 8,
  spotsRemaining: 3, creator: { id: 'organizer', fullName: 'Trip Host' },
}

const renderGroupTravel = (auth = {}) => render(
  <MemoryRouter>
    <AuthContext.Provider value={{ isAuthenticated: true, isEmailVerified: true, isLoading: false, user: { id: 'traveller' }, ...auth }}>
      <GroupTravel />
    </AuthContext.Provider>
  </MemoryRouter>,
)

beforeEach(() => {
  vi.resetAllMocks()
  fetchPublicTrips.mockResolvedValue({ trips: [group], pagination: { hasNextPage: false } })
  fetchMyTrips.mockResolvedValue({ trips: [], pagination: { hasNextPage: false } })
  fetchMyParticipation.mockResolvedValue(null)
})

describe('Group travel page', () => {
  it('discovers published group trips and shows organizer and capacity', async () => {
    renderGroupTravel()
    expect(await screen.findByText('Hiking the Alps')).toBeInTheDocument()
    expect(screen.getByText('Organised by Trip Host')).toBeInTheDocument()
    expect(screen.getByText('3 places remaining')).toBeInTheDocument()
    expect(fetchPublicTrips).toHaveBeenCalledWith({ page: 1, limit: 50 })
  })

  it('allows a verified traveler to request and then leave a place', async () => {
    requestToJoinTrip.mockResolvedValue({ id: 'participation-1', status: 'pending' })
    leaveTrip.mockResolvedValue({ id: 'participation-1', status: 'cancelled' })
    fetchMyParticipation
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'participation-1', status: 'pending' })
      .mockResolvedValueOnce({ id: 'participation-1', status: 'cancelled' })
    renderGroupTravel()
    fireEvent.click(await screen.findByRole('button', { name: 'Request to join' }))
    await waitFor(() => expect(requestToJoinTrip).toHaveBeenCalledWith(group.id))
    expect(await screen.findByText('Request pending')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Leave trip' }))
    await waitFor(() => expect(leaveTrip).toHaveBeenCalledWith(group.id))
  })

  it('shows trips the authenticated user organizes with management links', async () => {
    fetchPublicTrips.mockResolvedValue({ trips: [{ ...group, creator: { id: 'traveller', fullName: 'Me' } }] })
    fetchMyTrips.mockResolvedValue({ trips: [{ ...group, creator: undefined }], pagination: { hasNextPage: false } })
    renderGroupTravel()
    expect(await screen.findByRole('link', { name: 'Manage itinerary and participants →' })).toHaveAttribute('href', `/trips/${group.id}`)
    expect(screen.getByText('Your trip')).toBeInTheDocument()
  })
})
