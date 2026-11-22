import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import Home from '../../pages/Home'

export default function HomeRoute() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return <div className="mx-auto max-w-2xl py-16 text-center text-tafera-text-muted">Checking your session...</div>
  }

  return isAuthenticated ? <Navigate to="/social" replace /> : <Home />
}
