import { useEffect, useState } from 'react'
import { checkAuth } from '../services/auth'
import Hero from '../components/home/Hero'
import FeaturedDestinations from '../components/home/FeaturedDestinations'
import TravellerStories from '../components/home/TravellerStories'
import UpcomingTrips from '../components/home/UpcomingTrips'
import HowItWorks from '../components/home/HowItWorks'
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
      <FeaturedDestinations />
      <TravellerStories />
      <UpcomingTrips />
      <HowItWorks />
      <ActionBand isAuthenticated={isAuthenticated} />
    </div>
  )
}
