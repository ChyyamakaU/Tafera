import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchCommunityDestinationPhotos } from '../services/destinations'

const PAGE_SIZE = 12

const formatUploadDate = (value) => {
  if (!value) return 'Date unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

const destinationLocation = (destination) => {
  if (!destination) return ''
  if (destination.location) return destination.location
  if (destination.state) return `${destination.state}, ${destination.country}`
  return destination.country || ''
}

const emptyFilters = { q: '', country: '', state: '' }

export default function Destinations() {
  const [photos, setPhotos] = useState([])
  const [pagination, setPagination] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)
  const [form, setForm] = useState(emptyFilters)
  const [filters, setFilters] = useState(emptyFilters)
  const [refreshKey, setRefreshKey] = useState(0)

  const loadPhotos = useCallback(async (pageNumber, activeFilters) => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchCommunityDestinationPhotos({
        ...activeFilters,
        page: pageNumber,
        limit: PAGE_SIZE,
      })
      setPhotos(data.photos || [])
      setPagination(data.pagination || null)
    } catch (err) {
      setError(err.message || 'Failed to load the community gallery')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPhotos(page, filters)
  }, [loadPhotos, page, filters, refreshKey])

  const hasActiveFilters = Boolean(filters.q || filters.country || filters.state)

  const submitSearch = (event) => {
    event.preventDefault()
    const nextFilters = {
      q: form.q.trim(),
      country: form.country.trim(),
      state: form.state.trim(),
    }
    setPage(1)
    setFilters(nextFilters)
    setRefreshKey((key) => key + 1)
  }

  const clearFilters = () => {
    setForm(emptyFilters)
    setFilters(emptyFilters)
    setPage(1)
    setRefreshKey((key) => key + 1)
  }

  const retry = () => {
    setRefreshKey((key) => key + 1)
  }

  return (
    <section className="bg-tafera-bg py-10 sm:py-14">
      <div className="app-container">
        <div className="mb-8 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-tafera-primary">
            Community gallery
          </p>
          <h1 className="mt-1 text-3xl font-heading font-bold text-tafera-text sm:text-4xl">
            Explore Destinations
          </h1>
          <p className="mt-3 text-base text-tafera-text-muted">
            Real places, shared by Tafera travellers. Discover a destination
            through the moments people have captured there.
          </p>
        </div>

        <form
          onSubmit={submitSearch}
          className="mb-9 grid gap-3 rounded-2xl border border-tafera-border bg-tafera-surface p-4 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-end sm:p-5"
          aria-label="Search community destination photos"
        >
          <label className="block text-sm font-semibold text-tafera-text">
            Destination or location
            <input
              type="search"
              value={form.q}
              onChange={(event) => setForm((current) => ({ ...current, q: event.target.value }))}
              placeholder="Kyoto, coast, mountains…"
              className="mt-1.5 h-11 w-full rounded-lg border border-tafera-border bg-white px-3 text-sm font-normal text-tafera-text focus:border-tafera-primary focus:outline-none focus:ring-2 focus:ring-tafera-primary"
            />
          </label>
          <label className="block text-sm font-semibold text-tafera-text">
            Country
            <input
              type="text"
              value={form.country}
              onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))}
              placeholder="Japan"
              className="mt-1.5 h-11 w-full rounded-lg border border-tafera-border bg-white px-3 text-sm font-normal text-tafera-text focus:border-tafera-primary focus:outline-none focus:ring-2 focus:ring-tafera-primary"
            />
          </label>
          <label className="block text-sm font-semibold text-tafera-text">
            State or region
            <input
              type="text"
              value={form.state}
              onChange={(event) => setForm((current) => ({ ...current, state: event.target.value }))}
              placeholder="Kyoto"
              className="mt-1.5 h-11 w-full rounded-lg border border-tafera-border bg-white px-3 text-sm font-normal text-tafera-text focus:border-tafera-primary focus:outline-none focus:ring-2 focus:ring-tafera-primary"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              className="min-h-11 flex-1 rounded-lg bg-tafera-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-tafera-primary/90"
            >
              Search photos
            </button>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="min-h-11 rounded-lg border border-tafera-border bg-white px-3 py-2 text-sm font-semibold text-tafera-text hover:bg-tafera-surface"
              >
                Clear
              </button>
            )}
          </div>
        </form>

        {error ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="mb-5 text-tafera-text-muted">{error}</p>
            <button
              type="button"
              onClick={retry}
              className="rounded-lg border border-tafera-border bg-white px-5 py-2.5 text-sm font-semibold text-tafera-text hover:bg-tafera-surface"
            >
              Try again
            </button>
          </div>
        ) : loading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading community photos">
            {[1, 2, 3, 4, 5, 6].map((item) => (
              <div key={item} className="overflow-hidden rounded-xl border border-tafera-border bg-tafera-surface">
                <div className="aspect-[4/3] animate-pulse bg-tafera-border/50" />
                <div className="space-y-2 p-4">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-tafera-border/50" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-tafera-border/50" />
                </div>
              </div>
            ))}
          </div>
        ) : photos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-tafera-border bg-tafera-surface px-6 py-16 text-center">
            <h2 className="text-xl font-heading font-bold text-tafera-text">
              {hasActiveFilters ? 'No photos match your search' : 'No community photos yet'}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-tafera-text-muted">
              {hasActiveFilters
                ? 'Try a different destination, country or region, or clear the filters to see every traveller photo.'
                : 'Traveller photos will appear here as people share them. Visit a destination and be the first to contribute.'}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-lg border border-tafera-border bg-white px-5 py-2.5 text-sm font-semibold text-tafera-text hover:bg-tafera-surface"
                >
                  Clear filters
                </button>
              ) : (
                <Link
                  to="/"
                  className="rounded-lg bg-tafera-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-tafera-primary/90"
                >
                  Discover destinations
                </Link>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-tafera-text-muted">
                {pagination?.total ?? photos.length}{' '}
                {(pagination?.total ?? photos.length) === 1 ? 'traveller photo' : 'traveller photos'}
              </p>
              {pagination?.totalPages > 1 && (
                <p className="text-sm text-tafera-text-muted">
                  Page {pagination.page} of {pagination.totalPages}
                </p>
              )}
            </div>

            <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {photos.map((photo) => {
                const destination = photo.destination
                const contributor = photo.contributor
                return (
                  <li key={photo.id}>
                    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-tafera-border bg-white shadow-soft">
                      <Link
                        to={destination ? `/destinations/${destination.slug}` : '/destinations'}
                        className="block aspect-[4/3] overflow-hidden bg-tafera-surface"
                        aria-label={`Explore ${destination?.name || 'destination'} gallery`}
                      >
                        <img
                          src={photo.imageUrl}
                          alt={photo.caption || photo.altText || destination?.name || 'Traveller destination photo'}
                          className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
                          loading="lazy"
                          onError={(event) => {
                            event.currentTarget.src = '/Tafera logo.svg'
                            event.currentTarget.alt = 'Image unavailable'
                          }}
                        />
                      </Link>
                      <div className="flex flex-1 flex-col p-4">
                        {destination && (
                          <h2 className="font-heading text-lg font-bold text-tafera-text">
                            <Link
                              to={`/destinations/${destination.slug}`}
                              className="hover:text-tafera-primary"
                            >
                              {destination.name}
                            </Link>
                          </h2>
                        )}
                        {destination && (
                          <p className="mt-0.5 text-sm text-tafera-text-muted">
                            {destinationLocation(destination)}
                          </p>
                        )}
                        {photo.caption && (
                          <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-tafera-text">
                            {photo.caption}
                          </p>
                        )}
                        <div className="mt-auto flex items-center gap-2.5 pt-4">
                          {contributor?.profileImage ? (
                            <img src={contributor.profileImage} alt="" className="h-8 w-8 rounded-full object-cover" />
                          ) : (
                            <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-tafera-primary/10 text-xs font-bold text-tafera-primary">
                              {(contributor?.fullName || 'T').slice(0, 1).toUpperCase()}
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            {contributor?.id ? (
                              <Link
                                to={`/users/${contributor.id}`}
                                className="block truncate text-xs font-semibold text-tafera-text hover:text-tafera-primary"
                              >
                                {contributor.fullName || 'Tafera traveller'}
                              </Link>
                            ) : (
                              <p className="truncate text-xs font-semibold text-tafera-text">
                                Tafera traveller
                              </p>
                            )}
                            <p className="text-xs text-tafera-text-muted">
                              {formatUploadDate(photo.uploadedAt)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </article>
                  </li>
                )
              })}
            </ul>

            {pagination && pagination.totalPages > 1 && (
              <div className="mt-10 flex items-center justify-between gap-4" aria-label="Pagination">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(current - 1, 1))}
                  disabled={!pagination.hasPreviousPage}
                  className="rounded-md border border-tafera-border bg-white px-4 py-2 text-sm font-medium text-tafera-text transition-colors hover:bg-tafera-surface disabled:pointer-events-none disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm text-tafera-text-muted">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(current + 1, pagination.totalPages))}
                  disabled={!pagination.hasNextPage}
                  className="rounded-md border border-tafera-border bg-white px-4 py-2 text-sm font-medium text-tafera-text transition-colors hover:bg-tafera-surface disabled:pointer-events-none disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
