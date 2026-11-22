import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../components/common/Button'
import { useAuth } from '../contexts/AuthContext'
import { getProfile, updateProfile } from '../services/auth'
import { getErrorMessage, getFieldErrors } from '../services/errors'

export default function Profile() {
  const { isAuthenticated } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [success, setSuccess] = useState(false)
  const [form, setForm] = useState({
    fullName: '',
    bio: '',
    profileImage: '',
  })
  const navigate = useNavigate()

  const loadProfile = async () => {
    try {
      const response = await getProfile()
      const user = response.data.user
      setProfile(user)
      setForm({
        fullName: user.fullName || '',
        bio: user.bio || '',
        profileImage: user.profileImage || '',
      })
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login')
      return
    }
    loadProfile()
  }, [isAuthenticated, navigate])

  const handleChange = (field) => (e) => {
    setForm({ ...form, [field]: e.target.value })
    setError(null)
    setSuccess(false)
    setFieldErrors({})
  }

  const validate = () => {
    const { fullName } = form
    if (!fullName || fullName.trim().length < 2) {
      return 'Full name must be at least 2 characters long.'
    }
    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)
    setFieldErrors({})

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      setLoading(false)
      return
    }

    try {
      const response = await updateProfile({
        fullName: form.fullName.trim(),
        bio: form.bio.trim(),
        profileImage: form.profileImage.trim(),
      })
      setProfile(response.data.user)
      setForm({
        fullName: response.data.user.fullName || '',
        bio: response.data.user.bio || '',
        profileImage: response.data.user.profileImage || '',
      })
      setSuccess(true)
    } catch (err) {
      setError(getErrorMessage(err))
      setFieldErrors(
        Object.fromEntries(
          getFieldErrors(err).map((fe) => [fe.field, fe.message])
        )
      )
    } finally {
      setLoading(false)
    }
  }

  const getFieldError = (field) => fieldErrors[field]

  if (loading) {
    return (
      <div className="max-w-md mx-auto py-24">
        <div className="text-center">
          <h2 className="text-2xl font-heading font-bold text-tafera-text">
            Loading profile...
          </h2>
          <p className="mt-2 text-tafera-text-muted">
            Please wait while we load your profile.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-bold text-tafera-text sm:text-3xl">
          Profile
        </h1>
        <p className="mt-2 text-tafera-text-muted">
          Manage your profile settings.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-6 p-3 rounded-md bg-green-50 border border-green-200 text-green-700 text-sm">
          Profile updated successfully.
        </div>
      )}

      <form
        className="rounded-lg border border-tafera-border bg-tafera-surface p-8 shadow-soft space-y-6"
        onSubmit={handleSubmit}
      >
        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-tafera-text mb-1">
            Full name
          </label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            required
            value={form.fullName}
            onChange={handleChange('fullName')}
            className={`w-full px-4 py-2 rounded-lg border border-tafera-border focus:ring-2 focus:ring-tafera-primary focus:border-tafera-primary outline-none transition-colors ${
              getFieldError('fullName') ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''
            }`}
            placeholder="Ada Lovelace"
            aria-invalid={Boolean(getFieldError('fullName'))}
            aria-describedby={getFieldError('fullName') ? 'fullName-error' : undefined}
          />
          {getFieldError('fullName') && (
            <p id="fullName-error" className="mt-1 text-sm text-red-700">
              {getFieldError('fullName')}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="bio" className="block text-sm font-medium text-tafera-text mb-1">
            Bio
          </label>
          <textarea
            id="bio"
            autoComplete="off"
            value={form.bio}
            onChange={handleChange('bio')}
            className={`w-full px-4 py-2 rounded-lg border border-tafera-border focus:ring-2 focus:ring-tafera-primary focus:border-tafera-primary outline-none transition-colors ${
              getFieldError('bio') ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''
            }`}
            rows={4}
            placeholder="Tell us a bit about yourself..."
            aria-invalid={Boolean(getFieldError('bio'))}
            aria-describedby={getFieldError('bio') ? 'bio-error' : undefined}
          />
          {getFieldError('bio') && (
            <p id="bio-error" className="mt-1 text-sm text-red-700">
              {getFieldError('bio')}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="profileImage" className="block text-sm font-medium text-tafera-text mb-1">
            Profile image URL
          </label>
          <input
            id="profileImage"
            type="url"
            autoComplete="off"
            value={form.profileImage}
            onChange={handleChange('profileImage')}
            className={`w-full px-4 py-2 rounded-lg border border-tafera-border focus:ring-2 focus:ring-tafera-primary focus:border-tafera-primary outline-none transition-colors ${
              getFieldError('profileImage') ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''
            }`}
            placeholder="https://example.com/photo.jpg"
            aria-invalid={Boolean(getFieldError('profileImage'))}
            aria-describedby={getFieldError('profileImage') ? 'profileImage-error' : undefined}
          />
          {getFieldError('profileImage') && (
            <p id="profileImage-error" className="mt-1 text-sm text-red-700">
              {getFieldError('profileImage')}
            </p>
          )}
        </div>
        <Button
          type="submit"
          variant="primary"
          className="w-full"
          disabled={loading}
        >
          {loading ? 'Saving...' : 'Save changes'}
        </Button>
      </form>

      <div className="mt-10 flex justify-end">
        <Link asChild to="/">
          <Button variant="ghost">Back to home</Button>
        </Link>
      </div>
    </div>
  )
}
