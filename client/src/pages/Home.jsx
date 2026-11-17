import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../components/common/Button'
import TrustStrip from '../components/home/TrustStrip'
import FeaturedDestinations from '../components/home/FeaturedDestinations'
import TravellerStories from '../components/home/TravellerStories'
import UpcomingTrips from '../components/home/UpcomingTrips'
import DiscoveryFilters from '../components/home/DiscoveryFilters'
import HowItWorks from '../components/home/HowItWorks'
import PracticalGuides from '../components/home/PracticalGuides'
import CommunitySpotlight from '../components/home/CommunitySpotlight'
import TrustAndSafety from '../components/home/TrustAndSafety'
import ComingSoon from '../components/home/ComingSoon'
import ActionBand from '../components/home/ActionBand'
import { checkAuth } from '../services/auth'

export default function Home() {
  const navigate = useNavigate()
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    checkAuth().then(({ isAuthenticated }) => {
      setIsAuthenticated(isAuthenticated)
      setAuthChecked(true)
    })
  }, [])

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
                {!isAuthenticated ? (
                  <button
                    onClick={() => {
                      window.location.href = '/register'
                    }}
                    className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-md bg-tafera-accent text-white font-semibold transition-colors hover:bg-tafera-accent/90 sm:text-base w-full sm:w-auto"
                  >
                    Explore Destinations
                  </button>
                ) : (
                  <Link to="/destinations">
                    <Button variant="primary" size="lg" className="w-full sm:w-auto">
                      Explore Destinations
                    </Button>
                  </Link>
                )}
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

      {/* Trust strip */}
      <TrustStrip />

      {/* Featured destinations */}
      <FeaturedDestinations />

      {/* Discovery filters */}
      <DiscoveryFilters />

      {/* Traveller stories */}
      <TravellerStories />

      {/* Upcoming trips */}
      <UpcomingTrips />

      {/* Practical guides */}
      <PracticalGuides />

      {/* How it works */}
      <HowItWorks />

      {/* Community spotlight */}
      <CommunitySpotlight />

      {/* Trust and safety */}
      <TrustAndSafety />

      {/* Coming soon */}
      <ComingSoon />

      {/* Action band */}
      <ActionBand isAuthenticated={isAuthenticated} />
    </div>
  )
}
