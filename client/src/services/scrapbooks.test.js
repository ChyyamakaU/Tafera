import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createScrapbook, fetchScrapbooks, uploadScrapbookImage } from './scrapbooks'
import { request } from './api'
import { fetchCsrfToken } from './auth'

vi.mock('./api', () => ({ request: vi.fn() }))
vi.mock('./auth', () => ({ fetchCsrfToken: vi.fn() }))

beforeEach(() => {
  vi.resetAllMocks()
  fetchCsrfToken.mockResolvedValue('csrf-token')
})

describe('scrapbook API service', () => {
  it('lists the signed-in user’s journals using the existing scrapbook endpoint', async () => {
    request.mockResolvedValue({ data: { journals: [], pagination: { total: 0 } } })
    await expect(fetchScrapbooks({ page: 2, limit: 10, isPublic: false })).resolves.toEqual({ journals: [], pagination: { total: 0 } })
    expect(request).toHaveBeenCalledWith('/api/scrapbooks?page=2&limit=10&isPublic=false')
  })

  it('creates a journal with CSRF protection', async () => {
    request.mockResolvedValue({ data: { journal: { id: 'journal-1' } } })
    await createScrapbook({ title: 'A journey', isPublic: false })
    expect(request).toHaveBeenCalledWith('/api/scrapbooks', expect.objectContaining({
      method: 'POST',
      headers: { 'X-CSRF-Token': 'csrf-token' },
      body: JSON.stringify({ title: 'A journey', isPublic: false }),
    }))
  })

  it('sends photo uploads as multipart data with metadata and CSRF protection', async () => {
    request.mockResolvedValue({ data: { image: { id: 'image-1' } } })
    const file = new File(['image'], 'trip.webp', { type: 'image/webp' })
    await uploadScrapbookImage('journal-1', { file, altText: 'Coast', caption: 'Blue water', takenAt: '2026-04-13' })
    const [path, options] = request.mock.calls[0]
    expect(path).toBe('/api/scrapbooks/journal-1/images')
    expect(options.headers).toEqual({ 'X-CSRF-Token': 'csrf-token' })
    expect(options.body).toBeInstanceOf(FormData)
    expect(options.body.get('image')).toBe(file)
    expect(options.body.get('caption')).toBe('Blue water')
    expect(options.body.get('takenAt')).toBe('2026-04-13')
  })
})
