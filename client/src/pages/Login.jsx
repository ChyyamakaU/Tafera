import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Button } from '../components/common/Button'
import { PasswordInput } from '../components/common/PasswordInput'
import { useAuth } from '../contexts/AuthContext'
import { getPendingAction, clearPendingAction } from '../services/auth'
import { getErrorMessage, getFieldErrors } from '../services/errors'

export default function Login() {
  const [pendingAction, setPendingAction] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [password, setPassword] = useState('')
  const navigate = useNavigate()
  const { login: authLogin } = useAuth()

  useEffect(() => {
    const action = getPendingAction()
    if (action) {
      setPendingAction(action)
      clearPendingAction()
    }
  }, [])

  const validate = () => {
    const email = document.getElementById('email')?.value

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return 'Enter a valid email address.'
    }
    if (!password || password.length < 1) {
      return 'Password is required.'
    }
    return null
  }

  const handleLogin = async (e) => {
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

    const email = document.getElementById('email').value.trim().toLowerCase()

    try {
      await authLogin({ email, password })

      if (pendingAction?.returnTo) {
        navigate(pendingAction.returnTo)
      } else {
        navigate('/')
      }
    } catch (err) {
      setError(getErrorMessage(err))
      setFieldErrors(
        Object.fromEntries(
          getFieldErrors(err).map((fe) => [fe.field, fe.message])
        )
      )
      setLoading(false)
    }
  }

  const getFieldError = (field) => fieldErrors[field]

  return (
    <div className="max-w-md mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-bold text-tafera-text sm:text-3xl">
          Log in
        </h1>
        <p className="mt-2 text-tafera-text-muted">
          Sign in to your Tafera account to continue.
        </p>
      </div>

      {pendingAction && (
        <div className="mb-6 p-4 rounded-md border border-tafera-border bg-tafera-surface">
          <p className="text-sm text-tafera-text-muted">
            You were trying to{' '}
            <span className="font-semibold text-tafera-text">
              {pendingAction.actionLabel || pendingAction.action}
            </span>
            {pendingAction.entityName && (
              <span className="font-semibold text-tafera-text">
                for &quot;{pendingAction.entityName}&quot;
              </span>
            )}
            . Sign in to continue.
          </p>
        </div>
      )}

      {error && (
        <div className="mb-6 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      <form
        className="rounded-lg border border-tafera-border bg-tafera-surface p-8 shadow-soft space-y-6"
        onSubmit={handleLogin}
      >
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-tafera-text mb-1">
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            className={`w-full px-4 py-2 rounded-lg border border-tafera-border focus:ring-2 focus:ring-tafera-primary focus:border-tafera-primary outline-none transition-colors ${
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
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
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-tafera-text-muted cursor-pointer">
            <input type="checkbox" className="rounded border-tafera-border text-tafera-primary focus:ring-tafera-primary" />
            Remember me
          </label>
          <Link to="/" className="text-sm text-tafera-primary hover:underline font-medium">
            Forgot password?
          </Link>
        </div>
        <Button
          type="submit"
          variant="primary"
          className="w-full"
          disabled={loading}
        >
          {loading ? 'Signing in...' : 'Log in'}
        </Button>
        <p className="mt-4 text-sm text-center text-tafera-text-muted">
          Don't have an account?{' '}
          <Link to="/register" className="font-medium text-tafera-primary hover:underline">
            Create an account
          </Link>
        </p>
      </form>

      <div className="mt-10 flex justify-end">
        <Link to="/">
          <Button variant="ghost">Back to home</Button>
        </Link>
      </div>
    </div>
  )
}
