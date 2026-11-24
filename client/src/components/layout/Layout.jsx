import { Outlet } from 'react-router-dom'
import Header from './Header'
import Footer from './Footer'

export default function Layout() {
  return (
    <div className="flex min-h-svh flex-col overflow-x-clip">
      <Header />
      <main className="flex-1 w-full pt-5 pb-10 sm:pt-8 sm:pb-12">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
