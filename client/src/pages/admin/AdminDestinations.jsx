import { useCallback, useEffect, useState } from 'react'
import { Button } from '../../components/common/Button'
import {
  createAdminDestination,
  deleteAdminDestination,
  deleteAdminDestinationPhoto,
  fetchAdminDestinationPhotos,
  fetchAdminDestinations,
  setDestinationCoverImage,
  updateAdminDestination,
  uploadAdminDestinationPhoto,
} from '../../services/admin'
import { getErrorMessage } from '../../services/errors'

const inputClass =
  'mt-1 w-full rounded-lg border border-tafera-border bg-tafera-card px-3 py-2 text-sm text-tafera-text placeholder:text-tafera-text-muted focus:border-tafera-primary focus:outline-none focus:ring-2 focus:ring-tafera-primary'

const emptyForm = {
  name: '',
  country: 'Nigeria',
  state: '',
  location: '',
  description: '',
  latitude: '',
  longitude: '',
  featured: false,
  status: 'published',
}

export default function AdminDestinations() {
  const [activeTab, setActiveTab] = useState('destinations')
  const [destinations, setDestinations] = useState([])
  const [pagination, setPagination] = useState(null)
  const [page, setPage] = useState(1)
  const [searchInput, setSearchInput] = useState('')
  const [filters, setFilters] = useState({ search: '', status: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  // Create / edit destination form
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)

  // Destination images drawer
  const [managingImagesFor, setManagingImagesFor] = useState(null)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoCaption, setPhotoCaption] = useState('')
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  // Community photos tab
  const [communityPhotos, setCommunityPhotos] = useState([])
  const [photosLoading, setPhotosLoading] = useState(false)

  const loadDestinations = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchAdminDestinations({
        page,
        limit: 15,
        search: filters.search,
        status: filters.status,
      })
      setDestinations(result.destinations || [])
      setPagination(result.pagination || null)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [page, filters])

  const loadCommunityPhotos = useCallback(async () => {
    setPhotosLoading(true)
    setError(null)
    try {
      const result = await fetchAdminDestinationPhotos({ page: 1, limit: 30 })
      setCommunityPhotos(result.photos || [])
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setPhotosLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDestinations()
  }, [loadDestinations])

  useEffect(() => {
    if (activeTab === 'photos') {
      loadCommunityPhotos()
    }
  }, [activeTab, loadCommunityPhotos])

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
    setError(null)
  }

  const openEdit = (dest) => {
    setEditingId(dest.id)
    setForm({
      name: dest.name || '',
      country: dest.country || '',
      state: dest.state || '',
      location: dest.location || '',
      description: dest.description || '',
      latitude: dest.latitude ?? '',
      longitude: dest.longitude ?? '',
      featured: Boolean(dest.featured),
      status: dest.status || 'published',
    })
    setShowForm(true)
    setError(null)
  }

  const handleSaveDestination = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const payload = {
        name: form.name.trim(),
        country: form.country.trim(),
        state: form.state.trim() || null,
        location: form.location.trim() || null,
        description: form.description.trim(),
        latitude: form.latitude === '' ? null : Number(form.latitude),
        longitude: form.longitude === '' ? null : Number(form.longitude),
        featured: Boolean(form.featured),
        status: form.status,
      }

      if (editingId) {
        const updated = await updateAdminDestination(editingId, payload)
        setDestinations((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        )
        setNotice(`Updated destination “${updated.name}”.`)
      } else {
        const created = await createAdminDestination(payload)
        setDestinations((current) => [created, ...current])
        setNotice(`Created destination “${created.name}”.`)
      }
      setShowForm(false)
      setEditingId(null)
      setForm(emptyForm)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const handleTogglePublish = async (dest) => {
    const nextStatus = dest.status === 'published' ? 'draft' : 'published'
    setBusyId(dest.id)
    setError(null)
    setNotice(null)
    try {
      const updated = await updateAdminDestination(dest.id, { status: nextStatus })
      setDestinations((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      )
      setNotice(
        nextStatus === 'published'
          ? `Published “${updated.name}”.`
          : `Unpublished “${updated.name}” (now draft).`,
      )
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const handleDeleteDestination = async (dest) => {
    if (!window.confirm(`Delete destination “${dest.name}”?`)) return
    setBusyId(dest.id)
    setError(null)
    setNotice(null)
    try {
      await deleteAdminDestination(dest.id)
      setDestinations((current) => current.filter((item) => item.id !== dest.id))
      setNotice(`Deleted “${dest.name}”.`)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const handleUploadPhoto = async (event) => {
    event.preventDefault()
    if (!managingImagesFor || !photoFile) return
    setUploadingPhoto(true)
    setError(null)
    try {
      await uploadAdminDestinationPhoto(managingImagesFor.id, {
        file: photoFile,
        caption: photoCaption.trim(),
      })
      setPhotoFile(null)
      setPhotoCaption('')
      await loadDestinations()
      const refreshed = await fetchAdminDestinations({ page, limit: 15, ...filters })
      const updatedDest = (refreshed.destinations || []).find(
        (d) => d.id === managingImagesFor.id,
      )
      if (updatedDest) setManagingImagesFor(updatedDest)
      setNotice('Uploaded destination photo.')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setUploadingPhoto(false)
    }
  }

  const handleSetCover = async (destinationId, imageId) => {
    setBusyId(imageId)
    setError(null)
    try {
      await setDestinationCoverImage(destinationId, imageId)
      await loadDestinations()
      setManagingImagesFor((current) =>
        current
          ? {
              ...current,
              images: (current.images || []).map((img) => ({
                ...img,
                isCover: img.id === imageId,
              })),
            }
          : null,
      )
      setNotice('Updated cover image.')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  const handleRemovePhoto = async (destinationId, imageId) => {
    if (!window.confirm('Remove this destination photo?')) return
    setBusyId(imageId)
    setError(null)
    try {
      await deleteAdminDestinationPhoto(destinationId, imageId, 'Removed by admin')
      setCommunityPhotos((current) => current.filter((p) => p.id !== imageId))
      setManagingImagesFor((current) =>
        current
          ? {
              ...current,
              images: (current.images || []).filter((img) => img.id !== imageId),
            }
          : null,
      )
      setDestinations((current) =>
        current.map((dest) =>
          dest.id === destinationId
            ? {
                ...dest,
                images: (dest.images || []).filter((img) => img.id !== imageId),
                imageCount: Math.max(0, (dest.imageCount || 1) - 1),
              }
            : dest,
        ),
      )
      setNotice('Removed destination photo.')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-tafera-primary">
            Destination management
          </p>
          <h1 className="mt-1 font-heading text-2xl font-bold text-tafera-text sm:text-3xl">
            Destinations &amp; Photos
          </h1>
          <p className="mt-1 text-sm text-tafera-text-muted">
            Create, edit, publish/unpublish destinations, and review community-contributed photos.
          </p>
        </div>
        <Button type="button" variant="accent" onClick={openCreate}>
          + New destination
        </Button>
      </header>

      <div role="tablist" className="flex gap-2 border-b border-tafera-border">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'destinations'}
          onClick={() => setActiveTab('destinations')}
          className={`border-b-2 px-4 py-2.5 text-sm font-semibold ${
            activeTab === 'destinations'
              ? 'border-tafera-primary text-tafera-primary'
              : 'border-transparent text-tafera-text-muted hover:text-tafera-text'
          }`}
        >
          Destinations
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'photos'}
          onClick={() => setActiveTab('photos')}
          className={`border-b-2 px-4 py-2.5 text-sm font-semibold ${
            activeTab === 'photos'
              ? 'border-tafera-primary text-tafera-primary'
              : 'border-transparent text-tafera-text-muted hover:text-tafera-text'
          }`}
        >
          Community Photos
        </button>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3.5 text-sm text-tafera-text">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-lg border border-tafera-primary/30 bg-tafera-card p-3.5 text-sm text-tafera-text">
          {notice}
        </div>
      )}

      {showForm && (
        <section
          aria-label={editingId ? 'Edit destination' : 'Create destination'}
          className="rounded-xl border border-tafera-border bg-tafera-surface p-5 shadow-soft"
        >
          <h2 className="mb-4 font-heading text-lg font-bold text-tafera-text">
            {editingId ? 'Edit destination' : 'Create destination'}
          </h2>
          <form onSubmit={handleSaveDestination} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="text-xs font-semibold text-tafera-text">
              Destination name
              <input
                required
                className={inputClass}
                value={form.name}
                onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
                placeholder="Yankari Game Reserve"
              />
            </label>
            <label className="text-xs font-semibold text-tafera-text">
              Country
              <input
                required
                className={inputClass}
                value={form.country}
                onChange={(e) => setForm((c) => ({ ...c, country: e.target.value }))}
                placeholder="Nigeria"
              />
            </label>
            <label className="text-xs font-semibold text-tafera-text">
              State / region
              <input
                className={inputClass}
                value={form.state}
                onChange={(e) => setForm((c) => ({ ...c, state: e.target.value }))}
                placeholder="Bauchi"
              />
            </label>
            <label className="text-xs font-semibold text-tafera-text">
              Location label
              <input
                className={inputClass}
                value={form.location}
                onChange={(e) => setForm((c) => ({ ...c, location: e.target.value }))}
                placeholder="Alkaleri, Bauchi State"
              />
            </label>
            <label className="text-xs font-semibold text-tafera-text sm:col-span-2">
              Description
              <textarea
                required
                rows="3"
                className={inputClass}
                value={form.description}
                onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))}
                placeholder="Describe what makes this destination worth visiting."
              />
            </label>
            <label className="text-xs font-semibold text-tafera-text">
              Latitude (optional)
              <input
                type="number"
                step="any"
                className={inputClass}
                value={form.latitude}
                onChange={(e) => setForm((c) => ({ ...c, latitude: e.target.value }))}
              />
            </label>
            <label className="text-xs font-semibold text-tafera-text">
              Longitude (optional)
              <input
                type="number"
                step="any"
                className={inputClass}
                value={form.longitude}
                onChange={(e) => setForm((c) => ({ ...c, longitude: e.target.value }))}
              />
            </label>
            <label className="text-xs font-semibold text-tafera-text">
              Visibility
              <select
                className={inputClass}
                value={form.status}
                onChange={(e) => setForm((c) => ({ ...c, status: e.target.value }))}
              >
                <option value="published" className="bg-tafera-card text-tafera-text">Published</option>
                <option value="draft" className="bg-tafera-card text-tafera-text">Draft (Unpublished)</option>
              </select>
            </label>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-tafera-text">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(e) => setForm((c) => ({ ...c, featured: e.target.checked }))}
              />
              Featured destination
            </label>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create destination'}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </section>
      )}

      {activeTab === 'destinations' ? (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              setPage(1)
              setFilters((c) => ({ ...c, search: searchInput.trim() }))
            }}
            className="grid grid-cols-1 gap-3 rounded-xl border border-tafera-border bg-tafera-surface p-4 sm:grid-cols-[1.5fr_0.8fr_auto] sm:items-end"
          >
            <label className="text-xs font-semibold text-tafera-text">
              Search destinations
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Name, country, or state"
                className={inputClass}
              />
            </label>
            <label className="text-xs font-semibold text-tafera-text">
              Status
              <select
                aria-label="Filter destinations by status"
                value={filters.status}
                onChange={(e) => {
                  setPage(1)
                  setFilters((c) => ({ ...c, status: e.target.value }))
                }}
                className={inputClass}
              >
                <option value="" className="bg-tafera-card text-tafera-text">All statuses</option>
                <option value="published" className="bg-tafera-card text-tafera-text">Published</option>
                <option value="draft" className="bg-tafera-card text-tafera-text">Draft</option>
              </select>
            </label>
            <Button type="submit">Search</Button>
          </form>

          {loading ? (
            <div className="space-y-3" aria-label="Loading destinations">
              {[1, 2, 3].map((row) => (
                <div key={row} className="h-20 animate-pulse rounded-xl border border-tafera-border bg-tafera-card" />
              ))}
            </div>
          ) : destinations.length === 0 ? (
            <p className="rounded-xl border border-dashed border-tafera-border bg-tafera-surface px-4 py-12 text-center text-sm text-tafera-text-muted">
              No destinations found.
            </p>
          ) : (
            <ul className="space-y-3">
              {destinations.map((dest) => (
                <li
                  key={dest.id}
                  className="flex flex-col gap-4 rounded-xl border border-tafera-border bg-tafera-card p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-4">
                    {dest.coverImage?.imageUrl ? (
                      <img
                        src={dest.coverImage.imageUrl}
                        alt={dest.name}
                        className="h-16 w-20 shrink-0 rounded-lg border border-tafera-border object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-20 shrink-0 items-center justify-center rounded-lg border border-tafera-border bg-tafera-surface text-[11px] text-tafera-text-muted">
                        No photo
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-heading text-base font-bold text-tafera-text">
                          {dest.name}
                        </h3>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                            dest.status === 'published'
                              ? 'bg-tafera-accent text-tafera-on-accent'
                              : 'border border-tafera-border bg-tafera-surface text-tafera-text-muted'
                          }`}
                        >
                          {dest.status === 'published' ? 'Published' : 'Draft'}
                        </span>
                        {dest.featured && (
                          <span className="rounded-full bg-tafera-lime px-2 py-0.5 text-[10px] font-bold text-tafera-ink">
                            Featured
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-tafera-text-muted">
                        {[dest.state, dest.country].filter(Boolean).join(', ')} · {dest.imageCount || 0} photos
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyId === dest.id}
                      onClick={() => handleTogglePublish(dest)}
                    >
                      {dest.status === 'published' ? 'Unpublish' : 'Publish'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setManagingImagesFor(dest)}
                    >
                      Photos
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => openEdit(dest)}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busyId === dest.id}
                      onClick={() => handleDeleteDestination(dest)}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!pagination.hasPreviousPage}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-xs text-tafera-text-muted">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!pagination.hasNextPage}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      ) : (
        <section aria-label="Community destination photos">
          {photosLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((row) => (
                <div key={row} className="h-56 animate-pulse rounded-xl border border-tafera-border bg-tafera-card" />
              ))}
            </div>
          ) : communityPhotos.length === 0 ? (
            <p className="rounded-xl border border-dashed border-tafera-border bg-tafera-surface px-4 py-12 text-center text-sm text-tafera-text-muted">
              No destination photos available to review.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {communityPhotos.map((photo) => (
                <li
                  key={photo.id}
                  className="flex flex-col overflow-hidden rounded-xl border border-tafera-border bg-tafera-card shadow-soft"
                >
                  <img
                    src={photo.imageUrl}
                    alt={photo.altText || photo.destination?.name || 'Destination photo'}
                    className="aspect-[4/3] w-full object-cover"
                    loading="lazy"
                  />
                  <div className="flex flex-1 flex-col p-4">
                    <p className="font-heading text-sm font-bold text-tafera-text">
                      {photo.destination?.name || 'Destination'}
                    </p>
                    <p className="text-xs text-tafera-text-muted">
                      By {photo.contributor?.fullName || 'Admin'}
                      {photo.isCover ? ' · Cover' : ''}
                    </p>
                    {photo.caption && (
                      <p className="mt-2 line-clamp-2 text-xs text-tafera-text">
                        {photo.caption}
                      </p>
                    )}
                    <div className="mt-auto flex flex-wrap gap-2 pt-3">
                      {!photo.isCover && photo.destination?.id && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busyId === photo.id}
                          onClick={() => handleSetCover(photo.destination.id, photo.id)}
                        >
                          Set cover
                        </Button>
                      )}
                      {photo.destination?.id && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={busyId === photo.id}
                          onClick={() => handleRemovePhoto(photo.destination.id, photo.id)}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Manage Destination Images Modal */}
      {managingImagesFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          onClick={() => setManagingImagesFor(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="manage-dest-photos-title"
        >
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-tafera-border bg-tafera-card shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-tafera-border px-5 py-4">
              <h2 id="manage-dest-photos-title" className="font-heading text-lg font-bold text-tafera-text">
                Photos — {managingImagesFor.name}
              </h2>
              <Button type="button" size="sm" variant="outline" onClick={() => setManagingImagesFor(null)}>
                Close
              </Button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <form
                onSubmit={handleUploadPhoto}
                className="grid grid-cols-1 gap-3 rounded-lg border border-tafera-border bg-tafera-surface p-4 sm:grid-cols-2"
              >
                <label className="text-xs font-semibold text-tafera-text">
                  Upload photo
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    required
                    onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                    className={inputClass}
                  />
                </label>
                <label className="text-xs font-semibold text-tafera-text">
                  Caption (optional)
                  <input
                    type="text"
                    value={photoCaption}
                    onChange={(e) => setPhotoCaption(e.target.value)}
                    placeholder="Photo description"
                    className={inputClass}
                  />
                </label>
                <div className="sm:col-span-2">
                  <Button type="submit" size="sm" disabled={uploadingPhoto || !photoFile}>
                    {uploadingPhoto ? 'Uploading…' : 'Upload image'}
                  </Button>
                </div>
              </form>

              {!managingImagesFor.images?.length ? (
                <p className="text-center text-sm text-tafera-text-muted">No photos uploaded yet.</p>
              ) : (
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {managingImagesFor.images.map((img) => (
                    <li key={img.id} className="overflow-hidden rounded-lg border border-tafera-border bg-tafera-surface">
                      <img src={img.imageUrl} alt={img.altText || managingImagesFor.name} className="aspect-video w-full object-cover" />
                      <div className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs">
                        <span className="text-tafera-text-muted">
                          {img.isCover ? 'Cover image' : img.contributor?.fullName || 'Gallery'}
                        </span>
                        <div className="flex gap-1.5">
                          {!img.isCover && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busyId === img.id}
                              onClick={() => handleSetCover(managingImagesFor.id, img.id)}
                            >
                              Set cover
                            </Button>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={busyId === img.id}
                            onClick={() => handleRemovePhoto(managingImagesFor.id, img.id)}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
