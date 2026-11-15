import { Link } from 'react-router-dom'
import { Button } from '../components/common/Button'

export default function Login() {
  return (
    <div className="max-w-md mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-bold text-tafera-text sm:text-3xl">
          Log in
        </h1>
        <p className="mt-2 text-tafera-text-muted">
          Sign in to your Tafera account to continue.
        </p>
      </div>

      <form className="rounded-lg border border-tafera-border bg-tafera-surface p-8 shadow-soft space-y-6" onSubmit={(e) => e.preventDefault()}>
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
            autoComplete="current-password"
            required
            className="w-full px-4 py-2 rounded-lg border border-tafera-border focus:ring-2 focus:ring-tafera-primary focus:border-tafera-primary outline-none transition-colors"
            placeholder="••••••••"
          />
        </div>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-tafera-text-muted cursor-pointer">
            <input type="checkbox" className="rounded border-tafera-border text-tafera-primary focus:ring-tafera-primary" />
            Remember me
          </label>
          <Link to="/" className="text-sm text-tafera-primary hover:underline font-medium">
            Forgot password?
          </Link>
        </div>
        <Button
          type="submit"
          variant="primary"
          className="w-full"
          disabled
        >
          Log in
        </Button>
        <p className="mt-4 text-sm text-center text-tafera-text-muted">
          Don't have an account?{' '}
          <Link to="/register" className="font-medium text-tafera-primary hover:underline">
            Create an account
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
