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
    <section className="relative bg-tafera-bg">
      <div className="app-container relative">
        <div
          className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 py-3 sm:py-6 lg:py-8 items-start lg:items-center"
        >
          {/* Left column — tagline, headline, description, CTA */}
          <div className="min-w-0 lg:col-span-6">
            <span className="mb-3 inline-flex items-center gap-1 rounded-md bg-tafera-accent px-3 py-1 text-[11px] sm:text-xs font-nav font-semibold text-tafera-on-accent uppercase tracking-wider">
              EXPLORE BEYOND THE FAMILIAR.
            </span>
            <h1 className="mt-0 mb-4 sm:mb-6 text-[clamp(1.75rem,7.2vw,2.5rem)] sm:text-5xl lg:text-6xl font-heading font-bold text-tafera-text leading-[1.12]">
              Discover places. Find your people. Make memories.
            </h1>
            <p className="mb-6 sm:mb-8 text-base sm:text-lg lg:text-xl text-tafera-text-muted max-w-lg leading-relaxed">
              Find places worth exploring, connect with fellow travellers,
              get inspired by real experiences and make memories along the
              way.
            </p>

            {/* Retained destination search — navigates to /destinations with query */}
            <form
              onSubmit={handleSearch}
              className="mb-6 sm:mb-8 flex flex-col sm:flex-row gap-3 w-full max-w-lg"
            >
              <div className="relative flex-1 min-w-0">
                <input
                  type="text"
                  name="destination"
                  placeholder="Where do you want to explore?"
                  className="w-full px-3.5 py-3 rounded-md border border-tafera-border bg-tafera-card text-sm sm:text-base text-tafera-text placeholder:text-tafera-text-muted focus:outline-none focus:ring-2 focus:ring-tafera-primary transition-colors pr-12"
                />
                <button
                  type="submit"
                  className="absolute right-2 top-2 bottom-2 rounded-md bg-tafera-surface border border-tafera-border px-2.5 text-tafera-text hover:text-tafera-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-tafera-primary"
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

            <Link to="/destinations" className="block sm:inline-block">
              <Button variant="accent" size="lg" className="w-full sm:w-auto">
                Explore Destinations
              </Button>
            </Link>
          </div>

          {/* Right column — destination photography */}
          <div className="lg:col-span-6 relative overflow-hidden rounded-md border border-tafera-border">
            <img
              src="/hero%20tafera.jpeg"
              alt="Nigerian destination landscape"
              className="w-full h-[240px] sm:h-[400px] lg:h-[560px] object-cover"
              loading="lazy"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
