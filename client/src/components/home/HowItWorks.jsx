import { Link } from 'react-router-dom'

const STEPS = [
  {
    number: 1,
    title: 'Discover',
    description: 'Explore destinations and find travel inspiration.',
  },
  {
    number: 2,
    title: 'Connect',
    description: 'Find fellow travellers and engage with the community.',
  },
  {
    number: 3,
    title: 'Go Together',
    description: 'Create or join a trip and experience new places with others.',
  },
]

export default function HowItWorks() {
  return (
    <section
      className="border-t border-tafera-border bg-tafera-bg py-10 sm:py-20 transition-colors"
      aria-labelledby="how-it-works-heading"
    >
      <div className="app-container">
        <div className="mx-auto mb-8 sm:mb-12 max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-tafera-primary">
            Simple from start to finish
          </p>
          <h2
            id="how-it-works-heading"
            className="mt-2 font-heading text-2xl font-bold text-tafera-text sm:text-3xl lg:text-4xl"
          >
            How it works
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {STEPS.map((step) => (
            <div
              key={step.number}
              className="rounded-xl border border-tafera-border bg-tafera-card p-6 shadow-soft"
            >
              <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-tafera-accent font-heading text-base font-bold text-tafera-on-accent">
                {step.number}
              </span>
              <h3 className="font-heading text-lg font-bold text-tafera-text">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-tafera-text-muted">
                {step.description}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <p className="mb-3 text-sm text-tafera-text-muted">
            Ready to start? Create your account and begin your journey.
          </p>
          <Link
            to="/register"
            className="inline-block text-sm font-semibold text-tafera-primary hover:underline"
          >
            Sign up →
          </Link>
        </div>
      </div>
    </section>
  )
}
