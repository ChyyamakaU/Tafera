import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
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
  const navigate = useNavigate()

  const handleSearch = (event) => {
    event.preventDefault()
    const input = event.currentTarget.elements.namedItem('destination')
    const query = input ? input.value.trim() : ''
    if (query) {
      navigate(`/destinations?q=${encodeURIComponent(query)}`)
    } else {
      navigate('/destinations')
    }
  }

  return (
    <div className="space-y-0">
      {/* Hero */}
      <section className="relative bg-tafera-surface min-h-[600px]">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:flex lg:items-center lg:gap-12 py-16 sm:py-24 lg:py-32">
            {/* Left side: messaging and search */}
            <div className="lg:w-1/2 lg:max-w-lg relative z-10">
              <span className="inline-flex items-center gap-1 rounded-md bg-tafera-accent px-3 py-1 text-xs font-nav font-semibold text-white uppercase tracking-wider">
                EXPLORE BEYOND THE FAMILIAR.
              </span>
              <h1 className="mt-4 text-4xl sm:text-5xl font-heading font-bold text-tafera-text leading-tight">
                Discover places.<br />
                Find your people.<br />
                Make memories.
              </h1>
              <p className="mt-6 text-lg sm:text-xl text-tafera-text-muted max-w-lg leading-relaxed">
                Find places worth exploring, connect with fellow travellers,
                get inspired by real experiences and make memories along the
                way.
              </p>
              <form onSubmit={handleSearch} className="mt-10 flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <input
                    type="text"
                    name="destination"
                    placeholder="Where do you want to explore?"
                    className="w-full px-4 py-3 rounded-md border border-tafera-border text-tafera-text focus:outline-none focus:ring-2 focus:ring-tafera-primary transition-colors sm:text-base pr-10"
                  />
                  <button
                    type="submit"
                    className="absolute right-2 top-2 bottom-2 rounded-md bg-tafera-surface border border-tafera-border border-l-0 px-3 text-tafera-text-muted hover:text-tafera-accent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-tafera-primary"
                    aria-label="Search"
                  >
                    <svg
                      className="w-5 h-5"
                      viewBox="0 0 24 24"
                      strokeWidth="1.5"
                      stroke="currentColor"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </button>
                </div>
              </form>
              <div className="mt-8">
                <Link to="/destinations">
                  <Button variant="primary" size="lg" className="w-full sm:w-auto">
                    Explore Destinations
                  </Button>
                </Link>
              </div>
            </div>

            {/* Right side: travel photography */}
            <div className="lg:w-1/2 lg:max-w-lg mt-12 lg:mt-0 lg:pl-12 relative overflow-hidden rounded-lg border border-tafera-border">
              <img
                src="https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80"
                alt="Travellers discovering a mountain landscape"
                className="w-full max-h-[450px] object-cover"
                loading="lazy"
              />
            </div>
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
              <li key={feature.title} className="group relative">
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
