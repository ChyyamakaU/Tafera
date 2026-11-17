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
      <section className="py-16 border-t border-tafera-border bg-tafera-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h2 className="text-3xl font-heading font-bold text-tafera-text sm:text-4xl mb-4">
              Ready to share your journey?
            </h2>
            <p className="text-tafera-text-muted mb-10 max-w-xl mx-auto leading-relaxed">
              Whether you're writing about a place you've been or planning your
              next trip, Tafera is where your travel stories belong.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {!isAuthenticated ? (
                <>
                  <button
                    onClick={() =>
                      openModal('create_story', 'share your story', 'story', null)
                    }
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-md bg-tafera-accent text-white font-semibold text-sm transition-colors hover:bg-tafera-accent/90 sm:text-base"
                  >
                    Share your story
                  </button>
                  <button
                    onClick={() =>
                      openModal('create_trip', 'create a trip', 'trip', null)
                    }
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-md border border-tafera-border bg-tafera-bg text-tafera-text font-semibold text-sm transition-colors hover:bg-tafera-surface sm:text-base"
                  >
                    Create a trip
                  </button>
                </>
              ) : (
                <>
                  <Link to="/stories/new">
                    <span className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-md bg-tafera-accent text-white font-semibold transition-colors hover:bg-tafera-accent/90 sm:text-base">
                      Share a Story
                    </span>
                  </Link>
                  <Link to="/trips/new">
                    <span className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-md border border-tafera-border bg-tafera-bg text-tafera-text font-semibold transition-colors hover:bg-tafera-surface sm:text-base">
                      Create a Trip
                    </span>
                  </Link>
                </>
              )}
              <p className="mt-6 text-xs text-tafera-text-muted">
                {!isAuthenticated
                  ? 'Creating stories and trips requires an account. Log in or sign up to get started.'
                  : ''}
              </p>
            </div>
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
