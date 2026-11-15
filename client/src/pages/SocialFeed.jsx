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
      d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5h-4m4-4H4m4 4H4m0 6h4m4-4h4m4 4h4"
    />
  </svg>
)

export default function SocialFeed() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-bold text-tafera-text sm:text-3xl">
          Social Feed
        </h1>
        <p className="mt-2 text-tafera-text-muted">
          Share updates and connect with your travel community.
        </p>
      </div>

      <div className="rounded-lg border border-tafera-border bg-tafera-surface p-10 shadow-soft">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Icon />
          <h2 className="mt-4 text-lg font-heading font-bold text-tafera-text">
            Coming soon
          </h2>
          <p className="mt-3 text-tafera-text-muted max-w-sm">
            The social feed will be available here. Share travel updates,
            follow other travellers, and engage with posts.
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
