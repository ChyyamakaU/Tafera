'use strict'

// Public scrapbook journal responses use explicit allowlists. Internal
// ownership, publication state, activity timestamps and Cloudinary
// identifiers are never serialized, even when the model instance contains
// them.
const PUBLIC_SCRAPBOOK_FIELDS = Object.freeze([
  'id',
  'title',
  'description',
  'isPublic',
  'tripId',
  'createdAt',
])

const PUBLIC_SCRAPBOOK_IMAGE_FIELDS = Object.freeze([
  'id',
  'imageUrl',
  'altText',
  'caption',
  'takenAt',
  'displayOrder',
  'isCover',
])

const toPlain = (value) => {
  if (!value || typeof value !== 'object') return null

  return typeof value.get === 'function'
    ? value.get({ plain: true })
    : value
}

const toPublicScrapbookImage = (image) => {
  const source = toPlain(image)

  if (!source) return null

  const displayOrder = Number(source.displayOrder)

  return {
    id: source.id,
    imageUrl: source.imageUrl,
    altText: source.altText ?? null,
    caption: source.caption ?? null,
    takenAt: source.takenAt,
    displayOrder: Number.isFinite(displayOrder) ? displayOrder : 0,
    isCover: Boolean(source.isCover),
  }
}

const byDisplayOrder = (left, right) => {
  const orderDifference =
    (left.displayOrder ?? 0) - (right.displayOrder ?? 0)

  if (orderDifference !== 0) return orderDifference

  return String(left.id).localeCompare(String(right.id))
}

const sortedScrapbookImages = (images) =>
  (Array.isArray(images) ? images : [])
    .map(toPublicScrapbookImage)
    .filter(Boolean)
    .sort(byDisplayOrder)

const selectCoverImage = (images) => {
  const sorted = sortedScrapbookImages(images)

  return sorted.find((image) => image.isCover) || sorted[0] || null
}

const toPublicScrapbookJournalSummary = (journal) => {
  const source = toPlain(journal)

  if (!source) return null

  const summary = {
    id: source.id,
    title: source.title,
    description: source.description ?? null,
    isPublic: Boolean(source.isPublic),
    tripId: source.tripId ?? null,
    imageCount: source.imageCount ?? 0,
    coverImage: selectCoverImage(source.images),
    createdAt: source.createdAt,
  }

  // Defensive check so a future field addition cannot silently widen the
  // public payload.
  for (const field of Object.keys(summary)) {
    if (!PUBLIC_SCRAPBOOK_FIELDS.includes(field) && field !== 'coverImage' && field !== 'imageCount') {
      delete summary[field]
    }
  }

  return summary
}

const toPublicScrapbookJournalDetail = (journal) => {
  const source = toPlain(journal)

  if (!source) return null

  return {
    ...toPublicScrapbookJournalSummary(source),
    images: sortedScrapbookImages(source.images),
  }
}

module.exports = {
  PUBLIC_SCRAPBOOK_FIELDS,
  PUBLIC_SCRAPBOOK_IMAGE_FIELDS,
  selectCoverImage,
  sortedScrapbookImages,
  toPlain,
  toPublicScrapbookImage,
  toPublicScrapbookJournalDetail,
  toPublicScrapbookJournalSummary,
}
