import { Link } from 'react-router-dom'
import { Button } from '../components/common/Button'

const FEATURES = [
  {
    title: 'Discover destinations',
    description:
      'Explore curated travel destinations and plan your next adventure.',
    href: '/destinations',
  },
  {
    title: 'Plan your trips',
    description:
      'Organise itineraries, dates, and travel details in one place.',
    href: '/trips',
  },
  {
    title: 'Travel with others',
    description:
      'Join group trips and coordinate with fellow travellers.',
    href: '/group-travel',
  },
  {
    title: 'Keep a scrapbook',
    description:
      'Collect photos and memories from every journey.',
    href: '/scrapbooks',
  },
]

export default function Home() {
  return (
    <div className="space-y-0">
      {/* Hero — photography-led */}
      <section className="relative bg-tafera-surface">
        <div className="relative h-[600px] sm:h-[700px] lg:h-[800px] overflow-hidden">
          <img
            src="https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?ixlib=rb-4.0.3&auto=format&fit=crop&w=1600&q=80"
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/40" />
          <div className="absolute inset-0 flex items-center justify-center px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl text-center">
              <span className="inline-flex items-center gap-2 rounded-md bg-tafera-accent px-3 py-1 text-xs font-semibold text-white uppercase tracking-wider">
                Tafera
              </span>
              <h1 className="mt-6 text-4xl sm:text-6xl font-heading font-bold text-white tracking-tight leading-tight">
                Explore Beyond the Familiar.
              </h1>
              <p className="mt-6 text-lg sm:text-xl text-white/90 max-w-xl mx-auto leading-relaxed">
                The travel-focused social platform for discovering
                destinations, organising trips, and sharing authentic
                memories with fellow travellers.
              </p>
              <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  to="/destinations"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-md bg-tafera-primary text-white font-semibold text-sm transition-colors hover:bg-tafera-primary/90 sm:text-base"
                >
                  Explore destinations
                </Link>
                <Link
                  to="/register"
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-md border border-white text-white font-semibold text-sm transition-colors hover:bg-white/10 sm:text-base"
                >
                  Create an account
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Destination discovery / search area */}
      <section className="py-16 bg-tafera-bg">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <span className="flex h-1 w-3 rounded-full bg-tafera-accent" />
            <h2 className="text-xl font-heading font-bold text-tafera-text sm:text-2xl">
              Where to next?
            </h2>
          </div>
          <p className="mt-3 text-tafera-text-muted text-center sm:text-left max-w-2xl mx-auto sm:mx-0">
            Browse featured destinations and start planning your journey.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4">
            <input
              type="text"
              placeholder="Search destinations…"
              className="flex-1 px-4 py-3 rounded-md border border-tafera-border text-tafera-text focus:outline-none focus:ring-2 focus:ring-tafera-primary transition-colors sm:text-base"
            />
            <Button variant="primary" className="w-full sm:w-auto">
              Search
            </Button>
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl font-heading font-bold text-tafera-text sm:text-4xl">
              Everything your journey needs
            </h2>
            <p className="mt-4 text-tafera-text-muted max-w-xl mx-auto leading-relaxed">
              From inspiration to memories, Tafera is the place for every part
              of your journey.
            </p>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map((feature) => (
              <li
                key={feature.title}
                className="group relative"
              >
                <div className="aspect-video overflow-hidden rounded-md border border-tafera-border bg-tafera-surface group-hover:border-tafera-accent transition-colors">
                  <img
                    src={`https://images.unsplash.com/photo-${featureImageMap[feature.title]}?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80`}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <div className="mt-4">
                  <h3 className="text-lg font-heading font-bold text-tafera-text group-hover:text-tafera-accent transition-colors">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm text-tafera-text-muted leading-relaxed">
                    {feature.description}
                  </p>
                  <Link
                    to={feature.href}
                    className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-tafera-primary hover:underline"
                  >
                    Learn more <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-tafera-surface border-t border-tafera-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-heading font-bold text-tafera-text sm:text-4xl">
            Ready to start your journey?
          </h2>
          <p className="mt-4 text-tafera-text-muted leading-relaxed">
            Join Tafera and start discovering destinations, planning trips, and
            sharing your travel stories with the community.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Button variant="primary" className="px-6 py-2.5 text-base">
              Create an account
            </Button>
            <Link
              to="/login"
              className="px-5 py-2.5 rounded-md border border-tafera-border bg-tafera-bg text-tafera-text font-semibold text-sm transition-colors hover:bg-tafera-surface sm:text-base"
            >
              Log in
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

// Unsplash image IDs for each feature section
const featureImageMap = {
  'Discover destinations': '1501785888041-af3ef285b470',
  'Plan your trips': '1469854523086-cc02fe5d8800',
  'Travel with others': '1529275600612-0c3902f1734f',
  'Keep a scrapbook': '1464822759023-fed622ff2c3b',
}
