import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../contexts/AuthContext'
import { ThemeProvider } from '../contexts/ThemeContext'
import Home from './Home'
import { fetchDestinations } from '../services/destinations'
import { fetchFeaturedStories } from '../services/stories'
import { fetchPublicPosts } from '../services/posts'
import { fetchPublicTrips } from '../services/trips'

vi.mock('../services/destinations', () => ({ fetchDestinations: vi.fn() }))
vi.mock('../services/stories', () => ({ fetchFeaturedStories: vi.fn() }))
vi.mock('../services/posts', () => ({ fetchPublicPosts: vi.fn() }))
vi.mock('../services/trips', () => ({ fetchPublicTrips: vi.fn() }))

const mockDestinations = [
  {
    id: 'dest-1',
    name: 'Kyoto',
    slug: 'kyoto-japan',
    country: 'Japan',
    state: 'Kyoto',
    description: 'Classical Buddhist temples, shrines, and historic imperial palaces.',
    coverImage: { imageUrl: 'https://example.com/kyoto.jpg', altText: 'Kyoto temple' },
  },
  {
    id: 'dest-2',
    name: 'Banff',
    slug: 'banff-canada',
    country: 'Canada',
    state: 'Alberta',
    description: 'High alpine mountain trails and Banff National Park wildlife.',
    coverImage: { imageUrl: 'https://example.com/banff.jpg', altText: 'Banff peaks' },
  },
  {
    id: 'dest-3',
    name: 'Santorini',
    slug: 'santorini-greece',
    country: 'Greece',
    state: 'South Aegean',
    description: 'Volcanic island with dramatic coastal sea views and beaches.',
    coverImage: { imageUrl: 'https://example.com/santorini.jpg', altText: 'Santorini coast' },
  },
]

const renderHome = () =>
  render(
    <MemoryRouter>
      <ThemeProvider>
        <AuthContext.Provider value={{ user: null, isAuthenticated: false, isEmailVerified: false, isLoading: false }}>
          <Home />
        </AuthContext.Provider>
      </ThemeProvider>
    </MemoryRouter>,
  )

afterEach(() => {
  cleanup()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

beforeEach(() => {
  vi.resetAllMocks()
  fetchDestinations.mockResolvedValue({ destinations: mockDestinations })
  fetchFeaturedStories.mockResolvedValue([
    {
      id: 'story-1',
      title: 'Dawn above Kyoto',
      excerpt: 'Quiet temple steps at sunrise.',
      badgeLabel: 'Traveller spotlight',
      authorName: 'Ada Traveller',
      destination: mockDestinations[0],
      coverImageUrl: null,
      coverImageAlt: null,
      isFeatured: true,
      displayOrder: 0,
    },
  ])
  fetchPublicPosts.mockResolvedValue([])
  fetchPublicTrips.mockResolvedValue({
    trips: [
      {
        id: 'trip-1',
        title: 'Autumn in Kyoto',
        startDate: '2027-10-01',
        endDate: '2027-10-10',
        spotsRemaining: 4,
        creator: { fullName: 'Host One', emailVerified: true },
        stops: [],
      },
    ],
  })
})

describe('Homepage structure, carousel filtering, and theme adaptation', () => {
  it('renders sections in the exact required order after the untouched Hero', async () => {
    const { container } = renderHome()

    expect(await screen.findByText('Kyoto')).toBeInTheDocument()
    expect(await screen.findByText('Autumn in Kyoto')).toBeInTheDocument()

    expect(screen.getByRole('heading', { level: 1, name: 'Discover places. Find your people. Make memories.' })).toBeInTheDocument()

    const text = container.textContent
    const orderedMarkers = [
      'Discover places. Find your people. Make memories.',
      'So much to see. Right here at home.',
      'It’s not just where you go.',
      'Stories from travellers',
      'Same dream destination? Let’s go together.',
      'Trips You Can Join',
      'How it works',
      'Why we exist',
      'Ready to share your journey?',
    ]

    for (let index = 0; index < orderedMarkers.length - 1; index += 1) {
      const currentPos = text.indexOf(orderedMarkers[index])
      const nextPos = text.indexOf(orderedMarkers[index + 1])
      expect(currentPos).toBeGreaterThan(-1)
      expect(nextPos).toBeGreaterThan(currentPos)
    }
  })

  it('omits the category filter bar when destinations have no backed category or tags fields', async () => {
    renderHome()

    expect(await screen.findByText('Kyoto')).toBeInTheDocument()
    expect(screen.getByText('Banff')).toBeInTheDocument()
    expect(screen.getByText('Santorini')).toBeInTheDocument()

    expect(screen.queryByRole('group', { name: 'Filter destinations by category' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Santorini/ })).toHaveAttribute('href', '/destinations/santorini-greece')

    const carousel = screen.getByRole('region', { name: 'Destinations carousel' })
    expect(carousel).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('button', { name: 'Scroll destinations left' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Scroll destinations right' })).toBeInTheDocument()

    fireEvent.keyDown(carousel, { key: 'ArrowRight' })
    fireEvent.keyDown(carousel, { key: 'ArrowLeft' })
  })

  it('renders and filters backed category pills when destination records provide category or tags fields', async () => {
    fetchDestinations.mockResolvedValueOnce({
      destinations: [
        { ...mockDestinations[0], category: 'Historical Sites' },
        { ...mockDestinations[1], category: 'Mountains', tags: ['National Parks'] },
        { ...mockDestinations[2], category: 'Beaches' },
      ],
    })

    renderHome()

    expect(await screen.findByText('Kyoto')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All Places' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Historical Sites' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mountains' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'National Parks' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Beaches' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Beaches' }))

    expect(screen.getByRole('button', { name: 'Beaches' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Santorini')).toBeInTheDocument()
    expect(screen.queryByText('Kyoto')).not.toBeInTheDocument()
    expect(screen.queryByText('Banff')).not.toBeInTheDocument()
  })

  it('handles destination carousel error state with retry', async () => {
    fetchDestinations.mockRejectedValueOnce(new Error('Network unavailable'))
    fetchDestinations.mockResolvedValueOnce({ destinations: mockDestinations })

    renderHome()

    expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(screen.getByText('Kyoto')).toBeInTheDocument())
  })
})
