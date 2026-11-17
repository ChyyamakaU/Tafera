import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../common/Button'

export default function Hero() {
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
    <section className="relative bg-tafera-bg px-0 md:px-15">
      <div className="relative px-[15px]">
        <div
          className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 py-4 sm:py-6 lg:py-8 items-start lg:items-center"
        >
          {/* Left column — tagline, headline, description, CTA */}
          <div className="lg:col-span-6">
            <span className="inline-flex items-center gap-1 rounded-md bg-tafera-accent px-3 py-1 text-xs font-nav font-semibold text-white uppercase tracking-wider mb-3 block">
              EXPLORE BEYOND THE FAMILIAR.
            </span>
            <h1 className="mt-0 mb-6 text-4xl sm:text-5xl lg:text-6xl font-nav font-semibold text-tafera-text leading-tight">
              Discover places. Find your people. Make memories.
            </h1>
            <p className="mb-8 text-lg sm:text-xl text-tafera-text-muted max-w-lg leading-relaxed">
              Find places worth exploring, connect with fellow travellers,
              get inspired by real experiences and make memories along the
              way.
            </p>

            {/* Retained destination search — navigates to /destinations with query */}
            <form
              onSubmit={handleSearch}
              className="mb-8 flex flex-col sm:flex-row gap-3 w-full sm:w-auto max-w-lg"
            >
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

            <Link to="/destinations">
              <Button variant="accent" size="lg" className="w-full sm:w-auto">
                Explore Destinations
              </Button>
            </Link>
          </div>

          {/* Right column — destination photography */}
          <div className="lg:col-span-6 relative overflow-hidden rounded-md border border-tafera-border">
            <img
              src="https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80"
              alt="Nigerian destination landscape"
              className="w-full h-[360px] sm:h-[420px] lg:h-[560px] object-cover"
              loading="lazy"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
