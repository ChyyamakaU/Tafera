'use strict'

// Public destination responses use explicit allowlists. Internal ownership,
// publication state, activity timestamps and Cloudinary identifiers are never
// serialized, even when the model instance contains them.
const PUBLIC_DESTINATION_FIELDS = Object.freeze([
  'id',
  'name',
  'slug',
  'country',
  'state',
  'location',
  'latitude',
  'longitude',
  'description',
  'featured',
  'createdAt',
])

const PUBLIC_DESTINATION_IMAGE_FIELDS = Object.freeze([
  'id',
  'imageUrl',
  'altText',
  'caption',
  'displayOrder',
  'isCover',
  'uploadedAt',
  'contributor',
])

const toPlain = (value) => {
  if (!value || typeof value !== 'object') return null

  return typeof value.get === 'function'
    ? value.get({ plain: true })
    : value
}

const toCoordinate = (value) => {
  if (value === null || value === undefined || value === '') return null

  const number = Number(value)

  return Number.isFinite(number) ? number : null
}

const toPublicDestinationImage = (image) => {
  const source = toPlain(image)

  if (!source) return null

  const displayOrder = Number(source.displayOrder)

  return {
    id: source.id,
    imageUrl: source.imageUrl,
    altText: source.altText ?? null,
    caption: source.caption ?? null,
    displayOrder: Number.isFinite(displayOrder) ? displayOrder : 0,
    isCover: Boolean(source.isCover),
    uploadedAt: source.createdAt ?? null,
    contributor: source.contributor
      ? {
          id: source.contributor.id,
          fullName: source.contributor.fullName,
          username: source.contributor.username ?? null,
          profileImage: source.contributor.profileImage ?? null,
        }
      : null,
  }
}

const byDisplayOrder = (left, right) => {
  const orderDifference =
    (left.displayOrder ?? 0) - (right.displayOrder ?? 0)

  if (orderDifference !== 0) return orderDifference

  return String(left.id).localeCompare(String(right.id))
}

const sortedPublicImages = (images) =>
  (Array.isArray(images) ? images : [])
    .map(toPublicDestinationImage)
    .filter(Boolean)
    .sort(byDisplayOrder)

const selectCoverImage = (images) => {
  const sorted = sortedPublicImages(images)

  return sorted.find((image) => image.isCover) || sorted[0] || null
}

const toDestinationSummary = (destination) => {
  const source = toPlain(destination)

  if (!source) return null

  const summary = {
    id: source.id,
    name: source.name,
    slug: source.slug,
    country: source.country,
    state: source.state ?? null,
    location: source.location ?? null,
    latitude: toCoordinate(source.latitude),
    longitude: toCoordinate(source.longitude),
    description: source.description,
    featured: Boolean(source.featured),
    coverImage: selectCoverImage(source.images),
    createdAt: source.createdAt,
  }

  // Defensive check so a future field addition cannot silently widen the
  // public payload.
  for (const field of Object.keys(summary)) {
    if (!PUBLIC_DESTINATION_FIELDS.includes(field) && field !== 'coverImage') {
      delete summary[field]
    }
  }

  return summary
}

const toDestinationDetail = (destination) => {
  const source = toPlain(destination)

  if (!source) return null

  return {
    ...toDestinationSummary(source),
    images: sortedPublicImages(source.images),
  }
}

const toDestinationLocation = (destination) => {
  const source = toPlain(destination)

  if (!source) return null

  return {
    id: source.id,
    name: source.name,
    slug: source.slug,
    country: source.country,
    state: source.state ?? null,
    location: source.location ?? null,
  }
}

// Community gallery entries pair a public image with the destination it
// belongs to, so public visitors can discover places from traveller photos.
const toCommunityDestinationImage = (image) => {
  const source = toPlain(image)

  if (!source) return null

  return {
    ...toPublicDestinationImage(source),
    destination: toDestinationLocation(source.destination),
  }
}

// Personal contribution cards group the current user's images under the
// existing destination record. Only that user's images are passed in here.
const toContributionDestination = (destination) => {
  const source = toPlain(destination)

  if (!source) return null

  const images = sortedPublicImages(source.images)

  return {
    ...toDestinationLocation(source),
    contributedPhotoCount: images.length,
    representativeImage: images.find((image) => image.isCover) || images[0] || null,
  }
}

module.exports = {
  PUBLIC_DESTINATION_FIELDS,
  PUBLIC_DESTINATION_IMAGE_FIELDS,
  selectCoverImage,
  toCommunityDestinationImage,
  toContributionDestination,
  toDestinationDetail,
  toDestinationLocation,
  toDestinationSummary,
  toPublicDestinationImage,
}
