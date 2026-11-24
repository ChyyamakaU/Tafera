export default function TravelManifesto() {
  return (
    <section
      className="border-y border-tafera-border bg-tafera-surface py-12 sm:py-24 transition-colors"
      aria-labelledby="travel-manifesto-heading"
    >
      <div className="app-container">
        <div className="mx-auto max-w-3xl text-center">
          <span
            aria-hidden="true"
            className="inline-block h-1 w-12 rounded-full bg-tafera-accent mb-5 sm:mb-6"
          />
          <h2
            id="travel-manifesto-heading"
            className="font-heading text-2xl font-bold tracking-tight text-tafera-text sm:text-4xl lg:text-5xl leading-[1.15]"
          >
            It’s not just{' '}
            <em className="font-body italic font-medium text-tafera-primary">
              where you go.
            </em>{' '}
            <span className="block mt-1">It’s who you go with.</span>
          </h2>
          <p className="mx-auto mt-4 sm:mt-6 max-w-xl text-sm sm:text-base lg:text-lg leading-relaxed text-tafera-text-muted">
            Travel feels different when you can share the experience — even if
            you’ve never met before.
          </p>
        </div>
      </div>
    </section>
  )
}
