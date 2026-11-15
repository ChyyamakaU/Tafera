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
      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.127-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.127-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
    />
  </svg>
)

export default function GroupTravel() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-bold text-tafera-text sm:text-3xl">
          Group Travel
        </h1>
        <p className="mt-2 text-tafera-text-muted">
          Join or create group trips and coordinate with fellow travellers.
        </p>
      </div>

      <div className="rounded-lg border border-tafera-border bg-tafera-surface p-10 shadow-soft">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Icon />
          <h2 className="mt-4 text-lg font-heading font-bold text-tafera-text">
            Coming soon
          </h2>
          <p className="mt-3 text-tafera-text-muted max-w-sm">
            Group travel coordination will be available here. Join group trips,
            see participants, and manage shared itineraries.
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
