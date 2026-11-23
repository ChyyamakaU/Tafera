import { beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from './api'
import { fetchCsrfToken } from './auth'
import {
  deleteDestinationImage,
  fetchCommunityDestinationPhotos,
  fetchMyDestination,
  fetchMyDestinations,
  uploadDestinationImage,
} from './destinations'

vi.mock('./api', () => ({ request: vi.fn() }))
vi.mock('./auth', () => ({ fetchCsrfToken: vi.fn() }))

describe('destination gallery API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchCsrfToken.mockResolvedValue('csrf-token')
  })

  it('posts a captioned image as multipart data with CSRF protection', async () => {
    const file = new File(['photo-bytes'], 'travel.jpg', { type: 'image/jpeg' })
    const image = { id: 'photo-1', caption: 'At the temple' }
    request.mockResolvedValue({ data: { image } })

    await expect(uploadDestinationImage('destination-1', { file, caption: '  At the temple  ' }))
      .resolves.toEqual(image)

    const [url, options] = request.mock.calls[0]
    expect(url).toBe('/api/destinations/destination-1/images')
    expect(options.method).toBe('POST')
    expect(options.headers).toEqual({ 'X-CSRF-Token': 'csrf-token' })
    expect(options.body).toBeInstanceOf(FormData)
    expect(options.body.get('image')).toBe(file)
    expect(options.body.get('caption')).toBe('At the temple')
  })

  it('loads the public community gallery with destination filters', async () => {
    request.mockResolvedValue({ data: { photos: [], pagination: { total: 0 } } })

    await fetchCommunityDestinationPhotos({
      q: 'Kyoto',
      country: 'Japan',
      state: 'Kyoto',
      page: 2,
      limit: 12,
    })

    expect(request).toHaveBeenCalledWith(
      '/api/destinations/community?q=Kyoto&country=Japan&state=Kyoto&page=2&limit=12'
    )
  })

  it('loads the current user personal destinations', async () => {
    request.mockResolvedValue({ data: { destinations: [{ id: 'destination-1' }] } })

    await expect(fetchMyDestinations()).resolves.toEqual([{ id: 'destination-1' }])
    expect(request).toHaveBeenCalledWith('/api/destinations/mine')
  })

  it('loads one personal destination by encoded slug', async () => {
    request.mockResolvedValue({ data: { destination: { id: 'destination-1' } } })

    await expect(fetchMyDestination('kyoto japan')).resolves.toEqual({ id: 'destination-1' })
    expect(request).toHaveBeenCalledWith('/api/destinations/mine/kyoto%20japan')
  })

  it('sends a CSRF-protected delete for an image contribution', async () => {
    request.mockResolvedValue(null)

    await deleteDestinationImage('destination-1', 'photo-1')

    expect(request).toHaveBeenCalledWith('/api/destinations/destination-1/images/photo-1', {
      method: 'DELETE',
      headers: { 'X-CSRF-Token': 'csrf-token' },
    })
  })
})
