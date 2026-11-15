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
      d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3"
    />
  </svg>
)

export default function Trips() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-bold text-tafera-text sm:text-3xl">
          Trips
        </h1>
        <p className="mt-2 text-tafera-text-muted">
          Organise your itineraries, travel dates, and trip details.
        </p>
      </div>

      <div className="rounded-lg border border-tafera-border bg-tafera-surface p-10 shadow-soft">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Icon />
          <h2 className="mt-4 text-lg font-heading font-bold text-tafera-text">
            Coming soon
          </h2>
          <p className="mt-3 text-tafera-text-muted max-w-sm">
            Trip planning and itineraries will be available here. Create trips,
            set dates, add stops, and organise your travel schedule.
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
