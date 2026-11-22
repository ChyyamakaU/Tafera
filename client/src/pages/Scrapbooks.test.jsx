import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../contexts/AuthContext'
import Scrapbooks from './Scrapbooks'
import { createScrapbook, fetchScrapbook, fetchScrapbooks, uploadScrapbookImage } from '../services/scrapbooks'
import { fetchMyTrips } from '../services/trips'

vi.mock('../services/scrapbooks', () => ({
  createScrapbook: vi.fn(), deleteScrapbook: vi.fn(), deleteScrapbookImage: vi.fn(),
  fetchScrapbook: vi.fn(), fetchScrapbooks: vi.fn(), linkScrapbookTrip: vi.fn(),
  reorderScrapbookImages: vi.fn(), setScrapbookVisibility: vi.fn(), unlinkScrapbookTrip: vi.fn(),
  updateScrapbook: vi.fn(), updateScrapbookImage: vi.fn(), uploadScrapbookImage: vi.fn(),
}))
vi.mock('../services/trips', () => ({ fetchMyTrips: vi.fn() }))

const album = { id: 'journal-1', title: 'Lagos weekend', description: 'A few memories', isPublic: false, tripId: null, imageCount: 0, images: [] }

const renderPage = () => render(<MemoryRouter><AuthContext.Provider value={{ isAuthenticated: true, isLoading: false }}><Scrapbooks /></AuthContext.Provider></MemoryRouter>)

beforeEach(() => {
  vi.resetAllMocks()
  fetchScrapbooks.mockResolvedValue({ journals: [album], pagination: { hasNextPage: false } })
  fetchMyTrips.mockResolvedValue({ trips: [] })
  fetchScrapbook.mockResolvedValue(album)
})

describe('Scrapbooks', () => {
  it('creates private albums using the scrapbook API and lets the owner open them', async () => {
    createScrapbook.mockResolvedValue(album)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: 'Create scrapbook' }))
    fireEvent.change(screen.getByLabelText('Album title'), { target: { value: 'Lagos weekend' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create scrapbook', exact: true }))
    await waitFor(() => expect(createScrapbook).toHaveBeenCalledWith(expect.objectContaining({ title: 'Lagos weekend', isPublic: false })))
    expect((await screen.findAllByText('Lagos weekend')).length).toBeGreaterThan(0)
  })

  it('offers photo upload with caption, date, file preview and MIME/size validation', async () => {
    const detail = { ...album, images: [] }
    fetchScrapbook.mockResolvedValue(detail)
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Lagos weekend/ }))
    const file = new File(['photo-bytes'], 'lagos.png', { type: 'image/png' })
    fireEvent.change(await screen.findByLabelText(/Photo \(JPEG/), { target: { files: [file] } })
    expect(await screen.findByAltText('Selected photo preview')).toBeInTheDocument()
    expect(screen.getByLabelText('Caption')).toBeInTheDocument()
    expect(screen.getByLabelText('Date taken')).toBeInTheDocument()
    uploadScrapbookImage.mockResolvedValue({ id: 'image-1' })
    fireEvent.change(screen.getByLabelText('Caption'), { target: { value: 'Sunset by the water' } })
    fireEvent.change(screen.getByLabelText('Date taken'), { target: { value: '2026-11-20' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Upload photo' }).closest('form'))
    await waitFor(() => expect(uploadScrapbookImage).toHaveBeenCalledWith('journal-1', expect.objectContaining({ file, caption: 'Sunset by the water', takenAt: '2026-11-20' })))
  })
})
