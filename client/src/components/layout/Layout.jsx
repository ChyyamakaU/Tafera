import { Outlet } from 'react-router-dom'
import Header from './Header'
import Footer from './Footer'
import { useAuth } from '../../contexts/AuthContext'

export default function Layout() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
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
