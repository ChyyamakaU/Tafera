import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../contexts/AuthContext'
import GroupTravel from './GroupTravel'
import { fetchMyParticipation, fetchMyTrips, fetchPublicTrips, leaveTrip, requestToJoinTrip } from '../services/trips'

vi.mock('../services/trips', () => ({
  createTrip: vi.fn(),
  fetchMyParticipation: vi.fn(),
  fetchMyTrips: vi.fn(),
  fetchPublicTrips: vi.fn(),
  leaveTrip: vi.fn(),
  requestToJoinTrip: vi.fn(),
}))

const group = {
  id: 'group-1',
  title: 'Hiking the Alps',
  tripType: 'group',
  status: 'published',
  startDate: '2027-08-01',
  endDate: '2027-08-10',
  maxParticipants: 8,
  spotsRemaining: 3,
  creator: { id: 'organizer', fullName: 'Trip Host' },
}

const groupPageTwo = {
  id: 'group-2',
  title: 'Coastal Lagos Weekend',
  tripType: 'group',
  status: 'published',
  startDate: '2027-09-04',
  endDate: '2027-09-07',
  maxParticipants: 10,
  spotsRemaining: 6,
  creator: { id: 'organizer-2', fullName: 'Sade Ade' },
}

const renderGroupTravel = (auth = {}) => render(
  <MemoryRouter>
    <AuthContext.Provider value={{ isAuthenticated: true, isEmailVerified: true, isLoading: false, user: { id: 'traveller' }, ...auth }}>
      <GroupTravel />
    </AuthContext.Provider>
  </MemoryRouter>,
)

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.resetAllMocks()
  fetchPublicTrips.mockResolvedValue({
    trips: [group],
    pagination: { page: 1, limit: 12, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
  })
  fetchMyTrips.mockResolvedValue({ trips: [], pagination: { hasNextPage: false } })
  fetchMyParticipation.mockResolvedValue(null)
})

describe('Group travel page', () => {
  it('discovers published group trips and shows organizer and capacity', async () => {
    renderGroupTravel()
    expect(await screen.findByText('Hiking the Alps')).toBeInTheDocument()
    expect(screen.getByText('Organised by Trip Host')).toBeInTheDocument()
    expect(screen.getByText('3 places remaining')).toBeInTheDocument()
    expect(fetchPublicTrips).toHaveBeenCalledWith({ page: 1, limit: 12 })
    expect(screen.queryByRole('navigation', { name: 'Discover group trips pagination' })).not.toBeInTheDocument()
  })

  it('paginates published group trips, preserves owned trips, and shows a loading skeleton during page transitions', async () => {
    let resolvePageTwo
    fetchMyTrips.mockResolvedValue({
      trips: [{ ...group, id: 'owned-1', title: 'My Organised Retreat', creator: { id: 'traveller', fullName: 'Me' } }],
      pagination: { hasNextPage: false },
    })
    fetchPublicTrips
      .mockResolvedValueOnce({
        trips: [group],
        pagination: { page: 1, limit: 12, total: 24, totalPages: 2, hasNextPage: true, hasPreviousPage: false },
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolvePageTwo = () =>
              resolve({
                trips: [groupPageTwo],
                pagination: { page: 2, limit: 12, total: 24, totalPages: 2, hasNextPage: false, hasPreviousPage: true },
              })
          }),
      )
      .mockResolvedValueOnce({
        trips: [group],
        pagination: { page: 1, limit: 12, total: 24, totalPages: 2, hasNextPage: true, hasPreviousPage: false },
      })

    renderGroupTravel()

    expect(await screen.findByText('Hiking the Alps')).toBeInTheDocument()
    expect(screen.getByText('My Organised Retreat')).toBeInTheDocument()
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page')

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(fetchPublicTrips).toHaveBeenLastCalledWith({ page: 2, limit: 12 })
    expect(screen.getByLabelText('Loading group trips')).toBeInTheDocument()
    expect(screen.getByText('My Organised Retreat')).toBeInTheDocument()
    expect(fetchMyTrips).toHaveBeenCalledTimes(1)

    resolvePageTwo()

    expect(await screen.findByText('Coastal Lagos Weekend')).toBeInTheDocument()
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Previous' })).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page')

    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))

    expect(await screen.findByText('Hiking the Alps')).toBeInTheDocument()
    expect(fetchPublicTrips).toHaveBeenLastCalledWith({ page: 1, limit: 12 })
  })

  it('shows a clear empty state when no published group trips exist or when a page has none', async () => {
    fetchPublicTrips.mockResolvedValueOnce({
      trips: [],
      pagination: { page: 1, limit: 12, total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
    })

    renderGroupTravel()
    expect(await screen.findByText('No published group trips are available right now.')).toBeInTheDocument()
    cleanup()

    fetchPublicTrips.mockResolvedValueOnce({
      trips: [{ ...group, id: 'personal-1', tripType: 'personal' }],
      pagination: { page: 1, limit: 12, total: 15, totalPages: 2, hasNextPage: true, hasPreviousPage: false },
    })

    renderGroupTravel()
    expect(await screen.findByText('No published group trips appear on this page.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).not.toBeDisabled()
  })

  it('allows a verified traveler to request and then leave a place on the current page', async () => {
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

  it('does not request member-only trip endpoints for unverified users', async () => {
    renderGroupTravel({ isAuthenticated: true, isEmailVerified: false })
    expect(await screen.findByText('Hiking the Alps')).toBeInTheDocument()
    expect(screen.getByText(/Verify your email to create or join group trips/)).toBeInTheDocument()
    expect(fetchMyTrips).not.toHaveBeenCalled()
    expect(fetchMyParticipation).not.toHaveBeenCalled()
  })
})
