import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../components/common/Button'
import { useAuth } from '../contexts/AuthContext'
import {
  fetchCsrfToken,
  getPendingAction,
  clearPendingAction,
  resendVerification as resendVerificationService,
} from '../services/auth'

export default function Registration() {
  const [form, setForm] = useState({ fullName: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [csrfToken, setCsrfToken] = useState(null)
  const [pendingAction, setPendingAction] = useState(null)
  const [registrationComplete, setRegistrationComplete] = useState(false)
  const [emailVerificationSent, setEmailVerificationSent] = useState(null)
  const navigate = useNavigate()
  const { register: authRegister, resendVerification: authResendVerification } = useAuth()

  useEffect(() => {
    const action = getPendingAction()
    if (action) {
      setPendingAction(action)
      clearPendingAction()
    }
    fetchCsrfToken()
      .then((token) => setCsrfToken(token))
      .catch(() => {
        // CSRF fetch failure is non-fatal; registration will still attempt
      })
  }, [])

  const refreshCsrf = async () => {
    try {
      const token = await fetchCsrfToken()
      setCsrfToken(token)
    } catch {
      // Non-fatal
    }
  }

  const validate = () => {
    const { fullName, email, password } = form
    if (!fullName || fullName.trim().length < 2) {
      return 'Full name must be at least 2 characters long.'
    }
    if (
      !email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      return 'Enter a valid email address.'
    }
    if (!password || password.length < 12) {
      return 'Password must be at least 12 characters long.'
    }
    return null
  }

  const handleChange = (field) => (e) => {
    setForm({ ...form, [field]: e.target.value })
    setError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      setLoading(false)
      return
    }

    try {
      if (!csrfToken) {
        await refreshCsrf()
      }
      const response = await authRegister({
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
      })

      // Registration creates an authenticated session and attempts to send a
      // verification email. The backend confirms whether delivery succeeded.
      setEmailVerificationSent(response.emailVerificationSent === true)
      setRegistrationComplete(true)
    } catch (err) {
      setError(err.message || 'Registration failed')
      setLoading(false)
      await refreshCsrf()
    }
  }

  if (registrationComplete) {
    return (
      <div className="max-w-md mx-auto py-24">
        <div className="text-center">
          <h2 className="text-2xl font-heading font-bold text-tafera-text">
            Account created!
          </h2>
          <p className="mt-2 text-tafera-text-muted">
            Your account has been created. Please verify your email address to
            access all features.
          </p>
          <p className="mt-2 text-sm text-tafera-text-muted">
            Verification email sent to{' '}
            <span className="font-semibold text-tafera-text">
              {form.email.trim().toLowerCase()}
            </span>
          </p>
          {!emailVerificationSent && (
            <div className="mt-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
              Unable to send the verification email right now. You can request
              another verification email below once it is available.
            </div>
          )}
          {error && (
            <div className="mt-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={async () => {
                setLoading(true)
                try {
                  await authResendVerification()
                } catch (err) {
                  setError(err.message || 'Failed to resend verification email.')
                }
                setLoading(false)
              }}
              disabled={loading}
              variant="outline"
              className="w-full sm:w-auto"
            >
              {loading ? 'Sending...' : 'Resend verification email'}
            </Button>
            <Link asChild to="/" className="w-full sm:w-auto">
              <Button variant="ghost">Continue to home</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-bold text-tafera-text sm:text-3xl">
          Create an account
        </h1>
        <p className="mt-2 text-tafera-text-muted">
          Join Tafera and start planning your journeys.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
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
            className="w-full px-4 py-2 rounded-lg border border-tafera-border focus:ring-2 focus:ring-tafera-primary focus:border-tafera-primary outline-none transition-colors"
            placeholder="Ada Lovelace"
          />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-tafera-text mb-1">
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={handleChange('email')}
            className="w-full px-4 py-2 rounded-lg border border-tafera-border focus:ring-2 focus:ring-tafera-primary focus:border-tafera-primary outline-none transition-colors"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-tafera-text mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={form.password}
            onChange={handleChange('password')}
            className="w-full px-4 py-2 rounded-lg border border-tafera-border focus:ring-2 focus:ring-tafera-primary focus:border-tafera-primary outline-none transition-colors"
            placeholder="••••••••"
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          className="w-full"
          disabled={loading}
        >
          {loading ? 'Creating account...' : 'Create account'}
        </Button>
        <p className="mt-4 text-sm text-center text-tafera-text-muted">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-tafera-primary hover:underline">
            Log in
          </Link>
        </p>
      </form>

      <div className="mt-10 flex justify-end">
        <Link asChild to="/">
          <Button variant="ghost">Back to home</Button>
        </Link>
      </div>
    </div>
  )
}
