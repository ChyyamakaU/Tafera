import { Link } from 'react-router-dom'

export default function TrustStrip() {
  return (
    <section className="border-t border-tafera-border bg-tafera-surface py-4">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-tafera-text-muted">
          <span className="flex items-center gap-2 font-medium text-tafera-text">
            <span className="w-1 h-1 rounded-full bg-tafera-accent" />
            Verified by Tafera
          </span>
          <Link
            to="/trust-and-safety"
            className="font-medium transition-colors hover:text-tafera-accent"
          >
            Trust and Safety
          </Link>
        </div>
      </div>
    </section>
  )
}
