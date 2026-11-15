import { Link } from 'react-router-dom'
import { Button } from '../components/common/Button'

export default function Registration() {
  return (
    <div className="max-w-md mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-bold text-tafera-text sm:text-3xl">
          Create an account
        </h1>
        <p className="mt-2 text-tafera-text-muted">
          Join Tafera and start planning your journeys.
        </p>
      </div>

      <form className="rounded-lg border border-tafera-border bg-tafera-surface p-8 shadow-soft space-y-6" onSubmit={(e) => e.preventDefault()}>
        <div>
          <label htmlFor="fullName" className="block text-sm font-medium text-tafera-text mb-1">
            Full name
          </label>
          <input
            id="fullName"
            type="text"
            autoComplete="name"
            required
            className="w-full px-4 py-2 rounded-lg border border-tafera-border focus:ring-2 focus:ring-tafera-primary focus:border-tafera-primary outline-none transition-colors"
            placeholder="Ada Lovelace"
          />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-tafera-text mb-1">
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            className="w-full px-4 py-2 rounded-lg border border-tafera-border focus:ring-2 focus:ring-tafera-primary focus:border-tafera-primary outline-none transition-colors"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-tafera-text mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            className="w-full px-4 py-2 rounded-lg border border-tafera-border focus:ring-2 focus:ring-tafera-primary focus:border-tafera-primary outline-none transition-colors"
            placeholder="••••••••"
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          className="w-full"
          disabled
        >
          Create account
        </Button>
        <p className="mt-4 text-sm text-center text-tafera-text-muted">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-tafera-primary hover:underline">
            Log in
          </Link>
        </p>
      </form>

      <div className="mt-10 flex justify-end">
        <Link to="/">
          <Button variant="ghost">Back to home</Button>
        </Link>
      </div>
    </div>
  )
}
