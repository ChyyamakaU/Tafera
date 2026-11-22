import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { setPendingAction } from '../../services/auth'

export function RequireAuth({ children }) {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center py-24">
        <div
          className="h-8 w-32 rounded-md border border-tafera-border bg-tafera-surface animate-pulse"
        />
      </div>
    )
  }

  if (!isAuthenticated) {
    setPendingAction({ action: 'sign_in' }, location.pathname + location.search + location.hash)
    return <Navigate to="/login" replace />
  }

  return children
}

export function RequireAdmin({ children }) {
  const { user, isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center py-24">
        <div
          className="h-8 w-32 rounded-md border border-tafera-border bg-tafera-surface animate-pulse"
        />
      </div>
    )
  }

  if (!isAuthenticated) {
    setPendingAction({ action: 'sign_in' }, location.pathname + location.search + location.hash)
    return <Navigate to="/login" replace />
  }

  if (user?.role !== 'admin') {
    return (
      <div className="max-w-2xl mx-auto py-24 px-4 text-center">
        <h1 className="text-3xl font-heading font-bold text-tafera-text mb-4">
          Not authorised
        </h1>
        <p className="text-lg text-tafera-text-muted mb-8">
          You do not have administrator access to this page.
        </p>
      </div>
    )
  }

  return children
}
