import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { fetchDestination } from '../services/destinations'

export default function DestinationDetail() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [destination, setDestination] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxImage, setLightboxImage] = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchDestination(slug)
      .then((dest) => {
        setDestination(dest)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message || 'Failed to load destination')
        setLoading(false)
      })
  }, [slug])

  const coverImage = destination?.coverImage
  const images = destination?.images || []

  const openLightbox = (image) => {
    setLightboxImage(image)
    setLightboxOpen(true)
  }

  const closeLightbox = () => {
    setLightboxOpen(false)
    setLightboxImage(null)
  }

  if (loading) {
    return (
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-center py-24">
            <div
              className="w-full max-w-lg h-64 rounded-md border border-tafera-border bg-tafera-surface animate-pulse"
            />
          </div>
        </div>
      </section>
    )
  }

  if (error || !destination) {
    return (
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-tafera-text-muted mb-6">
              {error || 'Destination not found.'}
            </p>
            <Link
              to="/destinations"
              className="font-medium text-tafera-accent hover:underline transition-colors"
            >
              Browse all destinations &rarr;
            </Link>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="bg-tafera-bg min-h-svh">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link
          to="/destinations"
          className="inline-flex items-center gap-1.5 text-sm font-nav text-tafera-text-muted hover:text-tafera-accent transition-colors mb-8"
        >
          <span>←</span> Back to destinations
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left column: cover image and thumbnail gallery */}
          <div className="lg:col-span-7">
            <div
              className="aspect-video overflow-hidden rounded-md border border-tafera-border bg-tafera-surface relative mb-6"
            >
              {coverImage ? (
                <img
                  src={coverImage.imageUrl}
                  alt={coverImage.altText || destination.name}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    e.target.src = '/Tafera logo.svg'
                    e.target.alt = 'Image unavailable'
                  }}
                />
              ) : (
                <div className="w-full h-full bg-tafera-surface flex items-center justify-center">
                  <span className="text-tafera-text-muted text-sm">
                    No image available
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-4 gap-3">
              {images.map((image) => (
                <div
                  key={image.id}
                  className="aspect-square overflow-hidden rounded-md border border-tafera-border bg-tafera-surface cursor-pointer hover:border-tafera-accent transition-colors"
                  onClick={() => openLightbox(image)}
                >
                  <img
                    src={image.imageUrl}
                    alt={image.altText || destination.name}
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                    onError={(e) => {
                      e.target.src = '/Tafera logo.svg'
                      e.target.alt = 'Image unavailable'
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Right column: content */}
          <div className="lg:col-span-5 flex flex-col">
            <h1
              className="text-3xl sm:text-4xl font-heading font-bold text-tafera-text mb-2 leading-tight"
            >
              {destination.name}
            </h1>
            <p className="text-sm font-nav text-tafera-text-muted mb-6">
              {destination.state
                ? `${destination.state}, ${destination.country}`
                : destination.country}
            </p>
            <div className="mb-8 leading-relaxed text-tafera-text font-body">
              {destination.description}
            </div>
            <Link
              to="/destinations"
              onClick={() => navigate('/destinations')}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-md border border-tafera-border bg-tafera-bg text-tafera-text font-nav font-medium hover:bg-tafera-surface hover:text-tafera-primary transition-colors"
            >
              Back to destinations
            </Link>
          </div>
        </div>
      </div>

      {/* Lightbox for gallery images */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={closeLightbox}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closeLightbox}
              className="absolute top-4 right-4 text-white hover:text-tafera-accent transition-colors"
              aria-label="Close"
            >
              <svg
                className="w-6 h-6"
                viewBox="0 0 24 24"
                strokeWidth="1.5"
                stroke="currentColor"
                fill="none"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
            <img
              src={lightboxImage.imageUrl}
              alt={lightboxImage.altText || destination.name}
              className="max-w-full max-h-[80vh] object-contain rounded-md border border-white/20"
              loading="lazy"
              onError={(e) => {
                e.target.src = '/Tafera logo.svg'
                e.target.alt = 'Image unavailable'
              }}
            />
            <p className="mt-4 text-sm text-tafera-text-muted">
              {lightboxImage.altText || destination.name}
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
