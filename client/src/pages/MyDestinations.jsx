import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchMyDestinations } from '../services/destinations'

const destinationLocation = (destination) => {
  if (destination.location) return destination.location
  if (destination.state) return `${destination.state}, ${destination.country}`
  return destination.country || ''
}

export default function MyDestinations() {
  const [destinations, setDestinations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true

    setLoading(true)
    setError(null)
    fetchMyDestinations()
      .then((rows) => {
        if (active) setDestinations(rows)
      })
      .catch((err) => {
        if (active) setError(err.message || 'Your contributions could not be loaded.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [refreshKey])

  return (
    <section className="bg-tafera-bg py-10 sm:py-14">
      <div className="app-container">
        <div className="mb-8 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-tafera-primary">
            Your contributions
          </p>
          <h1 className="mt-1 text-2xl font-heading font-bold text-tafera-text sm:text-4xl">
            My Destinations
          </h1>
          <p className="mt-2.5 text-sm text-tafera-text-muted sm:mt-3 sm:text-base">
            Destinations where you have shared photos, grouped by place. Manage
            your own contributions here.
          </p>
        </div>

        {error ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="mb-5 text-tafera-text-muted">{error}</p>
            <button
              type="button"
              onClick={() => setRefreshKey((key) => key + 1)}
              className="rounded-lg border border-tafera-border bg-tafera-card px-5 py-2.5 text-sm font-semibold text-tafera-text hover:bg-tafera-surface"
            >
              Try again
            </button>
          </div>
        ) : loading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading your destination contributions">
            {[1, 2, 3].map((item) => (
              <div key={item} className="overflow-hidden rounded-xl border border-tafera-border bg-tafera-surface">
                <div className="aspect-[4/3] animate-pulse bg-tafera-border/50" />
                <div className="space-y-2 p-4">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-tafera-border/50" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-tafera-border/50" />
                </div>
              </div>
            ))}
          </div>
        ) : destinations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-tafera-border bg-tafera-surface px-6 py-16 text-center">
            <h2 className="text-xl font-heading font-bold text-tafera-text">
              You have not contributed any destination photos yet
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-tafera-text-muted">
              Explore the community gallery to find a place you have visited,
              then open its destination page and share a photo.
            </p>
            <Link
              to="/destinations"
              className="mt-6 inline-flex rounded-lg bg-tafera-primary px-5 py-2.5 text-sm font-semibold text-tafera-on-primary hover:bg-tafera-primary/90"
            >
              Explore destinations
            </Link>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {destinations.map((destination) => {
              const photo = destination.representativeImage
              return (
                <li key={destination.id}>
                  <Link
                    to={`/my-destinations/${destination.slug}`}
                    className="group flex h-full flex-col overflow-hidden rounded-xl border border-tafera-border bg-tafera-card shadow-soft transition-colors hover:border-tafera-primary/40"
                  >
                    <div className="aspect-[4/3] overflow-hidden bg-tafera-surface">
                      {photo ? (
                        <img
                          src={photo.imageUrl}
                          alt={photo.caption || photo.altText || destination.name}
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          loading="lazy"
                          onError={(event) => {
                            event.currentTarget.src = '/Tafera logo.svg'
                            event.currentTarget.alt = 'Image unavailable'
                          }}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-tafera-text-muted">
                          No photo available
                        </div>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <h2 className="font-heading text-lg font-bold text-tafera-text group-hover:text-tafera-primary">
                        {destination.name}
                      </h2>
                      <p className="mt-0.5 text-sm text-tafera-text-muted">
                        {destinationLocation(destination)}
                      </p>
                      <p className="mt-auto pt-4 text-xs font-semibold uppercase tracking-wide text-tafera-primary">
                        {destination.contributedPhotoCount}{' '}
                        {destination.contributedPhotoCount === 1 ? 'photo' : 'photos'} contributed
                      </p>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
