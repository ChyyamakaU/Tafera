import { useEffect, useState } from 'react'
import { checkAuth } from '../services/auth'
import Hero from '../components/home/Hero'
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

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    checkAuth().then(({ isAuthenticated }) => {
      setIsAuthenticated(isAuthenticated)
      setAuthChecked(true)
    })
  }, [])

  return (
    <div className="space-y-0">
      <Hero />
      <TrustStrip />
      <FeaturedDestinations />
      <DiscoveryFilters />
      <TravellerStories />
      <UpcomingTrips />
      <PracticalGuides />
      <HowItWorks />
      <CommunitySpotlight />
      <TrustAndSafety />
      <ComingSoon />
      <ActionBand isAuthenticated={isAuthenticated} />
    </div>
  )
}
