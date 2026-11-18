import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { setPendingAction } from '../../services/auth'

export default function SignInModal({
  isOpen,
  onClose,
  action,
  actionLabel,
  entityType,
  entityName,
}) {
  const [isMounted, setIsMounted] = useState(false)
  const navigate = useNavigate()

  // Animate in after mount so the modal doesn't flash open
  useState(() => {
    setIsMounted(true)
  })

  const handleClose = () => {
    onClose()
  }

  const handleSignIn = () => {
    if (isMounted) {
      setPendingAction(
        { action, entityType, entityName },
        window.location.pathname,
      )
      navigate('/login')
    }
  }

  const handleRegister = () => {
    if (isMounted) {
      setPendingAction(
        { action, entityType, entityName },
        window.location.pathname,
      )
      navigate('/register')
    }
  }

  return (
    <>
      {isOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
            onClick={handleClose}
            aria-hidden="true"
          />
          <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="signin-modal-title"
          >
            <div
              className="relative w-full max-w-md mx-4 sm:mx-6 lg:mx-8"
            >
              <div className="bg-white rounded-lg border border-tafera-border p-6 shadow-lg">
                <div className="flex items-start justify-between mb-4">
                  <h2 id="signin-modal-title" className="text-lg font-heading font-bold text-tafera-text">
                    Sign in to {actionLabel}
                  </h2>
                  <button
                    onClick={handleClose}
                    className="rounded-md text-tafera-text-muted hover:text-tafera-text transition-colors focus:outline-none"
                    aria-label="Close"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth="1.5"
                      stroke="currentColor"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
                <p className="text-sm text-tafera-text-muted mb-6">
                  {action === 'join' &&
                    `Sign in to request to join this trip. The organiser reviews every request.`}
                  {action === 'create_trip' &&
                    `Sign in to create a trip. You will need Verified Organiser status before the trip can be published.`}
                  {action === 'create_story' &&
                    `Sign in to share your story with the Tafera community.`}
                  {action === 'interact' &&
                    `Sign in to like, comment, save or follow.`}
                </p>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={handleSignIn}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-tafera-primary text-white font-medium text-sm transition-colors hover:bg-tafera-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-tafera-primary"
                  >
                    Sign in
                  </button>
                  <button
                    onClick={handleRegister}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md border border-tafera-border bg-tafera-bg text-tafera-text font-medium text-sm transition-colors hover:bg-tafera-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-tafera-primary"
                  >
                    Create an account
                  </button>
                </div>
                <p className="mt-6 text-xs text-tafera-text-muted text-center">
                  Already have an account?{' '}
                  <button
                    onClick={handleSignIn}
                    className="font-medium text-tafera-primary hover:underline"
                  >
                    Sign in here
                  </button>
                </p>
                <p className="mt-4 text-xs text-tafera-text-muted text-center max-w-md mx-auto leading-relaxed">
                  Signing in requires a session cookie. After you sign in, you
                  will be returned to this page so you can complete your action.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
