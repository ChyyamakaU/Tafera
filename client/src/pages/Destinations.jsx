import { Link } from 'react-router-dom'
import { Button } from '../components/common/Button'

const Icon = () => (
  <svg
    className="w-12 h-12 text-tafera-text-muted"
    fill="none"
    viewBox="0 0 24 24"
    stroke-width="1.5"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2h2.944M8 3.935v5.5A2 2 0 0010 11.5h5.5A2 2 0 0017.5 9.435V15m-7 6h5.555a2 2 0 002-1.225L20 9.75A2 2 0 0018.005 7H16"
    />
  </svg>
)

export default function Destinations() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-bold text-tafera-text sm:text-3xl">
          Destinations
        </h1>
        <p className="mt-2 text-tafera-text-muted">
          Browse and save travel destinations from around the world.
        </p>
      </div>

      <div className="rounded-lg border border-tafera-border bg-tafera-surface p-10 shadow-soft">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Icon />
          <h2 className="mt-4 text-lg font-heading font-bold text-tafera-text">
            Coming soon
          </h2>
          <p className="mt-3 text-tafera-text-muted max-w-sm">
            Destination browsing and discovery will be available here. Explore
            curated destinations, view details, and save places you want to
            visit.
          </p>
        </div>
      </div>

      <div className="mt-10 flex justify-end">
        <Link to="/">
          <Button variant="ghost">Back to home</Button>
        </Link>
      </div>
    </div>
  )
}
