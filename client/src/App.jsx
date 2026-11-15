import { Routes, Route } from 'react-router-dom'

import Layout from './components/layout/Layout'
import Home from './pages/Home'
import Destinations from './pages/Destinations'
import Trips from './pages/Trips'
import GroupTravel from './pages/GroupTravel'
import SocialFeed from './pages/SocialFeed'
import Scrapbooks from './pages/Scrapbooks'
import Login from './pages/Login'
import Registration from './pages/Registration'
import Admin from './pages/Admin'
import NotFound from './pages/NotFound'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="destinations" element={<Destinations />} />
        <Route path="trips" element={<Trips />} />
        <Route path="group-travel" element={<GroupTravel />} />
        <Route path="social" element={<SocialFeed />} />
        <Route path="scrapbooks" element={<Scrapbooks />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Registration />} />
        <Route path="admin" element={<Admin />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

export default App
