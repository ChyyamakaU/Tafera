import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TravellerStories from './TravellerStories'
import { fetchPublicPosts } from '../../services/posts'

vi.mock('../../services/posts', () => ({ fetchPublicPosts: vi.fn() }))

beforeEach(() => vi.resetAllMocks())

describe('TravellerStories showcase', () => {
  it('presents destination-linked posts as traveller spotlights, not feed cards', async () => {
    fetchPublicPosts.mockResolvedValue([
      { id: 'post-1', content: 'A memorable walk', author: { id: 'user-1', fullName: 'Ada Traveller' }, destination: { id: 'dest-1', name: 'Lagos', slug: 'lagos', country: 'Nigeria' } },
      { id: 'post-2', content: 'A destination-free update', author: { id: 'user-2', fullName: 'No Place' }, destination: null },
    ])
    render(<MemoryRouter><TravellerStories /></MemoryRouter>)
    expect(await screen.findByText('A traveller’s moment in Lagos')).toBeInTheDocument()
    expect(screen.getByText('Traveller spotlight')).toBeInTheDocument()
    expect(screen.queryByText('A destination-free update')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Explore Lagos' })).toHaveAttribute('href', '/destinations/lagos')
  })

  it('shows a real-content empty state when there are no destination-linked posts', async () => {
    fetchPublicPosts.mockResolvedValue([{ id: 'post-1', content: 'A post', author: { id: 'user-1' }, destination: null }])
    render(<MemoryRouter><TravellerStories /></MemoryRouter>)
    expect(await screen.findByText('Destination-linked traveller stories will be featured here as they are shared.')).toBeInTheDocument()
  })
})
