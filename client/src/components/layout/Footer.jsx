const FOOTER_LINKS = [
  { to: '/about', label: 'About' },
  { to: '/trust-and-safety', label: 'Trust and Safety' },
  { to: '/privacy', label: 'Privacy' },
  { to: '/contact', label: 'Contact' },
  { to: '/social', label: 'Socials' },
]

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-tafera-border bg-tafera-surface transition-colors">
      <div className="app-container">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 py-8">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-3 md:gap-4 text-tafera-text font-medium">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <img src="/Tafera logo.svg" alt="Tafera" width="32" height="32" />
              <span className="font-heading font-bold tracking-tight">Tafera</span>
            </div>
            <p className="text-xs text-tafera-text-muted">
              © {new Date().getFullYear()} Tafera. Travel-focused social platform.
            </p>
          </div>
          <nav aria-label="Footer navigation" className="w-full md:w-auto">
            <ul className="flex flex-wrap gap-x-5 gap-y-2.5 md:gap-6">
              {FOOTER_LINKS.map((link) => (
                <li key={link.to}>
                  <a
                    href={link.to.startsWith('/') ? '#' : link.to}
                    className="text-sm text-tafera-text-muted transition-colors hover:text-tafera-primary"
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
