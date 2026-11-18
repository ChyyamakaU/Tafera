import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { fetchDestinations } from '../services/destinations'

const PAGE_SIZE = 9

export default function Destinations() {
  const [destinations, setDestinations] = useState([])
  const [pagination, setPagination] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(1)

  const loadDestinations = (pageNumber) => {
    setLoading(true)
    setError(null)
    fetchDestinations({ page: pageNumber, limit: PAGE_SIZE })
      .then((data) => {
        setDestinations(data.destinations || [])
        setPagination(data.pagination || null)
        setPage(pageNumber)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message || 'Failed to load destinations')
        setLoading(false)
      })
  }

  useEffect(() => {
    loadDestinations(page)
  }, [page])

  const retry = () => {
    loadDestinations(page)
  }

  if (loading) {
    return (
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-heading font-bold text-tafera-text sm:text-4xl text-center mb-16">
            Destinations
          </h1>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="group">
                <div
                  className="aspect-video overflow-hidden rounded-md border border-tafera-border bg-tafera-surface animate-pulse mb-4"
                />
                <div className="h-6 w-3/4 bg-tafera-surface animate-pulse rounded-md" />
                <div className="h-4 w-1/2 bg-tafera-surface animate-pulse rounded-md mt-2" />
                <div className="h-4 w-1/3 bg-tafera-surface animate-pulse rounded-md mt-2" />
              </div>
            ))}
          </div>
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-heading font-bold text-tafera-text sm:text-4xl text-center mb-16">
            Destinations
          </h1>
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-tafera-text-muted mb-6">
              {error}
            </p>
            <button
              onClick={retry}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-md border border-tafera-border bg-tafera-bg text-tafera-text font-nav font-medium hover:bg-tafera-surface hover:text-tafera-primary transition-colors"
            >
              <span>Try again</span>
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
                fill="none"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>
        </div>
      </section>
    )
  }

  if (!destinations || destinations.length === 0) {
    return (
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-heading font-bold text-tafera-text sm:text-4xl text-center mb-16">
            Destinations
          </h1>
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-tafera-text-muted mb-6 max-w-sm">
              No destinations available right now.
            </p>
            <Link to="/">
              <span className="inline-block font-medium text-tafera-accent hover:underline">
                Back to home &rarr;
              </span>
            </Link>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="py-16 bg-tafera-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-12">
          <h1 className="text-3xl font-heading font-bold text-tafera-text sm:text-4xl mb-4">
            Destinations
          </h1>
          <p className="text-lg text-tafera-text-muted max-w-xl">
            Browse and save travel destinations from around the world.
            Discover places worth exploring, connect with fellow travellers,
            and make memories along the way.
          </p>
        </div>

        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {destinations.map((destination) => (
            <li key={destination.id} className="group">
              <Link
                to={`/destinations/${destination.slug}`}
                className="block"
              >
                <div
                  className="aspect-video overflow-hidden rounded-md border border-tafera-border bg-tafera-surface group-hover:border-tafera-accent transition-colors mb-4"
                >
                  {destination.coverImage ? (
                    <img
                      src={destination.coverImage.imageUrl}
                      alt={
                        destination.coverImage.altText || destination.name
                      }
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                      onError={(e) => {
                        e.target.src = '/Tafera logo.svg'
                        e.target.alt = 'Image unavailable'
                      }}
                    />
                  ) : (
                    <div
                      className="w-full h-full bg-tafera-surface flex items-center justify-center"
                    >
                      <span className="text-tafera-text-muted text-sm">
                        No image
                      </span>
                    </div>
                  )}
                </div>
                <div>
                  <h3
                    className="font-heading font-bold text-tafera-text text-lg group-hover:text-tafera-accent transition-colors mb-1"
                  >
                    {destination.name}
                  </h3>
                  <p className="text-sm text-tafera-text-muted mb-3">
                    {destination.state
                      ? `${destination.state}, ${destination.country}`
                      : destination.country}
                  </p>
                  <p
                    className="text-sm font-body text-tafera-text line-clamp-2 leading-relaxed"
                  >
                    {destination.description}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>

        {pagination && pagination.totalPages > 1 && (
          <div
            className="mt-12 flex items-center justify-between gap-4"
            aria-label="Pagination"
          >
            <button
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={
                !pagination.hasPreviousPage || pagination.page <= 1
              }
              className="px-4 py-2 rounded-md border border-tafera-border bg-tafera-bg text-tafera-text font-nav font-medium disabled:opacity-50 disabled:pointer-events-none hover:bg-tafera-surface transition-colors"
              aria-label="Previous page"
            >
              Previous
            </button>
            <span className="text-sm font-nav text-tafera-text-muted">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              onClick={() =>
                setPage((p) => Math.min(p + 1, pagination.totalPages))
              }
              disabled={
                !pagination.hasNextPage ||
                pagination.page >= pagination.totalPages
              }
              className="px-4 py-2 rounded-md border border-tafera-border bg-tafera-bg text-tafera-text font-nav font-medium disabled:opacity-50 disabled:pointer-events-none hover:bg-tafera-surface transition-colors"
              aria-label="Next page"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
