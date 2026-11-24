import { Link } from 'react-router-dom'
import { Button } from '../common/Button'

const FEATURES = [
  {
    title: 'Join open group trips',
    description:
      'Browse published journeys led by verified travellers heading to the same places on your list.',
  },
  {
    title: 'Plan day-by-day together',
    description:
      'Follow clear stops, dates, and daily activities before requesting a seat on the trip.',
  },
  {
    title: 'Travel with real accountability',
    description:
      'Organisers review join requests transparently and keep trip capacities clear from the start.',
  },
]

export default function GoTogetherSection() {
  return (
    <section
      className="bg-tafera-bg py-10 sm:py-20 transition-colors"
      aria-labelledby="go-together-heading"
    >
      <div className="app-container">
        <div className="grid grid-cols-1 items-center gap-8 sm:gap-10 lg:grid-cols-12 lg:gap-12">
          {/* Left column — heading, copy, feature list */}
          <div className="min-w-0 lg:col-span-6">
            <span className="inline-flex items-center rounded-full bg-tafera-lime px-3 py-1 text-xs font-semibold uppercase tracking-wider text-tafera-ink">
              Group travel
            </span>
            <h2
              id="go-together-heading"
              className="mt-4 font-heading text-2xl font-bold tracking-tight text-tafera-text sm:text-3xl lg:text-4xl"
            >
              Same dream destination? Let’s go together.
            </h2>
            <p className="mt-3 sm:mt-4 text-sm sm:text-base lg:text-lg leading-relaxed text-tafera-text-muted">
              You don’t have to wait for everyone in your group chat to align
              their calendars. Find people who want to see the same places—and
              turn a wish list into a shared itinerary.
            </p>

            <ul className="mt-7 space-y-4">
              {FEATURES.map((feature) => (
                <li key={feature.title} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-tafera-accent text-tafera-on-accent"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  <div>
                    <h3 className="font-heading text-base font-bold text-tafera-text">
                      {feature.title}
                    </h3>
                    <p className="mt-0.5 text-sm leading-relaxed text-tafera-text-muted">
                      {feature.description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-7 sm:mt-8">
              <Link to="/group-travel" className="block sm:inline-block">
                <Button variant="accent" size="lg" className="w-full sm:w-auto">
                  Explore group trips
                </Button>
              </Link>
            </div>
          </div>

          {/* Right column — travel photography */}
          <div className="lg:col-span-6">
            <div className="overflow-hidden rounded-2xl border border-tafera-border bg-tafera-surface shadow-card">
              <img
                src="/hero%20tafera.jpeg"
                alt="Travellers exploring a scenic destination together"
                className="h-[230px] w-full object-cover sm:h-[360px] lg:h-[440px]"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
