import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TravellerStories from './TravellerStories'
import { fetchPublicPosts } from '../../services/posts'
import { fetchFeaturedStories } from '../../services/stories'

vi.mock('../../services/posts', () => ({ fetchPublicPosts: vi.fn() }))
vi.mock('../../services/stories', () => ({ fetchFeaturedStories: vi.fn() }))

afterEach(() => {
  cleanup()
})

beforeEach(() => {
  vi.resetAllMocks()
  fetchFeaturedStories.mockResolvedValue([])
  fetchPublicPosts.mockResolvedValue([])
})

describe('TravellerStories showcase', () => {
  it('renders manually curated stories when available without falling back to public posts', async () => {
    fetchFeaturedStories.mockResolvedValue([
      {
        id: 'story-1',
        title: 'Dawn above Idanre Hills',
        excerpt: 'Climbing the steps before sunrise.',
        badgeLabel: 'Editor’s pick',
        authorName: 'Tunde Explorer',
        author: { id: 'user-9', fullName: 'Tunde Explorer' },
        destination: {
          id: 'dest-1',
          name: 'Idanre Hills',
          slug: 'idanre-hills',
          location: 'Ondo, Nigeria',
          country: 'Nigeria',
          coverImage: { imageUrl: 'https://example.com/dest.jpg', altText: 'Hills' },
        },
        coverImageUrl: 'https://example.com/custom-cover.jpg',
        coverImageAlt: 'Custom dawn view',
        isFeatured: true,
        displayOrder: 0,
      },
    ])

    render(<MemoryRouter><TravellerStories /></MemoryRouter>)

    expect(await screen.findByText('Dawn above Idanre Hills')).toBeInTheDocument()
    expect(screen.getByText('Editor’s pick')).toBeInTheDocument()
    expect(screen.getByAltText('Custom dawn view')).toHaveAttribute('src', 'https://example.com/custom-cover.jpg')
    expect(screen.getByRole('link', { name: 'Tunde Explorer' })).toHaveAttribute('href', '/users/user-9')
    expect(screen.getByRole('link', { name: 'Explore Idanre Hills' })).toHaveAttribute('href', '/destinations/idanre-hills')
    expect(fetchPublicPosts).not.toHaveBeenCalled()
  })

  it('falls back to destination-linked posts as traveller spotlights when no curated stories are featured', async () => {
    fetchFeaturedStories.mockResolvedValue([])
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

  it('shows a real-content empty state when neither curated stories nor destination-linked posts exist', async () => {
    fetchFeaturedStories.mockResolvedValue([])
    fetchPublicPosts.mockResolvedValue([{ id: 'post-1', content: 'A post', author: { id: 'user-1' }, destination: null }])
    render(<MemoryRouter><TravellerStories /></MemoryRouter>)
    expect(await screen.findByText('Destination-linked traveller stories will be featured here as they are shared.')).toBeInTheDocument()
  })
})
