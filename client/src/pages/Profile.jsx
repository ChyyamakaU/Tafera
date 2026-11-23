import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../components/common/Button'
import ProfileActivitySections from '../components/profile/ProfileActivitySections'
import { useAuth } from '../contexts/AuthContext'
import { getProfile, updateProfile, uploadProfileImage } from '../services/auth'
import { getErrorMessage, getFieldErrors } from '../services/errors'
import { NIGERIAN_STATES } from '../constants/nigeriaStates'

const PROFILE_FIELDS = ['fullName', 'username', 'bio', 'city', 'state', 'websiteUrl', 'instagramUrl', 'tiktokUrl', 'youtubeUrl']
const initialForm = {
  fullName: '', username: '', bio: '', city: '', state: '', websiteUrl: '',
  instagramUrl: '', tiktokUrl: '', youtubeUrl: '',
}
const inputClass = 'w-full rounded-lg border border-tafera-border bg-tafera-card px-3 py-2 text-tafera-text placeholder:text-tafera-text-muted focus:border-tafera-primary focus:outline-none focus:ring-2 focus:ring-tafera-primary'
const MAX_AVATAR_BYTES = 5 * 1024 * 1024
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export default function Profile() {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [success, setSuccess] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [avatarFile, setAvatarFile] = useState(null)
  const navigate = useNavigate()
  const avatarPreview = useMemo(() => avatarFile ? URL.createObjectURL(avatarFile) : null, [avatarFile])

  useEffect(() => () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview) }, [avatarPreview])

  const applyProfile = (user) => {
    setProfile(user)
    setForm(Object.fromEntries(PROFILE_FIELDS.map((field) => [field, user[field] || ''])))
  }

  const loadProfile = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await getProfile()
      applyProfile(response)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (authLoading) return
    if (!isAuthenticated) {
      navigate('/login')
      return
    }
    loadProfile()
  }, [authLoading, isAuthenticated, navigate])

  const handleSave = async (event) => {
    event.preventDefault()
    setError(null)
    setSuccess(false)
    setFieldErrors({})
    if (form.fullName.trim().length < 2) {
      setError('Full name must be at least 2 characters long.')
      return
    }
    setSaving(true)
    try {
      const input = Object.fromEntries(PROFILE_FIELDS.map((field) => [field, form[field].trim() || null]))
      input.fullName = form.fullName.trim()
      const response = await updateProfile(input)
      applyProfile(response)
      setSuccess(true)
      setIsEditing(false)
    } catch (err) {
      setError(getErrorMessage(err))
      setFieldErrors(Object.fromEntries(getFieldErrors(err).map((item) => [item.field, item.message])))
    } finally {
      setSaving(false)
    }
  }

  const handleAvatar = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setError(null)
    if (!IMAGE_TYPES.includes(file.type) || file.size > MAX_AVATAR_BYTES) {
      setError('Choose a JPEG, PNG or WebP image no larger than 5 MB.')
      event.target.value = ''
      return
    }
    setAvatarFile(file)
    setSaving(true)
    try {
      const updated = await uploadProfileImage(file)
      applyProfile(updated)
      setAvatarFile(null)
      setSuccess(true)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
      event.target.value = ''
    }
  }

  if (loading) return <main className="app-container py-16"><div className="animate-pulse rounded-lg border border-tafera-border bg-tafera-surface p-10 text-center">Loading your traveller profile…</div></main>

  return (
    <main className="app-container py-6 sm:py-10">
      <header className="mb-6 sm:mb-8"><h1 className="font-heading text-2xl font-bold text-tafera-text sm:text-3xl">Traveller profile</h1><p className="mt-1 text-sm text-tafera-text-muted sm:text-base">Share who you are and the journeys you’ve made.</p></header>
      {error && <div role="alert" className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-tafera-text">{error}<button onClick={loadProfile} className="ml-2 font-semibold text-tafera-primary underline">Retry</button></div>}
      {success && <p role="status" className="mb-4 rounded-md border border-tafera-primary/30 bg-tafera-primary/10 p-3 text-sm text-tafera-text">Profile updated successfully.</p>}

      <section className="overflow-hidden rounded-xl border border-tafera-border bg-tafera-surface">
        {profile?.coverImage ? <img src={profile.coverImage} alt="Profile cover" className="h-24 w-full object-cover sm:h-36" /> : <div className="h-24 bg-gradient-to-r from-tafera-primary/15 via-tafera-accent/20 to-tafera-primary/10 sm:h-36" aria-hidden="true" />}
        <div className="grid grid-cols-1 gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(200px,0.65fr)_minmax(0,1.7fr)]">
          <div className="-mt-12 sm:-mt-16">
            {profile?.profileImage ? <img src={profile.profileImage} alt={`${profile?.fullName || 'Your'} profile photo`} className="h-24 w-24 rounded-full border-4 border-tafera-surface bg-tafera-card object-cover sm:h-32 sm:w-32" /> : <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-tafera-surface bg-tafera-card text-3xl font-bold text-tafera-primary sm:h-32 sm:w-32">{profile?.fullName?.slice(0, 1) || 'T'}</div>}
            <p className="mt-4 text-sm text-tafera-text-muted">Your traveller card</p>
            <h2 className="mt-1 break-words font-heading text-xl font-bold text-tafera-text">{profile?.fullName}</h2>
            {profile?.username && <p className="text-sm text-tafera-text-muted">@{profile.username}</p>}
            {(profile?.city || profile?.state) && <p className="mt-2 text-sm text-tafera-text-muted">{[profile.city, profile.state, 'Nigeria'].filter(Boolean).join(', ')}</p>}
            {profile?.bio && <p className="mt-3 whitespace-pre-wrap text-sm text-tafera-text">{profile.bio}</p>}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">{[['websiteUrl', 'Website'], ['instagramUrl', 'Instagram'], ['tiktokUrl', 'TikTok'], ['youtubeUrl', 'YouTube']].filter(([key]) => profile?.[key]).map(([key, label]) => <a key={key} href={profile[key]} target="_blank" rel="noreferrer" className="text-tafera-primary hover:underline">{label}</a>)}</div>
            <Button className="mt-4" onClick={() => { setError(null); setIsEditing(true) }}>Edit Profile</Button>
          </div>

          {isEditing && <form onSubmit={handleSave} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-tafera-text sm:col-span-2">Profile photo<div className="mt-1 flex items-center gap-3">{avatarPreview && <img src={avatarPreview} alt="Selected profile photo preview" className="h-12 w-12 rounded-full object-cover" />}<input className={`${inputClass} file:mr-3 file:rounded-md file:border file:border-tafera-border file:bg-tafera-surface file:px-3 file:py-1 file:text-xs file:font-semibold file:text-tafera-text`} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAvatar} disabled={saving} aria-label="Upload profile photo" /></div><span className="text-xs text-tafera-text-muted">JPEG, PNG or WebP · up to 5 MB</span></label>
            <label className="text-sm font-medium text-tafera-text">Full name<input className={inputClass} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required maxLength="100" aria-invalid={Boolean(fieldErrors.fullName)} /></label>
            <label className="text-sm font-medium text-tafera-text">Username<input className={inputClass} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="e.g. ada_travels" maxLength="30" aria-describedby="username-help" aria-invalid={Boolean(fieldErrors.username)} /><span id="username-help" className="text-xs text-tafera-text-muted">3–30 letters, numbers or underscores.</span></label>
            {fieldErrors.username && <p className="text-xs text-red-500 sm:col-span-2">{fieldErrors.username}</p>}
            <label className="text-sm font-medium text-tafera-text sm:col-span-2">Bio<textarea className={inputClass} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows="3" maxLength="500" placeholder="A little about your travels…" /></label>
            <label className="text-sm font-medium text-tafera-text">City<input className={inputClass} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} maxLength="100" placeholder="Lagos" /></label>
            <label className="text-sm font-medium text-tafera-text">Nigerian state / territory<select className={inputClass} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}><option value="" className="bg-tafera-card text-tafera-text">Select a state or territory</option>{NIGERIAN_STATES.map((state) => <option key={state} value={state} className="bg-tafera-card text-tafera-text">{state}</option>)}</select></label>
            {[['websiteUrl', 'Personal website'], ['instagramUrl', 'Instagram URL'], ['tiktokUrl', 'TikTok URL'], ['youtubeUrl', 'YouTube URL']].map(([field, label]) => <label key={field} className="text-sm font-medium text-tafera-text">{label}<input className={inputClass} type="url" value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} placeholder="https://…" /></label>)}
            {Object.entries(fieldErrors).filter(([field]) => field !== 'username').map(([field, message]) => <p key={field} className="text-xs text-red-500 sm:col-span-2">{message}</p>)}
            <div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</Button><Button type="button" variant="ghost" onClick={() => { setIsEditing(false); setAvatarFile(null); setFieldErrors({}) }}>Cancel</Button></div>
          </form>}
        </div>
      </section>

      {profile?.id && (
        <ProfileActivitySections
          userId={profile.id}
          isOwnProfile
          profileName={profile.fullName || 'Your'}
        />
      )}
      <div className="mt-6"><Link to="/" className="text-sm font-medium text-tafera-primary hover:underline">Back to home</Link></div>
    </main>
  )
}
