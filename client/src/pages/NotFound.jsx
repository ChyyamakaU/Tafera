import { Link } from 'react-router-dom'
import { Button } from '../components/common/Button'

export default function NotFound() {
  return (
    <div className="app-container max-w-2xl mx-auto">
      <div className="mb-8 text-center">
        <h1 className="text-6xl font-heading font-bold text-tafera-primary">
          404
        </h1>
        <h2 className="mt-2 text-2xl font-heading font-bold text-tafera-text">
          Page not found
        </h2>
        <p className="mt-4 text-tafera-text-muted">
          Sorry, we couldn&rsquo;t find the page you&rsquo;re looking for.
        </p>
      </div>

      <div className="rounded-lg border border-tafera-border bg-tafera-surface p-10 shadow-soft text-center">
        <Link
          to="/"
          className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-tafera-primary text-tafera-on-primary font-semibold transition-colors hover:bg-tafera-primary/90"
        >
          Return to home
        </Link>
      </div>
    </div>
  )
}
