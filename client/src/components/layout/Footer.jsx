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
          <div className="flex items-center gap-2 text-tafera-text font-medium">
            <svg
              className="w-5 h-5"
              viewBox="0 0 32 32"
              fill="none"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="16" cy="16" r="13" stroke="var(--color-tafera-primary)" stroke-width="2.5" fill="none" />
              <path
                d="M4 20 Q16 25 28 20"
                stroke="var(--color-tafera-secondary)"
                stroke-width="2.5"
                fill="none"
              />
              <path
                d="M16 9 L10 18 L22 18 Z"
                fill="var(--color-tafera-primary)"
              />
            </svg>
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
                className="font-medium transition-colors hover:text-tafera-primary"
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
