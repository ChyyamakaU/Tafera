import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/common/Button'

export default function VerifyEmail() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [verified, setVerified] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const { verifyEmail: authVerifyEmail, resendVerification: authResendVerification, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  const searchParams = new URLSearchParams(window.location.search)
  const token = searchParams.get('token')

  useEffect(() => {
    if (!token) {
      setError('No verification token provided.')
      setLoading(false)
      return
    }

    authVerifyEmail({ token })
      .then(() => {
        setVerified(true)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message || 'Verification failed.')
        setLoading(false)
      })
  }, [token, authVerifyEmail])

  const handleResend = async () => {
    setResendLoading(true)
    try {
      await authResendVerification()
      setResendLoading(false)
    } catch (err) {
      setError(err.message || 'Failed to resend verification email.')
      setResendLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-md mx-auto py-24">
        <div className="text-center">
          <h2 className="text-2xl font-heading font-bold text-tafera-text">
            Verifying email...
          </h2>
          <p className="mt-2 text-tafera-text-muted">
            Please wait while we verify your email address.
          </p>
        </div>
      </div>
    )
  }

  if (verified) {
    return (
      <div className="max-w-md mx-auto py-24">
        <div className="text-center">
          <h2 className="text-2xl font-heading font-bold text-tafera-text">
            Email verified!
          </h2>
          <p className="mt-2 text-tafera-text-muted">
            Your email address has been verified. You can now access all features.
          </p>
          <div className="mt-6 flex justify-center">
            <Link asChild to="/">
              <Button variant="primary">Go to home</Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto py-24">
      <div className="text-center">
        <h2 className="text-2xl font-heading font-bold text-tafera-text">
          Verify email
        </h2>

        {error && (
          <div className="mb-6 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {!error && (
          <p className="mt-2 text-tafera-text-muted">
            Couldn't verify your email address. The link may be invalid or
            expired.
          </p>
        )}

        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          {isAuthenticated ? (
            <Button
              onClick={handleResend}
              disabled={resendLoading}
              variant="primary"
            >
              {resendLoading ? 'Sending...' : 'Resend verification email'}
            </Button>
          ) : (
            <Link asChild to="/login" className="w-full sm:w-auto">
              <Button variant="ghost">Sign in</Button>
            </Link>
          )}
          <Link asChild to="/">
            <Button variant="ghost">Back to home</Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
