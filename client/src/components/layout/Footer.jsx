import { Link } from 'react-router-dom'

const FOOTER_LINKS = [
  { to: '/about', label: 'About' },
  { to: '/trust-and-safety', label: 'Trust and Safety' },
  { to: '/privacy', label: 'Privacy' },
  { to: '/contact', label: 'Contact' },
  { to: '/social', label: 'Socials' },
]

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-tafera-border bg-white">
      <div className="app-container">
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
            <ul className="space-y-2 md:space-y-0 md:flex md:flex-row md:gap-6">
              {FOOTER_LINKS.map((link) => (
                <li key={link.to}>
                  <a
                    href={link.to.startsWith('/') ? '#' : link.to}
                    className="text-sm text-tafera-text-muted transition-colors hover:text-tafera-accent"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  )
}
