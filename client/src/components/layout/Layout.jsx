import { Outlet } from 'react-router-dom'
import Header from './Header'
import Footer from './Footer'

export default function Layout() {
  return (
    <div className="flex min-h-svh flex-col">
      <Header />
      <main className="flex-1 pt-8 pb-12 w-full">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
