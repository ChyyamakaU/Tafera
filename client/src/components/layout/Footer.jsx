import { Link } from 'react-router-dom'

const FOOTER_LINKS = [
  { to: '/destinations', label: 'Destinations' },
  { to: '/trips', label: 'Trips' },
  { to: '/group-travel', label: 'Group Travel' },
  { to: '/social', label: 'Social Feed' },
  { to: '/scrapbooks', label: 'Scrapbooks' },
]

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-tafera-border bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 py-8 text-sm text-tafera-text-muted">
          <div className="flex items-center gap-3 text-tafera-text font-medium">
            <img src="/Tafera logo.svg" alt="Tafera" width="32" height="32" />
            <span>Tafera</span>
          </div>
          <p className="text-xs">
            © {new Date().getFullYear()} Tafera. Travel-focused social platform.
          </p>
          <nav className="flex items-center gap-6">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="font-medium transition-colors hover:text-tafera-accent"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  )
}
