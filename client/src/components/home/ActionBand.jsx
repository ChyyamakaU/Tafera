import { useState } from 'react'
import { Link } from 'react-router-dom'
import AuthModal from './AuthModal'

export default function ActionBand({ isAuthenticated = false }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState(null)

  const openModal = (action, actionLabel, entityType, entityName) => {
    setPendingAction({ action, actionLabel, entityType, entityName })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setPendingAction(null)
  }

  return (
    <>
      <section className="border-t border-tafera-border bg-tafera-surface py-12 sm:py-16 transition-colors">
        <div className="app-container">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="mb-3 sm:mb-4 font-heading text-2xl font-bold text-tafera-text sm:text-3xl lg:text-4xl">
              Ready to share your journey?
            </h2>
            <p className="mx-auto mb-8 sm:mb-10 max-w-xl text-sm sm:text-base leading-relaxed text-tafera-text-muted">
              Whether you're writing about a place you've been or planning your
              next trip, Tafera is where your travel stories belong.
            </p>
            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              {!isAuthenticated ? (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      openModal('create_story', 'share your story', 'story', null)
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-tafera-accent px-5 py-3 text-sm font-semibold text-tafera-on-accent transition-colors hover:bg-tafera-accent/90 sm:text-base"
                  >
                    Share your story
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      openModal('create_trip', 'create a trip', 'trip', null)
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-tafera-border bg-tafera-card px-5 py-3 text-sm font-semibold text-tafera-text transition-colors hover:bg-tafera-bg sm:text-base"
                  >
                    Create a trip
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/stories/new"
                    className="inline-flex items-center justify-center gap-2 rounded-md bg-tafera-accent px-5 py-3 text-sm font-semibold text-tafera-on-accent transition-colors hover:bg-tafera-accent/90 sm:text-base"
                  >
                    Share a Story
                  </Link>
                  <Link
                    to="/trips/new"
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-tafera-border bg-tafera-card px-5 py-3 text-sm font-semibold text-tafera-text transition-colors hover:bg-tafera-bg sm:text-base"
                  >
                    Create a Trip
                  </Link>
                </>
              )}
            </div>
            {!isAuthenticated && (
              <p className="mt-6 text-xs text-tafera-text-muted">
                Creating stories and trips requires an account. Log in or sign up to get started.
              </p>
            )}
          </div>
        </div>
      </section>
      <AuthModal
        isOpen={modalOpen}
        onClose={closeModal}
        action={pendingAction?.action}
        actionLabel={pendingAction?.actionLabel}
        entityType={pendingAction?.entityType}
        entityName={pendingAction?.entityName}
      />
    </>
  )
}
