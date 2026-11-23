import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/common/Button'
import { useAuth } from '../contexts/AuthContext'
import { fetchMyTrips } from '../services/trips'
import { getErrorMessage } from '../services/errors'
import {
  createScrapbook,
  deleteScrapbook,
  deleteScrapbookImage,
  fetchScrapbook,
  fetchScrapbooks,
  linkScrapbookTrip,
  reorderScrapbookImages,
  setScrapbookVisibility,
  unlinkScrapbookTrip,
  updateScrapbook,
  updateScrapbookImage,
  uploadScrapbookImage,
} from '../services/scrapbooks'

const inputClass = 'w-full rounded-lg border border-tafera-border bg-tafera-card px-3 py-2 text-tafera-text placeholder:text-tafera-text-muted focus:border-tafera-primary focus:outline-none focus:ring-2 focus:ring-tafera-primary'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

function imageDate(takenAt) {
  if (!takenAt) return ''
  return String(takenAt).slice(0, 10)
}

export default function Scrapbooks() {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const [journals, setJournals] = useState([])
  const [trips, setTrips] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tripId, setTripId] = useState('')
  const [file, setFile] = useState(null)
  const [caption, setCaption] = useState('')
  const [altText, setAltText] = useState('')
  const [takenAt, setTakenAt] = useState('')
  const previewUrl = useMemo(() => file ? URL.createObjectURL(file) : null, [file])

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  const loadJournals = useCallback(async () => {
    if (!isAuthenticated) {
      setJournals([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [result, tripResult] = await Promise.all([
        fetchScrapbooks({ page: 1, limit: 50 }),
        fetchMyTrips({ page: 1, limit: 50 }),
      ])
      setJournals(result.journals || [])
      setTrips((tripResult.trips || []).filter((trip) => trip.tripType === 'personal'))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (!authLoading) loadJournals()
  }, [authLoading, loadJournals])

  const refreshSelected = async (journalId) => {
    const updated = await fetchScrapbook(journalId)
    setSelected(updated)
    setJournals((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item))
    return updated
  }

  const chooseJournal = async (journal) => {
    setError(null)
    setSaving(true)
    try {
      setSelected(await fetchScrapbook(journal.id))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const submitCreate = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const journal = await createScrapbook({
        title: title.trim(),
        description: description.trim() || null,
        tripId: tripId || null,
        isPublic: false,
      })
      setJournals((current) => [journal, ...current])
      setSelected(journal)
      setTitle('')
      setDescription('')
      setTripId('')
      setShowCreate(false)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const saveJournal = async (input) => {
    setSaving(true)
    setError(null)
    try {
      const updated = await updateScrapbook(selected.id, input)
      await refreshSelected(updated.id)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const toggleVisibility = async () => {
    setSaving(true)
    setError(null)
    try {
      const updated = await setScrapbookVisibility(selected.id, !selected.isPublic)
      setSelected(updated)
      setJournals((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const submitImage = async (event) => {
    event.preventDefault()
    if (!file) return
    if (!ACCEPTED_TYPES.includes(file.type) || file.size > MAX_IMAGE_BYTES) {
      setError('Choose a JPEG, PNG or WebP image no larger than 5 MB.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await uploadScrapbookImage(selected.id, { file, caption: caption.trim(), altText: altText.trim(), takenAt })
      await refreshSelected(selected.id)
      setFile(null)
      setCaption('')
      setAltText('')
      setTakenAt('')
      event.target.reset()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const saveImage = async (image, changes) => {
    setSaving(true)
    setError(null)
    try {
      await updateScrapbookImage(selected.id, image.id, changes)
      await refreshSelected(selected.id)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const removeImage = async (image) => {
    if (!window.confirm('Delete this photo from your scrapbook?')) return
    setSaving(true)
    try {
      await deleteScrapbookImage(selected.id, image.id)
      await refreshSelected(selected.id)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const moveImage = async (image, direction) => {
    const ordered = [...(selected.images || [])].sort((a, b) => a.displayOrder - b.displayOrder)
    const index = ordered.findIndex((item) => item.id === image.id)
    const target = index + direction
    if (target < 0 || target >= ordered.length) return
    ;[ordered[index], ordered[target]] = [ordered[target], ordered[index]]
    setSaving(true)
    try {
      await reorderScrapbookImages(selected.id, ordered.map((item) => item.id))
      await refreshSelected(selected.id)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const removeJournal = async () => {
    if (!window.confirm('Delete this scrapbook and all of its photos?')) return
    setSaving(true)
    try {
      await deleteScrapbook(selected.id)
      setJournals((current) => current.filter((item) => item.id !== selected.id))
      setSelected(null)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const updateTripLink = async (value) => {
    setSaving(true)
    setError(null)
    try {
      const updated = value
        ? await linkScrapbookTrip(selected.id, value)
        : await unlinkScrapbookTrip(selected.id)
      setSelected(updated)
      setJournals((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  if (authLoading || loading) return <main className="app-container py-8 sm:py-10"><div className="h-36 animate-pulse rounded-lg border border-tafera-border bg-tafera-surface" aria-label="Loading scrapbooks" /></main>

  return (
    <main className="app-container py-6 sm:py-10">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 sm:mb-8">
        <div><h1 className="font-heading text-2xl font-bold text-tafera-text sm:text-3xl">Travel scrapbooks</h1><p className="mt-1 text-sm text-tafera-text-muted sm:text-base">Keep your photos and moments together, journey by journey.</p></div>
        {isAuthenticated && <Button onClick={() => setShowCreate((value) => !value)}>{showCreate ? 'Cancel' : 'Create scrapbook'}</Button>}
      </header>

      {!isAuthenticated ? <section className="rounded-lg border border-tafera-border bg-tafera-surface p-5"><p>Sign in to create and manage your private travel scrapbooks.</p><Link to="/login" className="mt-3 inline-block"><Button>Sign in</Button></Link></section> : <>
        {error && <div role="alert" className="mb-5 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-tafera-text">{error}<button className="ml-2 font-semibold text-tafera-primary underline" onClick={loadJournals}>Retry</button></div>}
        {showCreate && <form onSubmit={submitCreate} className="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-tafera-border bg-tafera-surface p-4 sm:grid-cols-2 sm:p-5">
          <label className="text-sm font-medium text-tafera-text">Album title<input className={inputClass} value={title} onChange={(event) => setTitle(event.target.value)} required maxLength="150" /></label>
          <label className="text-sm font-medium text-tafera-text">Link a personal trip (optional)<select className={inputClass} value={tripId} onChange={(event) => setTripId(event.target.value)}><option value="" className="bg-tafera-card text-tafera-text">No trip linked</option>{trips.map((trip) => <option key={trip.id} value={trip.id} className="bg-tafera-card text-tafera-text">{trip.title}</option>)}</select></label>
          <label className="text-sm font-medium text-tafera-text sm:col-span-2">Description<textarea className={inputClass} rows="2" maxLength="1000" value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          <p className="text-xs text-tafera-text-muted sm:col-span-2">New scrapbooks are private. You can change visibility later.</p>
          <div className="sm:col-span-2"><Button type="submit" disabled={saving || !title.trim()}>{saving ? 'Creating...' : 'Create scrapbook'}</Button></div>
        </form>}

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(250px,0.8fr)_minmax(0,1.8fr)]">
          <section aria-label="Your scrapbooks" className="rounded-lg border border-tafera-border bg-tafera-surface p-4 sm:p-5">
            <h2 className="mb-3 font-heading text-lg font-bold text-tafera-text">Your albums</h2>
            {journals.length === 0 ? <div className="rounded-md border border-tafera-border bg-tafera-card p-4 text-sm text-tafera-text-muted">No scrapbooks yet. Create an album for a trip or a collection of memories.</div> : <ul className="space-y-2">{journals.map((journal) => <li key={journal.id}><button onClick={() => chooseJournal(journal)} className={`w-full rounded-md border p-3 text-left transition-colors ${selected?.id === journal.id ? 'border-tafera-primary bg-tafera-card' : 'border-tafera-border/70 bg-tafera-card hover:border-tafera-primary/50'}`} aria-current={selected?.id === journal.id ? 'true' : undefined}><span className="flex items-center justify-between gap-2"><span className="font-semibold text-tafera-text">{journal.title}</span><span className="text-xs text-tafera-text-muted">{journal.isPublic ? 'Public' : 'Private'}</span></span><span className="mt-1 block text-xs text-tafera-text-muted">{journal.imageCount || 0} photos</span></button></li>)}</ul>}
          </section>

          <section className="min-w-0 rounded-lg border border-tafera-border bg-tafera-surface p-4 sm:p-5">
            {!selected ? <div className="py-10 text-center text-sm text-tafera-text-muted">Choose an album to view and organize its memories.</div> : <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0"><h2 className="break-words font-heading text-xl font-bold text-tafera-text sm:text-2xl">{selected.title}</h2><p className="mt-1 text-sm text-tafera-text-muted">{selected.description || 'No description yet.'}</p></div>
                <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={saving} onClick={toggleVisibility}>{selected.isPublic ? 'Make private' : 'Make public'}</Button><Button size="sm" variant="ghost" disabled={saving} onClick={removeJournal}>Delete album</Button></div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-tafera-text-muted">Album title<input aria-label="Edit album title" className={inputClass} defaultValue={selected.title} onBlur={(event) => event.target.value.trim() && event.target.value.trim() !== selected.title && saveJournal({ title: event.target.value.trim() })} /></label>
                <label className="text-xs font-medium text-tafera-text-muted">Trip association<select aria-label="Link scrapbook to a trip" className={inputClass} value={selected.tripId || ''} onChange={(event) => updateTripLink(event.target.value)} disabled={saving}><option value="" className="bg-tafera-card text-tafera-text">No trip linked</option>{trips.map((trip) => <option key={trip.id} value={trip.id} className="bg-tafera-card text-tafera-text">{trip.title}</option>)}</select></label>
              </div>
              <form onSubmit={submitImage} className="mt-5 grid grid-cols-1 gap-3 rounded-md border border-tafera-border bg-tafera-bg p-4 sm:grid-cols-2">
                <h3 className="font-semibold text-tafera-text sm:col-span-2">Add a travel photo</h3>
                <label className="text-sm text-tafera-text-muted sm:col-span-2">Photo (JPEG, PNG or WebP, up to 5 MB)<input className={`${inputClass} mt-1 file:mr-3 file:rounded-md file:border file:border-tafera-border file:bg-tafera-surface file:px-3 file:py-1 file:text-xs file:font-semibold file:text-tafera-text hover:file:bg-tafera-bg`} type="file" accept="image/jpeg,image/png,image/webp" required onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
                {previewUrl && <div className="sm:col-span-2"><img className="max-h-56 max-w-full rounded-md object-contain" src={previewUrl} alt="Selected photo preview" /></div>}
                <label className="text-sm text-tafera-text-muted">Caption<input className={inputClass} value={caption} maxLength="1000" onChange={(event) => setCaption(event.target.value)} /></label>
                <label className="text-sm text-tafera-text-muted">Date taken<input className={inputClass} type="date" value={takenAt} onChange={(event) => setTakenAt(event.target.value)} /></label>
                <label className="text-sm text-tafera-text-muted sm:col-span-2">Image description for accessibility<input className={inputClass} value={altText} maxLength="255" onChange={(event) => setAltText(event.target.value)} /></label>
                <div className="sm:col-span-2"><Button type="submit" disabled={saving || !file}>{saving ? 'Uploading...' : 'Upload photo'}</Button></div>
              </form>
              <div className="mt-5">
                <h3 className="mb-3 font-semibold text-tafera-text">Memories ({selected.images?.length || 0}/50)</h3>
                {!selected.images?.length ? <p className="rounded-md border border-tafera-border bg-tafera-card p-4 text-sm text-tafera-text-muted">No photos in this album yet. Your first upload becomes its cover photo.</p> : <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">{[...selected.images].sort((a, b) => a.displayOrder - b.displayOrder).map((image, index, ordered) => <li key={image.id} className="min-w-0 overflow-hidden rounded-md border border-tafera-border bg-tafera-card">
                  <img src={image.imageUrl} alt={image.altText || image.caption || 'Travel memory'} className="aspect-video w-full object-cover" loading="lazy" />
                  <div className="space-y-2 p-3"><p className="break-words text-sm text-tafera-text">{image.caption || 'No caption'}</p><p className="text-xs text-tafera-text-muted">{image.takenAt ? new Date(image.takenAt).toLocaleDateString() : 'Date not recorded'}{image.isCover ? ' · Cover' : ''}</p>
                    <div className="flex flex-wrap gap-1"><Button size="sm" variant="ghost" aria-label="Edit photo caption and date" onClick={() => {
                      const nextCaption = window.prompt('Photo caption', image.caption || '')
                      if (nextCaption === null) return
                      const nextDate = window.prompt('Date taken (YYYY-MM-DD)', imageDate(image.takenAt))
                      if (nextDate === null) return
                      const changes = { caption: nextCaption.trim() || undefined }
                      if (nextDate.trim()) changes.takenAt = nextDate.trim()
                      else if (image.takenAt) changes.takenAt = imageDate(image.takenAt)
                      saveImage(image, changes)
                    }}>Edit details</Button><Button size="sm" variant="ghost" disabled={saving || index === 0} onClick={() => moveImage(image, -1)}>Move earlier</Button><Button size="sm" variant="ghost" disabled={saving || index === ordered.length - 1} onClick={() => moveImage(image, 1)}>Move later</Button><Button size="sm" variant="ghost" disabled={saving || image.isCover} onClick={() => saveImage(image, { isCover: true })}>Set cover</Button><Button size="sm" variant="ghost" disabled={saving} onClick={() => removeImage(image)}>Delete photo</Button></div>
                  </div>
                </li>)}</ul>}
              </div>
            </>}
          </section>
        </div>
      </>}
    </main>
  )
}
