import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { setPendingAction } from '../../services/auth'

export function RequireVerifiedEmail({ children }) {
  const { isAuthenticated, isEmailVerified, isLoading } = useAuth()
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
    setPendingAction(
      { action: 'sign_in' },
      location.pathname + location.search + location.hash,
    )
    return <Navigate to="/login" replace />
  }

  if (!isEmailVerified) {
    setPendingAction(
      { action: 'verify_email' },
      location.pathname + location.search + location.hash,
    )
    return <Navigate to="/verify-email" replace />
  }

  return children
}
