import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Destinations from './Destinations'
import { fetchCommunityDestinationPhotos } from '../services/destinations'

vi.mock('../services/destinations', () => ({
  fetchCommunityDestinationPhotos: vi.fn(),
}))

const PHOTO = {
  id: 'photo-1',
  imageUrl: 'https://images.example/kyoto.jpg',
  caption: 'Evening in Gion',
  uploadedAt: '2026-06-01T00:00:00.000Z',
  contributor: { id: 'traveller-2', fullName: 'Maya Traveller' },
  destination: {
    id: 'destination-1',
    name: 'Kyoto',
    slug: 'kyoto-japan',
    country: 'Japan',
    state: 'Kyoto',
    location: 'Kyoto, Japan',
  },
}

describe('Explore destinations community gallery', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows traveller photos with destination, contributor, caption and destination link', async () => {
    fetchCommunityDestinationPhotos.mockResolvedValue({
      photos: [PHOTO],
      pagination: { page: 1, total: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    })

    render(<MemoryRouter><Destinations /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'Kyoto' })).toBeInTheDocument()
    expect(screen.getByText('Kyoto, Japan')).toBeInTheDocument()
    expect(screen.getByText('Evening in Gion')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Maya Traveller' })).toHaveAttribute('href', '/users/traveller-2')
    expect(screen.getByRole('link', { name: 'Explore Kyoto gallery' })).toHaveAttribute('href', '/destinations/kyoto-japan')
    expect(screen.getByText(/2026/)).toBeInTheDocument()
    await waitFor(() => expect(fetchCommunityDestinationPhotos).toHaveBeenCalledWith({
      q: '', country: '', state: '', page: 1, limit: 12,
    }))
  })

  it('searches the public gallery by destination, country and region', async () => {
    fetchCommunityDestinationPhotos.mockResolvedValue({
      photos: [],
      pagination: { page: 1, total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
    })

    render(<MemoryRouter><Destinations /></MemoryRouter>)

    fireEvent.change(screen.getByLabelText('Destination or location'), { target: { value: 'Kyoto' } })
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'Japan' } })
    fireEvent.change(screen.getByLabelText('State or region'), { target: { value: 'Kyoto' } })
    fireEvent.click(screen.getByRole('button', { name: 'Search photos' }))

    await waitFor(() => expect(fetchCommunityDestinationPhotos).toHaveBeenLastCalledWith({
      q: 'Kyoto', country: 'Japan', state: 'Kyoto', page: 1, limit: 12,
    }))
  })

  it('explains when the community gallery has no traveller photos yet', async () => {
    fetchCommunityDestinationPhotos.mockResolvedValue({
      photos: [],
      pagination: { page: 1, total: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
    })

    render(<MemoryRouter><Destinations /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'No community photos yet' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Discover destinations' })).toHaveAttribute('href', '/')
  })
})
