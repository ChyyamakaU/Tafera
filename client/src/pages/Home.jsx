import { useAuth } from '../contexts/AuthContext'
import Hero from '../components/home/Hero'
import DestinationDiscoveryCarousel from '../components/home/DestinationDiscoveryCarousel'
import TravelManifesto from '../components/home/TravelManifesto'
import TravellerStories from '../components/home/TravellerStories'
import GoTogetherSection from '../components/home/GoTogetherSection'
import UpcomingTrips from '../components/home/UpcomingTrips'
import HowItWorks from '../components/home/HowItWorks'
import WhyWeExist from '../components/home/WhyWeExist'
import ActionBand from '../components/home/ActionBand'

export default function Home() {
  const { isAuthenticated } = useAuth()

  return (
    <div className="space-y-0">
      <Hero />
      <DestinationDiscoveryCarousel />
      <TravelManifesto />
      <TravellerStories />
      <GoTogetherSection />
      <UpcomingTrips />
      <HowItWorks />
      <WhyWeExist />
      <ActionBand isAuthenticated={isAuthenticated} />
    </div>
  )
}
