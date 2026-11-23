import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/common/Button'
import { fetchDestinations } from '../services/destinations'
import { getErrorMessage } from '../services/errors'
import {
  createStory,
  deleteStory,
  fetchAdminStories,
  reorderStories,
  updateStory,
  uploadStoryCover,
} from '../services/stories'

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const fieldClass =
  'mt-1 w-full rounded-lg border border-tafera-border bg-tafera-bg px-3 py-2 text-sm text-tafera-text focus:border-tafera-primary focus:outline-none focus:ring-2 focus:ring-tafera-primary'

const createPreviewUrl = (file) =>
  typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
    ? URL.createObjectURL(file)
    : ''

const revokePreviewUrl = (url) => {
  if (url && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url)
  }
}

const emptyForm = {
  title: '',
  excerpt: '',
  badgeLabel: 'Traveller spotlight',
  authorName: '',
  destinationId: '',
  coverImageUrl: '',
  coverImageAlt: '',
  isFeatured: true,
}

function AdminStoriesSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading curated stories" aria-busy="true">
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="rounded-lg border border-tafera-border bg-tafera-surface p-5"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-2">
              <div className="h-4 w-28 animate-pulse rounded bg-tafera-border/60" />
              <div className="h-5 w-2/3 animate-pulse rounded bg-tafera-border/70" />
              <div className="h-3.5 w-full animate-pulse rounded bg-tafera-border/50" />
            </div>
            <div className="h-8 w-24 animate-pulse rounded-md bg-tafera-border/60" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function Admin() {
  const [stories, setStories] = useState([])
  const [destinations, setDestinations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [formError, setFormError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [coverFile, setCoverFile] = useState(null)
  const [coverPreview, setCoverPreview] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const coverPreviewRef = useRef('')
  coverPreviewRef.current = coverPreview

  useEffect(() => () => {
    revokePreviewUrl(coverPreviewRef.current)
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [storyList, destinationResult] = await Promise.all([
        fetchAdminStories(),
        fetchDestinations({ page: 1, limit: 50 }).catch(() => ({ destinations: [] })),
      ])
      setStories(storyList)
      setDestinations(destinationResult?.destinations || [])
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const resetForm = () => {
    revokePreviewUrl(coverPreviewRef.current)
    setForm(emptyForm)
    setCoverFile(null)
    setCoverPreview('')
    setEditingId(null)
    setFormError(null)
    setShowForm(false)
  }

  const openCreateForm = () => {
    revokePreviewUrl(coverPreviewRef.current)
    setForm(emptyForm)
    setCoverFile(null)
    setCoverPreview('')
    setEditingId(null)
    setFormError(null)
    setShowForm(true)
  }

  const openEditForm = (story) => {
    revokePreviewUrl(coverPreviewRef.current)
    setForm({
      title: story.title || '',
      excerpt: story.excerpt || '',
      badgeLabel: story.badgeLabel || 'Traveller spotlight',
      authorName: story.authorName || '',
      destinationId: story.destination?.id || '',
      coverImageUrl: story.coverImageUrl || '',
      coverImageAlt: story.coverImageAlt || '',
      isFeatured: Boolean(story.isFeatured),
    })
    setCoverFile(null)
    setCoverPreview('')
    setEditingId(story.id)
    setFormError(null)
    setShowForm(true)
  }

  const handleCoverFileChange = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_BYTES) {
      setFormError('Choose a JPEG, PNG or WebP cover image no larger than 5 MB.')
      return
    }
    revokePreviewUrl(coverPreviewRef.current)
    setCoverFile(file)
    setCoverPreview(createPreviewUrl(file))
    setFormError(null)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!form.title.trim() || !form.excerpt.trim() || !form.authorName.trim()) {
      setFormError('Title, excerpt, and author name are required.')
      return
    }
    setSaving(true)
    setFormError(null)
    setError(null)
    try {
      const payload = {
        title: form.title.trim(),
        excerpt: form.excerpt.trim(),
        badgeLabel: form.badgeLabel.trim() || 'Traveller spotlight',
        authorName: form.authorName.trim(),
        destinationId: form.destinationId || null,
        coverImageUrl: form.coverImageUrl.trim() || null,
        coverImageAlt: form.coverImageAlt.trim() || null,
        isFeatured: Boolean(form.isFeatured),
      }

      let saved = editingId
        ? await updateStory(editingId, payload)
        : await createStory(payload)

      if (coverFile) {
        saved = await uploadStoryCover(saved.id, coverFile, form.coverImageAlt.trim())
      }

      setStories((current) => {
        if (editingId) {
          return current.map((item) => (item.id === saved.id ? saved : item))
        }
        return [...current, saved]
      })
      resetForm()
    } catch (err) {
      setFormError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const handleToggleFeatured = async (story) => {
    const previous = stories
    const nextFeatured = !story.isFeatured
    setError(null)
    setBusyId(story.id)
    setStories((current) =>
      current.map((item) =>
        item.id === story.id ? { ...item, isFeatured: nextFeatured } : item,
      ),
    )
    try {
      const updated = await updateStory(story.id, { isFeatured: nextFeatured })
      setStories((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      )
    } catch (err) {
      setStories(previous)
      setError(getErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const handleReorder = async (index, direction) => {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= stories.length) return

    const previous = stories
    const reordered = [...stories]
    ;[reordered[index], reordered[targetIndex]] = [
      reordered[targetIndex],
      reordered[index],
    ]
    const optimistic = reordered.map((item, idx) => ({ ...item, displayOrder: idx }))
    setError(null)
    setBusyId(stories[index].id)
    setStories(optimistic)

    try {
      const persisted = await reorderStories(optimistic.map((item) => item.id))
      if (Array.isArray(persisted) && persisted.length > 0) {
        setStories(persisted)
      }
    } catch (err) {
      setStories(previous)
      setError(getErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const handleDelete = async (story) => {
    const previous = stories
    setError(null)
    setBusyId(story.id)
    setStories((current) => current.filter((item) => item.id !== story.id))
    if (editingId === story.id) resetForm()
    try {
      await deleteStory(story.id)
    } catch (err) {
      setStories(previous)
      setError(getErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const featuredCount = stories.filter((item) => item.isFeatured).length

  return (
    <main className="app-container max-w-4xl py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-tafera-primary">
            Editorial curation
          </p>
          <h1 className="mt-1 text-2xl font-heading font-bold text-tafera-text sm:text-3xl">
            Homepage Traveller Stories
          </h1>
          <p className="mt-2 text-sm text-tafera-text-muted">
            Curate, feature, and order stories shown on the Tafera homepage.{' '}
            {featuredCount > 0
              ? `${featuredCount} currently featured.`
              : 'When none are featured, the homepage falls back to destination-linked community posts.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => (showForm ? resetForm() : openCreateForm())}
            disabled={saving}
          >
            {showForm ? 'Close form' : 'New story'}
          </Button>
          <Link to="/">
            <Button variant="ghost">Back to home</Button>
          </Link>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-tafera-text"
        >
          <span>{error}</span>
          <button
            type="button"
            className="font-semibold text-tafera-primary underline"
            onClick={loadData}
          >
            Retry
          </button>
        </div>
      )}

      {showForm && (
        <section
          aria-label={editingId ? 'Edit curated story' : 'Create curated story'}
          className="mb-8 rounded-lg border border-tafera-border bg-tafera-surface p-5 shadow-soft sm:p-6"
        >
          <h2 className="mb-4 font-heading text-lg font-bold text-tafera-text">
            {editingId ? 'Edit curated story' : 'Create curated story'}
          </h2>

          {formError && (
            <div
              role="alert"
              className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-tafera-text"
            >
              {formError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="text-sm text-tafera-text-muted sm:col-span-2">
              Headline
              <input
                className={fieldClass}
                type="text"
                maxLength="150"
                placeholder="Dawn above Idanre Hills"
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                required
              />
            </label>

            <label className="text-sm text-tafera-text-muted sm:col-span-2">
              Story excerpt
              <textarea
                className={fieldClass}
                rows="3"
                maxLength="1000"
                placeholder="A concise, vivid traveller quote for the homepage spotlight."
                value={form.excerpt}
                onChange={(event) => setForm((current) => ({ ...current, excerpt: event.target.value }))}
                required
              />
            </label>

            <label className="text-sm text-tafera-text-muted">
              Author attribution
              <input
                className={fieldClass}
                type="text"
                maxLength="120"
                placeholder="Ada Traveller"
                value={form.authorName}
                onChange={(event) => setForm((current) => ({ ...current, authorName: event.target.value }))}
                required
              />
            </label>

            <label className="text-sm text-tafera-text-muted">
              Badge label
              <input
                className={fieldClass}
                type="text"
                maxLength="60"
                placeholder="Traveller spotlight"
                value={form.badgeLabel}
                onChange={(event) => setForm((current) => ({ ...current, badgeLabel: event.target.value }))}
              />
            </label>

            <label className="text-sm text-tafera-text-muted sm:col-span-2">
              Linked destination (optional)
              <select
                aria-label="Linked destination"
                className={fieldClass}
                value={form.destinationId}
                onChange={(event) => setForm((current) => ({ ...current, destinationId: event.target.value }))}
              >
                <option value="" className="bg-tafera-card text-tafera-text">No linked destination</option>
                {destinations.map((destination) => (
                  <option key={destination.id} value={destination.id} className="bg-tafera-card text-tafera-text">
                    {destination.name} ({destination.country})
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-tafera-text-muted">
              Custom cover image URL (optional)
              <input
                className={fieldClass}
                type="url"
                maxLength="500"
                placeholder="https://res.cloudinary.com/..."
                value={form.coverImageUrl}
                onChange={(event) => setForm((current) => ({ ...current, coverImageUrl: event.target.value }))}
              />
            </label>

            <label className="text-sm text-tafera-text-muted">
              Or upload cover image (Cloudinary)
              <input
                aria-label="Upload cover image"
                className={fieldClass}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleCoverFileChange}
              />
            </label>

            {coverFile && (
              <div className="flex items-center gap-3 rounded-md border border-tafera-border bg-tafera-bg p-2.5 sm:col-span-2">
                {coverPreview && (
                  <img
                    src={coverPreview}
                    alt="Selected cover preview"
                    className="h-14 w-20 rounded object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-tafera-text">{coverFile.name}</p>
                  <button
                    type="button"
                    className="mt-1 text-xs font-medium text-tafera-primary hover:underline"
                    onClick={() => {
                      revokePreviewUrl(coverPreviewRef.current)
                      setCoverFile(null)
                      setCoverPreview('')
                    }}
                  >
                    Remove selected file
                  </button>
                </div>
              </div>
            )}

            <label className="text-sm text-tafera-text-muted sm:col-span-2">
              Cover alt text (optional)
              <input
                className={fieldClass}
                type="text"
                maxLength="255"
                placeholder="Describe the cover image for screen readers"
                value={form.coverImageAlt}
                onChange={(event) => setForm((current) => ({ ...current, coverImageAlt: event.target.value }))}
              />
            </label>

            <label className="inline-flex items-center gap-2 text-sm text-tafera-text sm:col-span-2">
              <input
                type="checkbox"
                checked={form.isFeatured}
                onChange={(event) => setForm((current) => ({ ...current, isFeatured: event.target.checked }))}
                className="h-4 w-4 rounded border-tafera-border text-tafera-primary focus:ring-tafera-primary"
              />
              Feature on homepage
            </label>

            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : editingId ? 'Save story' : 'Publish story'}
              </Button>
              <Button type="button" variant="ghost" disabled={saving} onClick={resetForm}>
                Cancel
              </Button>
            </div>
          </form>
        </section>
      )}

      {loading ? (
        <AdminStoriesSkeleton />
      ) : stories.length === 0 ? (
        <div className="rounded-lg border border-dashed border-tafera-border bg-tafera-surface px-6 py-12 text-center">
          <h2 className="font-heading text-lg font-bold text-tafera-text">
            No curated stories yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-tafera-text-muted">
            The homepage currently falls back to destination-linked traveller posts. Create your first curated story to take manual editorial control.
          </p>
          <Button className="mt-5" size="sm" onClick={openCreateForm}>
            Create first story
          </Button>
        </div>
      ) : (
        <ol className="space-y-3" aria-label="Curated traveller stories">
          {stories.map((story, index) => {
            const previewSrc = story.coverImageUrl || story.destination?.coverImage?.imageUrl || null
            const isItemBusy = busyId === story.id

            return (
              <li
                key={story.id}
                className="rounded-lg border border-tafera-border bg-tafera-surface p-4 shadow-soft sm:p-5"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-1 gap-3.5">
                    {previewSrc ? (
                      <img
                        src={previewSrc}
                        alt={story.coverImageAlt || story.title}
                        className="h-16 w-24 shrink-0 rounded-md border border-tafera-border object-cover"
                      />
                    ) : (
                      <div
                        aria-hidden="true"
                        className="flex h-16 w-24 shrink-0 items-center justify-center rounded-md border border-tafera-border bg-tafera-bg text-xs text-tafera-text-muted"
                      >
                        No cover
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-tafera-text-muted">
                          #{index + 1}
                        </span>
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                            story.isFeatured
                              ? 'border-tafera-primary bg-tafera-bg text-tafera-primary'
                              : 'border-tafera-border bg-tafera-bg text-tafera-text-muted'
                          }`}
                        >
                          {story.isFeatured ? 'Featured' : 'Hidden'}
                        </span>
                        <span className="text-xs text-tafera-text-muted">
                          {story.badgeLabel}
                        </span>
                      </div>
                      <h2 className="mt-1.5 font-heading text-base font-bold text-tafera-text sm:text-lg">
                        {story.title}
                      </h2>
                      <p className="mt-1 line-clamp-2 text-sm text-tafera-text-muted">
                        {story.excerpt}
                      </p>
                      <p className="mt-2 text-xs text-tafera-text-muted">
                        By {story.authorName}
                        {story.destination?.name ? ` · ${story.destination.name}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isItemBusy || index === 0}
                      aria-label={`Move ${story.title} up`}
                      onClick={() => handleReorder(index, -1)}
                    >
                      ↑
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isItemBusy || index === stories.length - 1}
                      aria-label={`Move ${story.title} down`}
                      onClick={() => handleReorder(index, 1)}
                    >
                      ↓
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isItemBusy}
                      onClick={() => handleToggleFeatured(story)}
                    >
                      {story.isFeatured ? 'Hide' : 'Feature'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isItemBusy}
                      aria-label={`Edit ${story.title}`}
                      onClick={() => openEditForm(story)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isItemBusy}
                      aria-label={`Delete ${story.title}`}
                      onClick={() => handleDelete(story)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </main>
  )
}
