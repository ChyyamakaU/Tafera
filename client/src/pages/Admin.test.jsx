import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Admin from './Admin'
import { fetchDestinations } from '../services/destinations'
import {
  createStory,
  deleteStory,
  fetchAdminStories,
  reorderStories,
  updateStory,
  uploadStoryCover,
} from '../services/stories'

vi.mock('../services/destinations', () => ({ fetchDestinations: vi.fn() }))
vi.mock('../services/stories', () => ({
  createStory: vi.fn(),
  deleteStory: vi.fn(),
  fetchAdminStories: vi.fn(),
  reorderStories: vi.fn(),
  updateStory: vi.fn(),
  uploadStoryCover: vi.fn(),
}))

const storyOne = {
  id: 'story-1',
  title: 'Dawn above Idanre Hills',
  excerpt: 'Climbing the 660 steps before sunrise.',
  badgeLabel: 'Traveller spotlight',
  authorName: 'Ada Traveller',
  destination: { id: 'dest-1', name: 'Idanre Hills', country: 'Nigeria' },
  coverImageUrl: null,
  coverImageAlt: null,
  isFeatured: true,
  displayOrder: 0,
}

const storyTwo = {
  id: 'story-2',
  title: 'Calabar River Dusk',
  excerpt: 'Quiet ferries along the estuary.',
  badgeLabel: 'Editor’s pick',
  authorName: 'Tunde Explorer',
  destination: null,
  coverImageUrl: null,
  coverImageAlt: null,
  isFeatured: false,
  displayOrder: 1,
}

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.resetAllMocks()
  fetchAdminStories.mockResolvedValue([storyOne, storyTwo])
  fetchDestinations.mockResolvedValue({
    destinations: [{ id: 'dest-1', name: 'Idanre Hills', country: 'Nigeria' }],
  })
})

describe('Admin editorial curation page', () => {
  it('creates a curated story and uploads an optional Cloudinary cover image', async () => {
    const file = new File(['cover'], 'cover.jpg', { type: 'image/jpeg' })
    const created = {
      ...storyOne,
      id: 'story-3',
      title: 'Abuja Rock Views',
      excerpt: 'Golden hour over Zuma Rock.',
      authorName: 'Sade Ade',
    }
    const withCover = {
      ...created,
      coverImageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/zuma.jpg',
      coverImageAlt: 'Zuma Rock at sunset',
    }
    createStory.mockResolvedValue(created)
    uploadStoryCover.mockResolvedValue(withCover)

    render(<MemoryRouter><Admin /></MemoryRouter>)
    expect(await screen.findByText('Dawn above Idanre Hills')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'New story' }))
    fireEvent.change(screen.getByLabelText('Headline'), { target: { value: 'Abuja Rock Views' } })
    fireEvent.change(screen.getByLabelText('Story excerpt'), { target: { value: 'Golden hour over Zuma Rock.' } })
    fireEvent.change(screen.getByLabelText('Author attribution'), { target: { value: 'Sade Ade' } })
    fireEvent.change(screen.getByLabelText('Linked destination'), { target: { value: 'dest-1' } })
    fireEvent.change(screen.getByLabelText('Upload cover image'), { target: { files: [file] } })
    fireEvent.change(screen.getByLabelText('Cover alt text (optional)'), { target: { value: 'Zuma Rock at sunset' } })
    fireEvent.click(screen.getByRole('button', { name: 'Publish story' }))

    await waitFor(() => expect(createStory).toHaveBeenCalledOnce())
    expect(uploadStoryCover).toHaveBeenCalledWith('story-3', file, 'Zuma Rock at sunset')
    expect(await screen.findByText('Abuja Rock Views')).toBeInTheDocument()
  })

  it('optimistically toggles featured status and rolls back on failure', async () => {
    updateStory
      .mockResolvedValueOnce({ ...storyOne, isFeatured: false })
      .mockRejectedValueOnce(new Error('Update failed'))

    render(<MemoryRouter><Admin /></MemoryRouter>)
    expect(await screen.findByText('Dawn above Idanre Hills')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Hide' }))
    await waitFor(() => expect(updateStory).toHaveBeenCalledWith('story-1', { isFeatured: false }))

    // Now both are hidden; try featuring the first and simulate server failure
    const featureButtons = screen.getAllByRole('button', { name: 'Feature' })
    fireEvent.click(featureButtons[0])

    expect(await screen.findByRole('alert')).toHaveTextContent('Update failed')
    expect(screen.getAllByText('Hidden')).toHaveLength(2)
  })

  it('reorders stories via PUT /api/stories/reorder and rolls back failed deletes', async () => {
    reorderStories.mockResolvedValue([
      { ...storyTwo, displayOrder: 0 },
      { ...storyOne, displayOrder: 1 },
    ])
    deleteStory.mockRejectedValueOnce(new Error('Delete failed'))

    render(<MemoryRouter><Admin /></MemoryRouter>)
    expect(await screen.findByText('Calabar River Dusk')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Move Calabar River Dusk up' }))
    await waitFor(() => expect(reorderStories).toHaveBeenCalledWith(['story-2', 'story-1']))

    const headings = screen.getAllByRole('heading', { level: 2 })
    expect(headings[0]).toHaveTextContent('Calabar River Dusk')

    fireEvent.click(screen.getByRole('button', { name: 'Delete Calabar River Dusk' }))
    expect(screen.queryByText('Calabar River Dusk')).not.toBeInTheDocument()

    expect(await screen.findByText('Calabar River Dusk')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Delete failed')
  })
})
