export default function CommunitySpotlight() {
  return (
    <section className="py-16 bg-tafera-surface">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-heading font-bold text-tafera-text sm:text-4xl text-center mb-16">
          Community spotlight
        </h2>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-tafera-text-muted mb-6 max-w-md">
            Top contributors, verified trip organisers and recent travellers
            will be featured here. Community profiles link to individual
            traveller pages where public information is shared.
          </p>
          <p className="text-xs text-tafera-text-muted">
            Community profiles are coming soon as profile discovery is built
            out.
          </p>
        </div>
      </div>
    </section>
  )
}
