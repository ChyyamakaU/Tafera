import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Header from './Header'
import Footer from './Footer'
import { checkAuth } from '../../services/auth.js'

export default function Layout() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    checkAuth().then(({ isAuthenticated }) => {
      setIsAuthenticated(isAuthenticated)
      setAuthChecked(true)
    })
  }, [])

  if (!authChecked) {
    return (
      <div className="flex min-h-svh flex-col">
        <Header isAuthenticated={false} />
        <main className="flex-1 pt-8 pb-12 w-full">
          <Outlet />
        </main>
        <Footer />
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col">
      <Header isAuthenticated={isAuthenticated} />
      <main className="flex-1 pt-8 pb-12 w-full">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
