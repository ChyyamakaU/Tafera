import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchFeaturedDestinations } from '../../services/destinations'

const FEATURED_LIMIT = 4

export default function FeaturedDestinations() {
  const [destinations, setDestinations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadDestinations = () => {
    setLoading(true)
    setError(null)
    fetchFeaturedDestinations(FEATURED_LIMIT)
      .then((data) => {
        setDestinations(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message || 'Failed to load featured destinations')
        setLoading(false)
      })
  }

  useEffect(() => {
    loadDestinations()
  }, [])

  const retry = () => {
    loadDestinations()
  }

  if (loading) {
    return (
      <section className="px-0 md:px-15 py-16">
        <div className="px-[15px]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-10 gap-4">
            <div>
              <h2 className="text-3xl font-heading font-bold text-tafera-text sm:text-4xl">
                Featured destinations
              </h2>
              <p className="text-lg text-tafera-text-muted max-w-xl mt-2">
                Discover handpicked destinations, from historic cities to
                coastal retreats, each chosen for its unique character and
                appeal.
              </p>
            </div>
            <Link
              to="/destinations"
              className="font-medium text-tafera-accent hover:underline transition-colors sm:mt-0"
            >
              Explore all destinations
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="group">
                <div
                  className="aspect-square overflow-hidden rounded-md border border-tafera-border bg-tafera-surface animate-pulse mb-4"
                />
                <div className="h-5 w-3/4 bg-tafera-surface animate-pulse rounded-md mt-4" />
                <div className="h-4 w-1/2 bg-tafera-surface animate-pulse rounded-md mt-1" />
              </div>
            ))}
          </div>
        </div>
      </section>
    )
  }

  if (error || destinations.length === 0) {
    return (
      <section className="px-0 md:px-15 py-16">
        <div className="px-[15px]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-10 gap-4">
            <div>
              <h2 className="text-3xl font-heading font-bold text-tafera-text sm:text-4xl">
                Featured destinations
              </h2>
              <p className="text-lg text-tafera-text-muted max-w-xl mt-2">
                Discover handpicked destinations, from historic cities to
                coastal retreats, each chosen for its unique character and
                appeal.
              </p>
            </div>
            <Link
              to="/destinations"
              className="font-medium text-tafera-accent hover:underline transition-colors sm:mt-0"
            >
              Explore all destinations
            </Link>
          </div>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-tafera-text-muted mb-6">
              {error || 'No featured destinations available right now.'}
            </p>
            {error && (
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
            )}
            <Link to="/destinations">
              <span className="mt-6 inline-block font-medium text-tafera-accent hover:underline">
                Browse all destinations &rarr;
              </span>
            </Link>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="px-0 md:px-15 py-16">
      <div className="px-[15px]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-10 gap-4">
          <div>
            <h2 className="text-3xl font-heading font-bold text-tafera-text sm:text-4xl">
              Featured destinations
            </h2>
            <p className="text-lg text-tafera-text-muted max-w-xl mt-2">
              Discover handpicked destinations, from historic cities to
              coastal retreats, each chosen for its unique character and
              appeal.
            </p>
          </div>
          <Link
            to="/destinations"
            className="font-medium text-tafera-accent hover:underline transition-colors sm:mt-0"
          >
            Explore all destinations
          </Link>
        </div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {destinations.map((destination) => (
            <li key={destination.id} className="group">
              <Link
                to={`/destinations/${destination.slug}`}
                className="block"
              >
                <div
                  className="aspect-square overflow-hidden rounded-md border border-tafera-border bg-tafera-surface group-hover:border-tafera-accent transition-colors hover:shadow-card mb-4"
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
                  <Link
                    to={`/destinations/${destination.slug}`}
                    className="font-heading font-bold text-tafera-text text-lg group-hover:text-tafera-accent transition-colors block"
                  >
                    {destination.name}
                  </Link>
                  <p className="mt-1 text-sm text-tafera-text-muted">
                    {destination.state
                      ? `${destination.state}, ${destination.country}`
                      : destination.country}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
