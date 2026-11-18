import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchPublicTrips } from '../../services/trips'

export default function UpcomingTrips() {
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchPublicTrips({ limit: 6 })
      .then((data) => {
        setTrips(data.trips || [])
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <section className="px-0 md:px-15 py-16">
        <div className="px-[15px]">
          <h2 className="text-3xl font-heading font-bold text-tafera-text sm:text-4xl text-center mb-16">
            Upcoming trips
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="aspect-video rounded-md border border-tafera-border bg-tafera-surface animate-pulse" />
            ))}
          </div>
        </div>
      </section>
    )
  }

  if (error || trips.length === 0) {
    return (
      <section className="px-0 md:px-15 py-16">
        <div className="px-[15px]">
          <h2 className="text-3xl font-heading font-bold text-tafera-text sm:text-4xl text-center mb-16">
            Upcoming trips
          </h2>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-tafera-text-muted">
              {error || 'No upcoming trips available right now.'}
            </p>
            <Link to="/trips">
              <span className="mt-4 inline-block font-medium text-tafera-accent hover:underline">
                Browse all trips →
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
        <div className="flex items-center justify-between mb-10">
          <h2 className="text-3xl font-heading font-bold text-tafera-text sm:text-4xl">
            Upcoming trips
          </h2>
          <Link
            to="/trips"
            className="font-medium text-tafera-accent hover:underline transition-colors"
          >
            View all →
          </Link>
        </div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {trips.map((trip) => (
            <li key={trip.id} className="group">
              <div className="flex flex-col gap-4">
                <div className="aspect-video overflow-hidden rounded-md border border-tafera-border bg-tafera-surface group-hover:border-tafera-accent transition-colors">
                  {trip.stops?.[0]?.destination?.coverImage ? (
                    <img
                      src={trip.stops[0].destination.coverImage.imageUrl}
                      alt={trip.stops[0].destination.coverImage.altText || trip.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-tafera-text-muted text-sm">
                      No image
                    </span>
                  )}
                </div>
                <div>
                  <Link
                    to={`/trips/${trip.id}`}
                    className="font-heading font-bold text-lg text-tafera-text group-hover:text-tafera-accent transition-colors"
                  >
                    {trip.title}
                  </Link>
                  <p className="mt-1 text-sm text-tafera-text-muted">
                    {trip.startDate} to {trip.endDate}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-sm text-tafera-text-muted">
                    <span>by {trip.creator.fullName}</span>
                    {trip.creator.emailVerified && (
                      <span className="flex items-center gap-1 text-[10px] font-medium text-tafera-accent bg-tafera-accent/10 rounded px-1.5">
                        Verified Organiser
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-tafera-text-muted">
                    {trip.spotsRemaining === null
                      ? 'Unlimited spaces'
                      : `${trip.spotsRemaining} spaces remaining`}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
