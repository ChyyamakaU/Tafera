import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchPublicTrips } from '../../services/trips'

export default function UpcomingTrips() {
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    fetchPublicTrips({ limit: 6 })
      .then((data) => {
        if (!active) return
        setTrips(data.trips || [])
        setLoading(false)
      })
      .catch((err) => {
        if (!active) return
        setError(err.message)
        setLoading(false)
      })
    return () => { active = false }
  }, [])

  return (
    <section
      className="border-t border-tafera-border bg-tafera-surface py-14 sm:py-20 transition-colors"
      aria-labelledby="trips-you-can-join-heading"
    >
      <div className="app-container">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-tafera-primary">
              Open itineraries
            </p>
            <h2
              id="trips-you-can-join-heading"
              className="mt-2 font-heading text-3xl font-bold text-tafera-text sm:text-4xl"
            >
              Trips You Can Join
            </h2>
          </div>
          <Link
            to="/group-travel"
            className="text-sm font-semibold text-tafera-primary hover:underline transition-colors"
          >
            View all →
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading upcoming trips" aria-busy="true">
            {[1, 2, 3].map((i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-tafera-border bg-tafera-card">
                <div className="aspect-video animate-pulse bg-tafera-border/50" />
                <div className="space-y-2.5 p-5">
                  <div className="h-5 w-3/4 animate-pulse rounded bg-tafera-border/70" />
                  <div className="h-4 w-1/2 animate-pulse rounded bg-tafera-border/50" />
                  <div className="h-4 w-2/3 animate-pulse rounded bg-tafera-border/50" />
                </div>
              </div>
            ))}
          </div>
        ) : error || trips.length === 0 ? (
          <div className="rounded-xl border border-dashed border-tafera-border bg-tafera-card px-6 py-12 text-center">
            <p className="text-sm text-tafera-text-muted">
              {error || 'No upcoming trips available right now.'}
            </p>
            <Link
              to="/group-travel"
              className="mt-4 inline-block text-sm font-semibold text-tafera-primary hover:underline"
            >
              Browse all trips →
            </Link>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {trips.map((trip) => (
              <li
                key={trip.id}
                className="group overflow-hidden rounded-xl border border-tafera-border bg-tafera-card shadow-soft transition-all hover:border-tafera-accent hover:shadow-card"
              >
                <Link to={`/trips/${trip.id}`} className="flex h-full flex-col">
                  <div className="aspect-video overflow-hidden bg-tafera-surface">
                    {trip.stops?.[0]?.destination?.coverImage ? (
                      <img
                        src={trip.stops[0].destination.coverImage.imageUrl}
                        alt={trip.stops[0].destination.coverImage.altText || trip.title}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-tafera-text-muted">
                        No image
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <h3 className="font-heading text-lg font-bold text-tafera-text transition-colors group-hover:text-tafera-primary">
                      {trip.title}
                    </h3>
                    <p className="mt-1 text-sm text-tafera-text-muted">
                      {trip.startDate} to {trip.endDate}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-tafera-text-muted">
                      <span>by {trip.creator?.fullName || 'Tafera organiser'}</span>
                      {trip.creator?.emailVerified && (
                        <span className="rounded-full bg-tafera-lime px-2 py-0.5 text-[10px] font-semibold text-tafera-ink">
                          Verified Organiser
                        </span>
                      )}
                    </div>
                    <p className="mt-auto pt-4 text-sm font-medium text-tafera-text">
                      {trip.spotsRemaining === null
                        ? 'Unlimited spaces'
                        : `${trip.spotsRemaining} spaces remaining`}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
