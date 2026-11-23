import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { deleteDestinationImage, fetchMyDestination } from '../services/destinations'

const formatUploadDate = (value) => {
  if (!value) return 'Date unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

const destinationLocation = (destination) => {
  if (destination.location) return destination.location
  if (destination.state) return `${destination.state}, ${destination.country}`
  return destination.country || ''
}

export default function MyDestinationDetail() {
  const { slug } = useParams()
  const [destination, setDestination] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [actionError, setActionError] = useState('')
  const [actionSuccess, setActionSuccess] = useState('')

  useEffect(() => {
    let active = true

    setLoading(true)
    setError(null)
    fetchMyDestination(slug)
      .then((result) => {
        if (active) setDestination(result)
      })
      .catch((err) => {
        if (active) setError(err.message || 'This destination could not be loaded.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [slug])

  const removePhoto = async (image) => {
    setDeletingId(image.id)
    setActionError('')
    setActionSuccess('')
    try {
      await deleteDestinationImage(destination.id, image.id)
      setDestination((current) => {
        const images = (current.images || []).filter((item) => item.id !== image.id)
        return { ...current, images, contributedPhotoCount: images.length }
      })
      setActionSuccess('Your photo was removed from this destination.')
    } catch (err) {
      setActionError(err.message || 'This photo could not be deleted. Please try again.')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <section className="bg-tafera-bg py-10 sm:py-14">
        <div className="app-container">
          <div className="h-8 w-56 animate-pulse rounded bg-tafera-surface" />
          <div className="mt-4 h-4 w-40 animate-pulse rounded bg-tafera-surface" />
          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <div key={item} className="aspect-[4/3] animate-pulse rounded-xl bg-tafera-surface" />
            ))}
          </div>
        </div>
      </section>
    )
  }

  if (error || !destination) {
    return (
      <section className="bg-tafera-bg py-10 sm:py-14">
        <div className="app-container">
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="mb-5 text-tafera-text-muted">
              {error || 'Destination not found.'}
            </p>
            <Link
              to="/my-destinations"
              className="rounded-lg border border-tafera-border bg-white px-5 py-2.5 text-sm font-semibold text-tafera-text hover:bg-tafera-surface"
            >
              Back to My Destinations
            </Link>
          </div>
        </div>
      </section>
    )
  }

  const images = destination.images || []

  return (
    <section className="bg-tafera-bg py-10 sm:py-14">
      <div className="app-container">
        <Link
          to="/my-destinations"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-tafera-text-muted hover:text-tafera-primary"
        >
          <span aria-hidden="true">←</span> Back to My Destinations
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-tafera-primary">
              Your contributions
            </p>
            <h1 className="mt-1 text-3xl font-heading font-bold text-tafera-text sm:text-4xl">
              {destination.name}
            </h1>
            <p className="mt-2 text-sm text-tafera-text-muted">
              {destinationLocation(destination)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-tafera-text-muted">
              {images.length} {images.length === 1 ? 'photo' : 'photos'} contributed
            </span>
            <Link
              to={`/destinations/${destination.slug}`}
              className="rounded-lg border border-tafera-border bg-white px-4 py-2 text-sm font-semibold text-tafera-primary hover:bg-tafera-primary/5"
            >
              View public gallery
            </Link>
          </div>
        </div>

        {actionError && (
          <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {actionError}
          </p>
        )}
        {actionSuccess && (
          <p role="status" className="mt-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {actionSuccess}
          </p>
        )}

        {images.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-tafera-border bg-tafera-surface px-6 py-14 text-center">
            <h2 className="text-xl font-heading font-bold text-tafera-text">
              You have no photos for this destination
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-tafera-text-muted">
              Visit the public destination page to add a photo, or explore other
              places you have travelled.
            </p>
            <Link
              to="/destinations"
              className="mt-6 inline-flex rounded-lg bg-tafera-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-tafera-primary/90"
            >
              Explore destinations
            </Link>
          </div>
        ) : (
          <ul className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((image) => (
              <li key={image.id}>
                <article className="flex h-full flex-col overflow-hidden rounded-xl border border-tafera-border bg-white shadow-soft">
                  <div className="aspect-[4/3] overflow-hidden bg-tafera-surface">
                    <img
                      src={image.imageUrl}
                      alt={image.caption || image.altText || destination.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.src = '/Tafera logo.svg'
                        event.currentTarget.alt = 'Image unavailable'
                      }}
                    />
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    {image.caption && (
                      <p className="text-sm leading-relaxed text-tafera-text">
                        {image.caption}
                      </p>
                    )}
                    <div className="mt-auto flex items-center justify-between gap-3 pt-4">
                      <p className="text-xs text-tafera-text-muted">
                        {formatUploadDate(image.uploadedAt)}
                      </p>
                      <button
                        type="button"
                        onClick={() => removePhoto(image)}
                        disabled={deletingId === image.id}
                        className="rounded-md px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                        aria-label={`Delete photo ${image.caption || ''}`}
                      >
                        {deletingId === image.id ? 'Removing…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
