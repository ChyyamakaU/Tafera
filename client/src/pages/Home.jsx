import { Link } from 'react-router-dom'
import { Button } from '../components/common/Button'

const FEATURES = [
  {
    title: 'Discover destinations',
    description:
      'Explore curated travel destinations and plan your next adventure.',
  },
  {
    title: 'Plan your trips',
    description:
      'Organise itineraries, dates, and travel details in one place.',
  },
  {
    title: 'Travel with others',
    description:
      'Join group trips and coordinate with fellow travellers.',
  },
  {
    title: 'Keep a scrapbook',
    description:
      'Collect photos and memories from every journey.',
  },
]

export default function Home() {
  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="relative px-6 py-16 sm:px-8 sm:py-24 lg:py-32 rounded-xl bg-tafera-primary overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded bg-tafera-secondary px-3 py-1 text-xs font-semibold text-white tracking-wider uppercase">
            Tafera
          </span>
          <h1 className="mt-4 text-3xl sm:text-5xl font-heading font-bold tracking-tight leading-tight text-white">
            Explore Beyond the Familiar.
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-tafera-bg/90 max-w-xl leading-relaxed">
            The travel-focused social platform for discovering destinations,
            organising trips, and sharing authentic memories with fellow
            travellers.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4">
            <Link
              to="/destinations"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-tafera-secondary text-white font-semibold text-sm transition-colors hover:bg-tafera-secondary/90 sm:text-base"
            >
              Explore destinations
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg border border-white/30 bg-white/10 text-white font-semibold text-sm transition-colors hover:bg-white/20 sm:text-base"
            >
              Create an account
            </Link>
          </div>
        </div>
        {/* Decorative organic accents */}
        <div className="absolute -top-16 -right-16 w-64 h-64 bg-tafera-secondary rounded-full blur-[100px] opacity-60" aria-hidden="true" />
        <div className="absolute -bottom-20 -left-20 w-72 h-72 bg-white rounded-full blur-[100px] opacity-40" aria-hidden="true" />
      </section>

      {/* Features */}
      <section>
        <div className="text-center max-w-3xl mx-auto">
          <h2 className="text-2xl font-heading font-bold text-tafera-text sm:text-3xl">
            What you can do on Tafera
          </h2>
          <p className="mt-4 text-tafera-text-muted max-w-xl mx-auto leading-relaxed">
            A place for every part of your journey — from inspiration to
            memories.
          </p>
        </div>
        <ul className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map((feature) => (
            <li
              key={feature.title}
              className="p-8 rounded-lg bg-tafera-surface border border-tafera-border shadow-soft"
            >
              <h3 className="text-lg font-heading font-bold text-tafera-text">
                {feature.title}
              </h3>
              <p className="mt-3 text-sm text-tafera-text-muted leading-relaxed">
                {feature.description}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* Getting started */}
      <section className="grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <h2 className="text-2xl font-heading font-bold text-tafera-text sm:text-3xl">
            Start exploring
          </h2>
          <p className="mt-4 text-tafera-text-muted leading-relaxed">
            Browse destinations, build trip itineraries, join group travels,
            stay social with your travel circle, and build your personal
            scrapbook — all in one place.
          </p>
          <ul className="mt-8 space-y-4 text-tafera-text-muted">
            <li className="flex items-center gap-3">
              <span className="text-tafera-primary">✓</span>
              Discover and save travel destinations
            </li>
            <li className="flex items-center gap-3">
              <span className="text-tafera-primary">✓</span>
              Organise trips and itineraries
            </li>
            <li className="flex items-center gap-3">
              <span className="text-tafera-primary">✓</span>
              Join or create group trips
            </li>
            <li className="flex items-center gap-3">
              <span className="text-tafera-primary">✓</span>
              Share a social feed with fellow travellers
            </li>
            <li className="flex items-center gap-3">
              <span className="text-tafera-primary">✓</span>
              Keep a photo scrapbook of your journeys
            </li>
          </ul>
        </div>
        <div className="flex justify-center">
          <div className="rounded-lg border border-tafera-border bg-tafera-surface p-8 shadow-soft w-full max-w-xs text-center">
            <span className="inline-flex items-center gap-2 rounded bg-tafera-primary/10 px-3 py-1 text-xs font-semibold text-tafera-primary">
              New to Tafera?
            </span>
            <Link
              to="/register"
              className="mt-4 block w-full"
            >
              <Button variant="secondary" className="w-full">
                Create your account
              </Button>
            </Link>
            <p className="mt-4 text-xs text-tafera-text-muted">
              Already have an account?{' '}
              <Link to="/login" className="font-medium text-tafera-primary hover:underline">
                Log in
              </Link>
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
