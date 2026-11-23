import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MyDestinations from './MyDestinations'
import { fetchMyDestinations } from '../services/destinations'

vi.mock('../services/destinations', () => ({ fetchMyDestinations: vi.fn() }))

describe('My Destinations personal contributions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('groups only the destinations returned for the current user', async () => {
    fetchMyDestinations.mockResolvedValue([
      {
        id: 'destination-1',
        name: 'Kyoto',
        slug: 'kyoto-japan',
        country: 'Japan',
        state: 'Kyoto',
        location: 'Kyoto, Japan',
        contributedPhotoCount: 3,
        representativeImage: { id: 'photo-1', imageUrl: 'https://images.example/kyoto.jpg' },
      },
      {
        id: 'destination-2',
        name: 'Lagos',
        slug: 'lagos-nigeria',
        country: 'Nigeria',
        location: 'Lagos, Nigeria',
        contributedPhotoCount: 1,
        representativeImage: { id: 'photo-2', imageUrl: 'https://images.example/lagos.jpg' },
      },
    ])

    render(<MemoryRouter><MyDestinations /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'Kyoto' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Lagos' })).toBeInTheDocument()
    expect(screen.getByText('3 photos contributed')).toBeInTheDocument()
    expect(screen.getByText('1 photo contributed')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Kyoto/ })).toHaveAttribute('href', '/my-destinations/kyoto-japan')
    expect(screen.queryByText('Paris')).not.toBeInTheDocument()
  })

  it('shows an empty state that links to Explore Destinations', async () => {
    fetchMyDestinations.mockResolvedValue([])

    render(<MemoryRouter><MyDestinations /></MemoryRouter>)

    expect(await screen.findByText('You have not contributed any destination photos yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Explore destinations' })).toHaveAttribute('href', '/destinations')
  })
})
