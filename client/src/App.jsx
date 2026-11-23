import { Routes, Route } from 'react-router-dom'

import Layout from './components/layout/Layout'
import HomeRoute from './components/auth/HomeRoute'
import Destinations from './pages/Destinations'
import Trips from './pages/Trips'
import GroupTravel from './pages/GroupTravel'
import SocialFeed from './pages/SocialFeed'
import TripDetail from './pages/TripDetail'
import DestinationDetail from './pages/DestinationDetail'
import MyDestinations from './pages/MyDestinations'
import MyDestinationDetail from './pages/MyDestinationDetail'
import Scrapbooks from './pages/Scrapbooks'
import Login from './pages/Login'
import Registration from './pages/Registration'
import VerifyEmail from './pages/VerifyEmail'
import Profile from './pages/Profile'
import PublicProfile from './pages/PublicProfile'
import FollowList from './pages/FollowList'
import Admin from './pages/Admin'
import Notifications from './pages/Notifications'
import NotFound from './pages/NotFound'
import { RequireAdmin } from './components/auth/RequireAuth'
import { RequireVerifiedEmail } from './components/auth/RequireVerifiedEmail'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<HomeRoute />} />
        <Route path="destinations" element={<Destinations />} />
        <Route path="trips" element={<RequireVerifiedEmail><Trips /></RequireVerifiedEmail>} />
        <Route path="trips/:tripId" element={<RequireVerifiedEmail><TripDetail /></RequireVerifiedEmail>} />
        <Route path="destinations/:slug" element={<DestinationDetail />} />
        <Route path="my-destinations" element={<RequireVerifiedEmail><MyDestinations /></RequireVerifiedEmail>} />
        <Route path="my-destinations/:slug" element={<RequireVerifiedEmail><MyDestinationDetail /></RequireVerifiedEmail>} />
        <Route path="group-travel" element={<RequireVerifiedEmail><GroupTravel /></RequireVerifiedEmail>} />
        <Route path="social" element={<RequireVerifiedEmail><SocialFeed /></RequireVerifiedEmail>} />
        <Route path="scrapbooks" element={<RequireVerifiedEmail><Scrapbooks /></RequireVerifiedEmail>} />
        <Route path="notifications" element={<RequireVerifiedEmail><Notifications /></RequireVerifiedEmail>} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Registration />} />
        <Route path="verify-email" element={<VerifyEmail />} />
        <Route path="profile" element={<RequireVerifiedEmail><Profile /></RequireVerifiedEmail>} />
        <Route path="users/:userId" element={<PublicProfile />} />
        <Route path="users/:userId/followers" element={<FollowList />} />
        <Route path="users/:userId/following" element={<FollowList />} />
        <Route path="admin" element={<RequireVerifiedEmail><RequireAdmin><Admin /></RequireAdmin></RequireVerifiedEmail>} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
