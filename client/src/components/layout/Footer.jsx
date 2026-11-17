import { Link } from 'react-router-dom'

const DESTINATION_LINKS = [
  { to: '/destinations', label: 'Destinations' },
  { to: '/trips', label: 'Trips' },
  { to: '/group-travel', label: 'Group Travel' },
  { to: '/social', label: 'Social Feed' },
  { to: '/scrapbooks', label: 'Scrapbooks' },
]

const COMPANY_LINKS = [
  { to: '/trust-and-safety', label: 'Trust and Safety' },
]

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-tafera-border bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 py-8">
          <div className="flex flex-col md:flex-row items-center gap-4 text-tafera-text font-medium">
            <div className="flex items-center gap-3">
              <img src="/Tafera logo.svg" alt="Tafera" width="32" height="32" />
              <span>Tafera</span>
            </div>
            <p className="text-xs">
              © {new Date().getFullYear()} Tafera. Travel-focused social platform.
            </p>
          </div>
          <nav className="flex flex-col md:flex-row gap-8">
            <div>
              <h4 className="text-xs font-heading font-bold text-tafera-text uppercase tracking-wider mb-4">
                Explore
              </h4>
              <ul className="space-y-2">
                {DESTINATION_LINKS.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="text-sm text-tafera-text-muted transition-colors hover:text-tafera-accent"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-heading font-bold text-tafera-text uppercase tracking-wider mb-4">
                Company
              </h4>
              <ul className="space-y-2">
                {COMPANY_LINKS.map((link) => (
                  <li key={link.to}>
                    <Link
                      to={link.to}
                      className="text-sm text-tafera-text-muted transition-colors hover:text-tafera-accent"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
                <li>
                  <a
                    href="#"
                    className="text-sm text-tafera-text-muted hover:text-tafera-accent"
                  >
                    About Tafera
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="text-sm text-tafera-text-muted hover:text-tafera-accent"
                  >
                    Support
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-heading font-bold text-tafera-text uppercase tracking-wider mb-4">
                Legal
              </h4>
              <ul className="space-y-2">
                <li>
                  <a
                    href="#"
                    className="text-sm text-tafera-text-muted hover:text-tafera-accent"
                  >
                    Privacy policy
                  </a>
                </li>
                <li>
                  <a
                    href="#"
                    className="text-sm text-tafera-text-muted hover:text-tafera-accent"
                  >
                    Terms and conditions
                  </a>
                </li>
              </ul>
            </div>
          </nav>
        </div>
      </div>
    </footer>
  )
}
