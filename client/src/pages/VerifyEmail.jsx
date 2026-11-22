import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/common/Button'
import { getErrorMessage } from '../services/errors'

export default function VerifyEmail() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [verified, setVerified] = useState(false)
  const [resendLoading, setResendLoading] = useState(false)
  const [redirecting, setRedirecting] = useState(false)
  const [resendMessage, setResendMessage] = useState(null)
  const verificationAttempted = useRef(null)
  const {
    verifyEmail: authVerifyEmail,
    resendVerification: authResendVerification,
    isAuthenticated,
    isEmailVerified,
    isLoading: authIsLoading,
  } = useAuth()
  const navigate = useNavigate()

  const searchParams = new URLSearchParams(window.location.search)
  const token = searchParams.get('token')

  useEffect(() => {
    if (!token) {
      setError('No verification token provided.')
      setLoading(false)
      return
    }

    if (verificationAttempted.current === token) return
    verificationAttempted.current = token
    setLoading(true)
    setError(null)

    authVerifyEmail({ token })
      .then(() => {
        setVerified(true)
        setLoading(false)
      })
      .catch((err) => {
        setError(getErrorMessage(err))
        setLoading(false)
      })
    // The token defines the request. AuthProvider recreates its wrapper methods
    // on render, so including authVerifyEmail here would resubmit the token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // An already-verified account has nothing to verify. Send it home instead of
  // leaving it on the verification page. This only applies when there is no
  // pending token to verify, so the normal email-link verification flow still
  // shows its success screen. The redirect runs in an effect (not during
  // render) so the rules of hooks are never violated.
  useEffect(() => {
    if (!authIsLoading && isAuthenticated && isEmailVerified && !token) {
      setRedirecting(true)
    }
  }, [authIsLoading, isAuthenticated, isEmailVerified, token])

  useEffect(() => {
    if (redirecting) {
      navigate('/')
    }
  }, [redirecting, navigate])

  if (redirecting) {
    return null
  }

  const handleResend = async () => {
    setResendLoading(true)
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
      setResendMessage({ type: 'error', text: getErrorMessage(err) })
    } finally {
      setResendLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="app-container max-w-md mx-auto py-24">
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
      <div className="app-container max-w-md mx-auto py-24">
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
    <div className="app-container max-w-md mx-auto py-24">
      <div className="text-center">
        <h2 className="text-2xl font-heading font-bold text-tafera-text">
          Verify email
        </h2>

        {error && (
          <div className="mb-6 p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {resendMessage && (
          <div
            role={resendMessage.type === 'success' ? 'status' : 'alert'}
            className={`mb-6 p-3 rounded-md border text-sm ${resendMessage.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}
          >
            {resendMessage.text}
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
