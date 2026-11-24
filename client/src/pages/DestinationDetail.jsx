import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { deleteDestinationImage, fetchDestination, uploadDestinationImage } from '../services/destinations'

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

const formatUploadDate = (value) => {
  if (!value) return 'Date unavailable'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

export default function DestinationDetail() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { user, isAuthenticated, isEmailVerified } = useAuth()
  const [destination, setDestination] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxImage, setLightboxImage] = useState(null)
  const [photoFile, setPhotoFile] = useState(null)
  const [caption, setCaption] = useState('')
  const [uploading, setUploading] = useState(false)
  const [deletingImageId, setDeletingImageId] = useState(null)
  const [galleryError, setGalleryError] = useState('')
  const [gallerySuccess, setGallerySuccess] = useState('')

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
  const canContribute = isAuthenticated && isEmailVerified
  const myImages = canContribute
    ? images.filter((image) => image.contributor?.id === user?.id)
    : []
  const communityImages = images.filter((image) => !myImages.includes(image))

  const refreshDestination = async () => {
    const latest = await fetchDestination(slug)
    setDestination(latest)
  }

  const submitPhoto = async (event) => {
    event.preventDefault()
    const form = event.currentTarget
    if (!photoFile || !destination) return
    if (!ACCEPTED_IMAGE_TYPES.includes(photoFile.type) || photoFile.size > MAX_IMAGE_BYTES) {
      setGalleryError('Choose a JPEG, PNG or WebP photo no larger than 5 MB.')
      return
    }

    setUploading(true)
    setGalleryError('')
    setGallerySuccess('')
    try {
      await uploadDestinationImage(destination.id, { file: photoFile, caption })
      await refreshDestination()
      setPhotoFile(null)
      setCaption('')
      setGallerySuccess('Your photo was added to the destination gallery.')
      form.reset()
    } catch (err) {
      setGalleryError(err.message || 'Your photo could not be uploaded. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  const removePhoto = async (image) => {
    setDeletingImageId(image.id)
    setGalleryError('')
    setGallerySuccess('')
    try {
      await deleteDestinationImage(destination.id, image.id)
      await refreshDestination()
      setGallerySuccess('Your photo was removed from the destination gallery.')
    } catch (err) {
      setGalleryError(err.message || 'This photo could not be deleted. Please try again.')
    } finally {
      setDeletingImageId(null)
    }
  }

  const renderGalleryImage = (image, ownContribution) => {
    const contributor = image.contributor
    const canDelete = canContribute && (
      contributor?.id === user?.id || user?.role === 'admin'
    )
    return (
      <article key={image.id} className="overflow-hidden rounded-xl border border-tafera-border bg-tafera-surface shadow-soft">
        <button type="button" onClick={() => openLightbox(image)} className="block aspect-[4/3] w-full overflow-hidden bg-tafera-bg text-left" aria-label={`View photo: ${image.caption || destination.name}`}>
          <img
            src={image.imageUrl}
            alt={image.caption || image.altText || destination.name}
            className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
            loading="lazy"
            onError={(event) => {
              event.currentTarget.src = '/Tafera logo.svg'
              event.currentTarget.alt = 'Image unavailable'
            }}
          />
        </button>
        <div className="p-4">
          {image.caption && <p className="mb-3 text-sm leading-relaxed text-tafera-text">{image.caption}</p>}
          <div className="flex items-center gap-2.5">
            {contributor?.profileImage ? (
              <img src={contributor.profileImage} alt="" className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-tafera-primary/10 text-xs font-bold text-tafera-primary">
                {(contributor?.fullName || 'T').slice(0, 1).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-tafera-text">
                {ownContribution ? 'You' : contributor?.fullName || 'Tafera traveller'}
                {ownContribution && <span className="ml-1 rounded-full bg-tafera-primary/10 px-2 py-0.5 text-[10px] font-medium text-tafera-primary">Your photo</span>}
              </p>
              <p className="text-xs text-tafera-text-muted">{formatUploadDate(image.uploadedAt)}</p>
            </div>
            {canDelete && (
              <button type="button" onClick={() => removePhoto(image)} disabled={deletingImageId === image.id} className="rounded-md px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-500/10 disabled:opacity-50" aria-label={`Delete photo ${image.caption || ''}`}>
                {deletingImageId === image.id ? 'Removing…' : 'Delete'}
              </button>
            )}
          </div>
        </div>
      </article>
    )
  }

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
<div className="app-container">
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
<div className="app-container">
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
<div className="app-container py-8">
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

          </div>

          {/* Right column: content */}
          <div className="lg:col-span-5 flex flex-col">
            <h1
              className="text-2xl sm:text-4xl font-heading font-bold text-tafera-text mb-2 leading-tight"
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
            <div className="mb-5 flex flex-wrap gap-3">
              <a href="#destination-gallery" className="inline-flex min-h-10 items-center justify-center rounded-lg border border-tafera-border bg-tafera-card px-4 py-2 text-sm font-semibold text-tafera-text hover:bg-tafera-surface hover:text-tafera-primary">Browse traveller photos</a>
              {canContribute && <a href="#destination-photo" className="inline-flex min-h-10 items-center justify-center rounded-lg bg-tafera-primary px-4 py-2 text-sm font-semibold text-tafera-on-primary hover:bg-tafera-primary/90">Upload photos</a>}
            </div>
            <Link
              to="/destinations"
              onClick={() => navigate('/destinations')}
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-md border border-tafera-border bg-tafera-card text-tafera-text font-nav font-medium hover:bg-tafera-surface hover:text-tafera-primary transition-colors"
            >
              Back to destinations
            </Link>
          </div>
        </div>

        <section id="destination-gallery" className="mt-12 border-t border-tafera-border pt-9" aria-labelledby="destination-gallery-title">
          <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-tafera-primary">Traveller gallery</p>
              <h2 id="destination-gallery-title" className="mt-1 text-2xl font-heading font-bold text-tafera-text sm:text-3xl">
                Photos from {destination.name}
              </h2>
              <p className="mt-2 text-sm text-tafera-text-muted">Discover moments shared by travellers who have been here.</p>
            </div>
            <span className="text-sm text-tafera-text-muted">{images.length} {images.length === 1 ? 'photo' : 'photos'}</span>
          </div>

          {galleryError && <p role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-tafera-text">{galleryError}</p>}
          {gallerySuccess && <p role="status" className="mb-4 rounded-lg border border-tafera-primary/30 bg-tafera-primary/10 px-4 py-3 text-sm text-tafera-text">{gallerySuccess}</p>}

          {canContribute ? (
            <form onSubmit={submitPhoto} className="mb-9 grid gap-4 rounded-2xl border border-tafera-border bg-tafera-surface p-5 shadow-soft sm:grid-cols-[1fr_1.2fr_auto] sm:items-end sm:p-6">
              <div>
                <label htmlFor="destination-photo" className="mb-2 block text-sm font-semibold text-tafera-text">Upload a photo</label>
                <input
                  id="destination-photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  required
                  onChange={(event) => setPhotoFile(event.target.files?.[0] || null)}
                  className="block w-full text-sm text-tafera-text file:mr-3 file:rounded-lg file:border file:border-tafera-border file:bg-tafera-card file:px-4 file:py-2.5 file:font-semibold file:text-tafera-text hover:file:bg-tafera-bg"
                />
                <p className="mt-1 text-xs text-tafera-text-muted">JPEG, PNG or WebP · up to 5 MB</p>
              </div>
              <div>
                <label htmlFor="destination-photo-caption" className="mb-2 block text-sm font-semibold text-tafera-text">Caption <span className="font-normal text-tafera-text-muted">(optional)</span></label>
                <input
                  id="destination-photo-caption"
                  type="text"
                  maxLength={500}
                  value={caption}
                  onChange={(event) => setCaption(event.target.value)}
                  placeholder="What made this moment memorable?"
                  className="h-11 w-full rounded-lg border border-tafera-border bg-tafera-card px-3 text-sm text-tafera-text placeholder:text-tafera-text-muted focus:border-tafera-primary focus:outline-none focus:ring-2 focus:ring-tafera-primary"
                />
              </div>
              <button type="submit" disabled={!photoFile || uploading} className="min-h-11 rounded-lg bg-tafera-primary px-5 py-2.5 text-sm font-semibold text-tafera-on-primary transition-colors hover:bg-tafera-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
                {uploading ? 'Uploading…' : 'Upload photo'}
              </button>
            </form>
          ) : (
            <div className="mb-9 flex flex-col gap-3 rounded-2xl border border-tafera-border bg-tafera-surface p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <p className="text-sm text-tafera-text-muted">Have a photo from this destination? Sign in to share it with other travellers.</p>
              <Link to="/login" className="inline-flex min-h-10 items-center justify-center rounded-lg bg-tafera-primary px-4 py-2 text-sm font-semibold text-tafera-on-primary hover:bg-tafera-primary/90">Sign in to contribute</Link>
            </div>
          )}

          {isAuthenticated && myImages.length > 0 && (
            <div className="mb-9">
              <h3 className="mb-4 text-lg font-heading font-semibold text-tafera-text">Your contributions <span className="text-sm font-normal text-tafera-text-muted">({myImages.length})</span></h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {myImages.map((image) => renderGalleryImage(image, true))}
              </div>
            </div>
          )}

          <div>
            {isAuthenticated && myImages.length > 0 && <h3 className="mb-4 text-lg font-heading font-semibold text-tafera-text">Community photos</h3>}
            {communityImages.length === 0 ? (
              <p className="rounded-xl border border-dashed border-tafera-border px-5 py-8 text-center text-sm text-tafera-text-muted">
                {images.length === 0 ? 'No traveller photos yet. Be the first to share a moment from here.' : 'You are the first to share a photo here.'}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {communityImages.map((image) => renderGalleryImage(image, false))}
              </div>
            )}
          </div>
        </section>
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
