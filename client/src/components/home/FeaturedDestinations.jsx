import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchFeaturedDestinations } from '../../services/destinations'

export default function FeaturedDestinations() {
  const [destinations, setDestinations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchFeaturedDestinations(6)
      .then((data) => {
        setDestinations(data)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-heading font-bold text-tafera-text sm:text-4xl text-center mb-16">
            Featured destinations
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

  if (error || destinations.length === 0) {
    return (
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-heading font-bold text-tafera-text sm:text-4xl text-center mb-16">
            Featured destinations
          </h2>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-tafera-text-muted">
              {error || 'No featured destinations available right now.'}
            </p>
            <Link to="/destinations">
              <span className="mt-4 inline-block font-medium text-tafera-accent hover:underline">
                Browse all destinations →
              </span>
            </Link>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-10">
          <h2 className="text-3xl font-heading font-bold text-tafera-text sm:text-4xl">
            Featured destinations
          </h2>
          <Link
            to="/destinations"
            className="font-medium text-tafera-accent hover:underline transition-colors"
          >
            View all →
          </Link>
        </div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {destinations.map((destination) => (
            <li key={destination.id} className="group">
              <div className="aspect-video overflow-hidden rounded-md border border-tafera-border bg-tafera-surface group-hover:border-tafera-accent transition-colors">
                {destination.coverImage ? (
                  <img
                    src={destination.coverImage.imageUrl}
                    alt={destination.coverImage.altText || destination.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full bg-tafera-surface flex items-center justify-center">
                    <span className="text-tafera-text-muted text-sm">
                      No image
                    </span>
                  </div>
                )}
              </div>
              <div className="mt-4">
                <Link
                  to={`/destinations/${destination.slug}`}
                  className="font-heading font-bold text-tafera-text text-lg group-hover:text-tafera-accent transition-colors"
                >
                  {destination.name}
                </Link>
                <p className="mt-1 text-sm text-tafera-text-muted">
                  {destination.state}, {destination.country}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
