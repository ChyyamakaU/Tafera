import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import MyDestinationDetail from './MyDestinationDetail'
import { deleteDestinationImage, fetchMyDestination } from '../services/destinations'

vi.mock('../services/destinations', () => ({
  fetchMyDestination: vi.fn(),
  deleteDestinationImage: vi.fn(),
}))

const DESTINATION = {
  id: 'destination-1',
  name: 'Kyoto',
  slug: 'kyoto-japan',
  country: 'Japan',
  state: 'Kyoto',
  location: 'Kyoto, Japan',
  contributedPhotoCount: 1,
  images: [{
    id: 'photo-own',
    imageUrl: 'https://images.example/own.jpg',
    caption: 'Sunrise over the city',
    uploadedAt: '2026-06-02T00:00:00.000Z',
  }],
}

const renderDetail = () => render(
  <MemoryRouter initialEntries={['/my-destinations/kyoto-japan']}>
    <Routes>
      <Route path="/my-destinations/:slug" element={<MyDestinationDetail />} />
    </Routes>
  </MemoryRouter>,
)

describe('My Destination detail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchMyDestination.mockResolvedValue(DESTINATION)
    deleteDestinationImage.mockResolvedValue(undefined)
  })

  it('shows only the current user contribution and links to the public gallery', async () => {
    renderDetail()

    expect(await screen.findByRole('heading', { name: 'Kyoto' })).toBeInTheDocument()
    expect(screen.getByText('Sunrise over the city')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View public gallery' })).toHaveAttribute('href', '/destinations/kyoto-japan')
    await waitFor(() => expect(fetchMyDestination).toHaveBeenCalledWith('kyoto-japan'))
  })

  it('deletes an owned contribution and updates the count', async () => {
    renderDetail()

    fireEvent.click(await screen.findByRole('button', { name: 'Delete photo Sunrise over the city' }))

    await waitFor(() => expect(deleteDestinationImage).toHaveBeenCalledWith('destination-1', 'photo-own'))
    expect(await screen.findByRole('heading', { name: 'You have no photos for this destination' })).toBeInTheDocument()
    expect(screen.getByText('0 photos contributed')).toBeInTheDocument()
  })
})
