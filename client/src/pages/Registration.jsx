import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../components/common/Button'
import { PasswordInput } from '../components/common/PasswordInput'
import { useAuth } from '../contexts/AuthContext'
import {
  fetchCsrfToken,
  getPendingAction,
  clearPendingAction,
} from '../services/auth'
import { getErrorMessage, getFieldErrors } from '../services/errors'

export default function Registration() {
  const [form, setForm] = useState({ fullName: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [csrfToken, setCsrfToken] = useState(null)
  const [pendingAction, setPendingAction] = useState(null)
  const [registrationComplete, setRegistrationComplete] = useState(false)
  const [emailVerificationSent, setEmailVerificationSent] = useState(null)
  const [resendMessage, setResendMessage] = useState(null)
  const navigate = useNavigate()
  const { register: authRegister, resendVerification: authResendVerification } = useAuth()

  useEffect(() => {
    const action = getPendingAction()
    if (action) {
      setPendingAction(action)
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
    setFieldErrors({})
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setFieldErrors({})

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
      setLoading(false)
    } catch (err) {
      setError(getErrorMessage(err))
      setFieldErrors(
        Object.fromEntries(
          getFieldErrors(err).map((fe) => [fe.field, fe.message])
        )
      )
      setLoading(false)
      await refreshCsrf()
    }
  }

  const getFieldError = (field) => fieldErrors[field]

  if (registrationComplete) {
    return (
      <div className="app-container max-w-3xl mx-auto py-16 sm:py-24">
        <div className="text-center">
          <h2 className="text-2xl font-heading font-bold text-tafera-text">
            Account created!
          </h2>
          <p className="mt-2 text-tafera-text-muted">
            Your account has been created. Please verify your email address to
            access all features.
          </p>
          <p className="mt-2 text-sm text-tafera-text-muted">
            {emailVerificationSent ? (
              <>
                Verification email sent to{' '}
                <span className="font-semibold text-tafera-text">
                  {form.email.trim().toLowerCase()}
                </span>.
              </>
            ) : (
              'Your account was created, but we could not send the verification email.'
            )}
            </p>
          {!emailVerificationSent && (
            <div className="mt-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
              You can request another verification email below.
            </div>
          )}
          {error && (
            <div className="mt-4 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}
          {resendMessage && (
            <div
              role={resendMessage.type === 'success' ? 'status' : 'alert'}
              className={`mt-4 p-3 rounded-md border text-sm ${resendMessage.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}
            >
              {resendMessage.text}
            </div>
          )}
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={async () => {
                setLoading(true)
                setError(null)
                setResendMessage(null)
                try {
                  const result = await authResendVerification()
                  setResendMessage({
                    type: 'success',
                    text: result.sent
                      ? 'Verification email sent. Check your inbox.'
                      : 'Your email address is already verified.',
                  })
                } catch (err) {
                  setResendMessage({
                    type: 'error',
                    text: getErrorMessage(err),
                  })
                }
                setLoading(false)
              }}
              disabled={loading}
              variant="outline"
              className="w-full sm:w-auto"
            >
              {loading ? 'Sending...' : 'Resend verification email'}
            </Button>
            <Button
              variant="ghost"
              className="w-full sm:w-auto"
              onClick={() => {
                if (pendingAction) clearPendingAction()
                navigate(pendingAction?.returnTo || '/')
              }}
            >
              {pendingAction ? 'Continue' : 'Continue to home'}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-container max-w-3xl mx-auto py-8 sm:py-12 lg:py-16">
      <div className="mb-8 text-center sm:mb-10">
        <p className="inline-flex rounded-full bg-tafera-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-tafera-primary">Join the community</p>
        <h1 className="mt-4 text-3xl font-heading font-bold text-tafera-text sm:text-4xl lg:text-5xl">
          Create an account
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-base text-tafera-text-muted sm:text-lg">
          Join Tafera and start planning your journeys.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      <form
        className="space-y-7 rounded-2xl border border-tafera-border bg-tafera-surface p-6 shadow-soft sm:space-y-8 sm:p-10 lg:p-12 [&_label]:text-base"
        onSubmit={handleSubmit}
      >
        <div>
          <label htmlFor="fullName" className="mb-2 block font-medium text-tafera-text">
            Full name
          </label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            required
            value={form.fullName}
            onChange={handleChange('fullName')}
            className={`h-14 w-full rounded-lg border border-tafera-border px-4 text-base focus:ring-2 focus:ring-tafera-primary focus:border-tafera-primary outline-none transition-colors ${
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
          <label htmlFor="email" className="mb-2 block font-medium text-tafera-text">
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={handleChange('email')}
            className={`h-14 w-full rounded-lg border border-tafera-border px-4 text-base focus:ring-2 focus:ring-tafera-primary focus:border-tafera-primary outline-none transition-colors ${
              getFieldError('email') ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : ''
            }`}
            placeholder="you@example.com"
            aria-invalid={Boolean(getFieldError('email'))}
            aria-describedby={getFieldError('email') ? 'email-error' : undefined}
          />
          {getFieldError('email') && (
            <p id="email-error" className="mt-1 text-sm text-red-700">
              {getFieldError('email')}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-tafera-text mb-1">
            Password
          </label>
          <PasswordInput
            id="password"
            value={form.password}
            onChange={handleChange('password')}
            autoComplete="new-password"
            className="h-14 text-base"
            required
            placeholder="••••••••"
            label="Password"
            aria-invalid={Boolean(getFieldError('password'))}
            aria-describedby={getFieldError('password') ? 'password-error' : undefined}
          />
          {getFieldError('password') && (
            <p id="password-error" className="mt-1 text-sm text-red-700">
              {getFieldError('password')}
            </p>
          )}
        </div>
        <Button
          type="submit"
          variant="primary"
          className="min-h-14 w-full text-base"
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
