import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Button } from '../components/common/Button'
import { getPendingAction, clearPendingAction } from '../services/auth'
import { API_BASE } from '../services/api'

export default function Login() {
  const [pendingAction, setPendingAction] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [csrfToken, setCsrfToken] = useState(null)
  const navigate = useNavigate()

  useEffect(() => {
    const action = getPendingAction()
    if (action) {
      setPendingAction(action)
      clearPendingAction()
    }
    fetchCsrfToken()
  }, [])

  const fetchCsrfToken = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/csrf`, {
        credentials: 'include',
      })
      if (res.ok) {
        const data = await res.json()
        setCsrfToken(data.data.csrfToken)
      }
    } catch {
      // CSRF fetch failure is non-fatal; login will still attempt
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const email = document.getElementById('email').value
    const password = document.getElementById('password').value

    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        body: JSON.stringify({ email, password }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.message || 'Login failed')
      }

      const data = await res.json()

      // Refresh auth state
      try {
        await fetch(`${API_BASE}/api/auth/me`, {
          credentials: 'include',
        })
      } catch {
        // Auth check failure is non-fatal after successful login
      }

      // Return to pending action or home
      if (pendingAction?.returnTo) {
        navigate(pendingAction.returnTo)
      } else {
        navigate('/')
      }
    } catch (err) {
      setError(err.message || 'Login failed')
      setLoading(false)
    }
  }

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
            autoComplete="current-password"
            required
            className="w-full px-4 py-2 rounded-lg border border-tafera-border focus:ring-2 focus:ring-tafera-primary focus:border-tafera-primary outline-none transition-colors"
            placeholder="••••••••"
          />
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
