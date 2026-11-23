import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthContext } from '../contexts/AuthContext'
import DestinationDetail from './DestinationDetail'
import { deleteDestinationImage, fetchDestination, uploadDestinationImage } from '../services/destinations'

vi.mock('../services/destinations', () => ({
  fetchDestination: vi.fn(),
  uploadDestinationImage: vi.fn(),
  deleteDestinationImage: vi.fn(),
}))

const DESTINATION = {
  id: 'destination-1',
  name: 'Kyoto',
  slug: 'kyoto',
  country: 'Japan',
  description: 'An ancient city.',
  images: [{
    id: 'photo-community',
    imageUrl: 'https://images.example/community.jpg',
    caption: 'Evening in Gion',
    uploadedAt: '2026-06-01T00:00:00.000Z',
    contributor: { id: 'traveller-2', fullName: 'Maya Traveller' },
  }],
}

const renderDestination = (authValue) => render(
  <MemoryRouter initialEntries={['/destinations/kyoto']}>
    <AuthContext.Provider value={authValue}>
      <Routes>
        <Route path="/destinations/:slug" element={<DestinationDetail />} />
      </Routes>
    </AuthContext.Provider>
  </MemoryRouter>,
)

describe('DestinationDetail traveller gallery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchDestination.mockResolvedValue(DESTINATION)
  })

  it('lets an authenticated traveller upload a captioned photo and shows their contribution after refresh', async () => {
    const ownPhoto = {
      id: 'photo-own',
      imageUrl: 'https://images.example/own.jpg',
      caption: 'Sunrise over the city',
      uploadedAt: '2026-06-02T00:00:00.000Z',
      contributor: { id: 'traveller-1', fullName: 'Ada Traveller' },
    }
    fetchDestination
      .mockResolvedValueOnce(DESTINATION)
      .mockResolvedValueOnce({ ...DESTINATION, images: [...DESTINATION.images, ownPhoto] })
    uploadDestinationImage.mockResolvedValue(ownPhoto)
    deleteDestinationImage.mockResolvedValue(undefined)

    renderDestination({ user: { id: 'traveller-1', role: 'user' }, isAuthenticated: true, isEmailVerified: true })

    expect(await screen.findByText('Maya Traveller')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Upload photos' })).toHaveAttribute('href', '#destination-photo')
    const photo = new File(['image-data'], 'kyoto.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText('Upload a photo'), { target: { files: [photo] } })
    fireEvent.change(screen.getByLabelText(/Caption/), { target: { value: ownPhoto.caption } })
    fireEvent.submit(screen.getByRole('button', { name: 'Upload photo' }).closest('form'))

    await waitFor(() => expect(uploadDestinationImage).toHaveBeenCalledWith('destination-1', {
      file: photo,
      caption: ownPhoto.caption,
    }))
    expect(await screen.findByText(/^Your contributions/)).toBeInTheDocument()
    expect(screen.getByText('Sunrise over the city')).toBeInTheDocument()
    expect(screen.getByText('Your photo')).toBeInTheDocument()
    expect(screen.getByText('Your photo was added to the destination gallery.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Delete photo Sunrise over the city' }))
    await waitFor(() => expect(deleteDestinationImage).toHaveBeenCalledWith('destination-1', 'photo-own'))
  })

  it('shows public gallery attribution and offers sign-in rather than upload to guests', async () => {
    renderDestination({ user: null, isAuthenticated: false, isEmailVerified: false })

    expect(await screen.findByText('Maya Traveller')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in to contribute' })).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('link', { name: 'Upload photos' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Upload a photo')).not.toBeInTheDocument()
  })
})
